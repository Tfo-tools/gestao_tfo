import { createAdminClient } from "@/lib/supabase/admin";
import type { EventoGoogle } from "@/lib/google-calendar";

/**
 * Lê o "Calendário Público" do iCloud de cada sócia (um link .ics só de leitura) — é onde caem os
 * compromissos que não estão em nenhuma conta Google, tipo convite do marido. Entra como
 * "Pessoal": bloqueia o link de agendamento e aparece no resumo/avisos. Parser mínimo de iCalendar:
 * eventos simples + recorrência DAILY/WEEKLY/MONTHLY/YEARLY (com INTERVAL, COUNT, UNTIL, EXDATE e
 * ocorrência alterada via RECURRENCE-ID). Brasil não
 * tem horário de verão, então hora local vira -03:00 fixo.
 */

const FUSO_OFFSET = "-03:00";

export type EventoIcloud = EventoGoogle & { transparente: boolean; profileId: string; nomeDono: string };

function normalizarUrl(url: string) {
  return url.trim().replace(/^webcal:\/\//i, "https://");
}

/** Desdobra linhas continuadas (RFC 5545: linha que começa com espaço/tab continua a anterior). */
function desdobrar(ics: string) {
  return ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}


type Prop = { nome: string; params: Record<string, string>; valor: string };

function lerProp(linha: string): Prop | null {
  const i = linha.indexOf(":");
  if (i < 0) return null;
  const [nomeEParams, ...resto] = [linha.slice(0, i), linha.slice(i + 1)];
  const [nome, ...params] = nomeEParams.split(";");
  const p: Record<string, string> = {};
  for (const par of params) {
    const [k, v] = par.split("=");
    if (k && v) p[k.toUpperCase()] = v;
  }
  return { nome: nome.toUpperCase(), params: p, valor: resto.join(":") };
}

/** "20260916T140000" (+TZID ou local) / "20260916T170000Z" / "20260916" → {iso, diaTodo, ms}. */
function lerData(p: Prop): { iso: string; diaTodo: boolean; ms: number } {
  const v = p.valor;
  if (p.params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    return { iso, diaTodo: true, ms: new Date(`${iso}T00:00:00${FUSO_OFFSET}`).getTime() };
  }
  const base = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:${v.slice(13, 15) || "00"}`;
  if (v.endsWith("Z")) {
    const ms = new Date(`${base}Z`).getTime();
    return { iso: paraIsoLocal(ms), diaTodo: false, ms };
  }
  // Com TZID (America/Sao_Paulo) ou "flutuante": trata como hora local do Brasil.
  const iso = `${base}${FUSO_OFFSET}`;
  return { iso, diaTodo: false, ms: new Date(iso).getTime() };
}

function paraIsoLocal(ms: number) {
  const d = new Date(ms - 3 * 60 * 60 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, FUSO_OFFSET);
}

const DIAS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Data local (-03:00) a partir de ano/mês(0-11)/dia + hora do dia em ms. */
function localMs(ano: number, mes0: number, dia: number, horaDoDiaMs: number) {
  return Date.UTC(ano, mes0, dia) + 3 * 3600000 + horaDoDiaMs;
}
const diasNoMes = (ano: number, mes0: number) => new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();

/**
 * Dias do mês em que a regra cai. BYMONTHDAY ("15", "-1" = último dia); BYDAY com ordinal ("2TU" =
 * 2ª terça, "-1FR" = última sexta) ou sem ("TU" = toda terça do mês); sem nenhum dos dois, o mesmo
 * dia do início (mês sem esse dia é pulado, como manda a RFC 5545). BYSETPOS escolhe entre eles.
 */
function diasDaRegraNoMes(ano: number, mes0: number, r: Record<string, string>, diaInicio: number): number[] {
  const total = diasNoMes(ano, mes0);
  let dias: number[] = [];
  if (r.BYMONTHDAY) {
    dias = r.BYMONTHDAY.split(",").map(Number).map((d) => (d < 0 ? total + d + 1 : d)).filter((d) => d >= 1 && d <= total);
  } else if (r.BYDAY) {
    for (const item of r.BYDAY.split(",")) {
      const m = item.match(/^([+-]?\d{1,2})?([A-Z]{2})$/);
      if (!m || DIAS[m[2]] === undefined) continue;
      const alvo = DIAS[m[2]];
      const doDia: number[] = [];
      for (let d = 1; d <= total; d++) if (new Date(Date.UTC(ano, mes0, d)).getUTCDay() === alvo) doDia.push(d);
      if (m[1]) {
        const n = Number(m[1]);
        const escolhido = n > 0 ? doDia[n - 1] : doDia[doDia.length + n];
        if (escolhido) dias.push(escolhido);
      } else dias.push(...doDia);
    }
  } else if (diaInicio <= total) {
    dias = [diaInicio];
  }
  dias = [...new Set(dias)].sort((a, b) => a - b);
  if (r.BYSETPOS && dias.length > 0) {
    dias = r.BYSETPOS.split(",")
      .map(Number)
      .map((pos) => (pos > 0 ? dias[pos - 1] : dias[dias.length + pos]))
      .filter((d): d is number => d !== undefined)
      .sort((a, b) => a - b);
  }
  return dias;
}

/**
 * Instâncias de uma recorrência dentro da janela: DAILY, WEEKLY, MONTHLY e YEARLY, com INTERVAL,
 * COUNT e UNTIL. COUNT conta desde o início (inclusive as ocorrências antes da janela), como na RFC.
 * `excluir` = EXDATE + as ocorrências que foram alteradas (RECURRENCE-ID), que vêm como evento à parte.
 * Antes MONTHLY/YEARLY davam só a primeira data — compromisso mensal que já tinha começado sumia.
 */
function expandir(inicioMs: number, duracaoMs: number, rrule: string | null, excluir: Set<number>, janelaIni: number, janelaFim: number) {
  const saida: number[] = [];
  const naJanela = (t: number) => t + duracaoMs >= janelaIni && t <= janelaFim;
  if (!rrule) {
    if (naJanela(inicioMs)) saida.push(inicioMs);
    return saida;
  }
  const r: Record<string, string> = {};
  for (const par of rrule.split(";")) {
    const [k, v] = par.split("=");
    if (k && v) r[k.toUpperCase()] = v.toUpperCase();
  }
  const freq = r.FREQ;
  const intervalo = Math.max(1, Number(r.INTERVAL || 1));
  const until = r.UNTIL ? lerData({ nome: "UNTIL", params: {}, valor: r.UNTIL }).ms : Infinity;
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const limite = Math.min(until, janelaFim);
  const dia = 24 * 60 * 60 * 1000;
  let n = 0;
  // Registra uma ocorrência: conta pro COUNT sempre; entra na saída se cair na janela e não foi excluída.
  const ocorrencia = (t: number): boolean => {
    if (t < inicioMs) return true;
    if (t > limite || n >= count) return false;
    n++;
    if (naJanela(t) && !excluir.has(t)) saida.push(t);
    return true;
  };

  if (freq === "DAILY") {
    for (let t = inicioMs; ; t += intervalo * dia) if (!ocorrencia(t)) break;
  } else if (freq === "WEEKLY") {
    const byday = r.BYDAY ? r.BYDAY.split(",").map((d) => DIAS[d.replace(/^[+-]?\d+/, "")]).filter((d) => d !== undefined) : [new Date(inicioMs - 3 * 3600000).getUTCDay()];
    const horaDoDia = inicioMs - new Date(paraIsoLocal(inicioMs).slice(0, 10) + `T00:00:00${FUSO_OFFSET}`).getTime();
    const primeiraSemana = new Date(paraIsoLocal(inicioMs).slice(0, 10) + `T00:00:00${FUSO_OFFSET}`).getTime();
    for (let semana = 0; ; semana++) {
      const baseSemana = primeiraSemana + semana * intervalo * 7 * dia;
      if (baseSemana > limite) break;
      const diaSemanaBase = new Date(baseSemana - 3 * 3600000).getUTCDay();
      // Ordena pelas DATAS da semana, não pelo número do dia — a semana começa no dia do 1º evento,
      // então "MO" pode cair depois de "WE" dentro da mesma semana.
      const datas = byday.map((d) => baseSemana + ((d - diaSemanaBase + 7) % 7) * dia + horaDoDia).sort((a, b) => a - b);
      let seguir = true;
      for (const t of datas) if (!(seguir = ocorrencia(t))) break;
      if (!seguir) break;
    }
  } else if (freq === "MONTHLY" || freq === "YEARLY") {
    const local = new Date(inicioMs - 3 * 3600000);
    const ano0 = local.getUTCFullYear();
    const mes00 = local.getUTCMonth();
    const diaInicio = local.getUTCDate();
    const horaDoDia = inicioMs - localMs(ano0, mes00, diaInicio, 0);
    const meses = freq === "YEARLY" && r.BYMONTH ? r.BYMONTH.split(",").map((m) => Number(m) - 1).sort((a, b) => a - b) : null;
    for (let passo = 0; passo < 1200; passo++) {
      let seguir = true;
      const periodos: [number, number][] =
        freq === "MONTHLY"
          ? [[ano0 + Math.floor((mes00 + passo * intervalo) / 12), (mes00 + passo * intervalo) % 12]]
          : (meses ?? [mes00]).map((m) => [ano0 + passo * intervalo, m] as [number, number]);
      if (localMs(periodos[0][0], periodos[0][1], 1, 0) > limite) break;
      for (const [ano, mes0] of periodos) {
        for (const d of diasDaRegraNoMes(ano, mes0, r, diaInicio)) if (!(seguir = ocorrencia(localMs(ano, mes0, d, horaDoDia)))) break;
        if (!seguir) break;
      }
      if (!seguir) break;
    }
  } else if (naJanela(inicioMs)) {
    saida.push(inicioMs);
  }
  return saida;
}

export async function lerEventosIcs(url: string, janelaIni: Date, janelaFim: Date): Promise<Omit<EventoIcloud, "profileId" | "nomeDono">[]> {
  const resp = await fetch(normalizarUrl(url), { cache: "no-store" });
  if (!resp.ok) return [];
  const texto = desdobrar(await resp.text());
  const eventos: Omit<EventoIcloud, "profileId" | "nomeDono">[] = [];
  const ini = janelaIni.getTime();
  const fim = janelaFim.getTime();

  const blocos = texto.split("BEGIN:VEVENT").slice(1).map((b) => b.split("END:VEVENT")[0]);
  // Ocorrência alterada no iPhone (mudou o horário de uma semana só) vem como VEVENT à parte, com o
  // mesmo UID e RECURRENCE-ID = a data original. A original sai da expansão — senão aparece duas vezes.
  const alteradas = new Map<string, Set<number>>();
  for (const corpo of blocos) {
    const uidLinha = corpo.split("\n").find((l) => l.toUpperCase().startsWith("UID"));
    const recLinha = corpo.split("\n").find((l) => l.toUpperCase().startsWith("RECURRENCE-ID"));
    const uidP = uidLinha ? lerProp(uidLinha) : null;
    const recP = recLinha ? lerProp(recLinha) : null;
    if (uidP && recP) {
      const set = alteradas.get(uidP.valor) ?? new Set<number>();
      set.add(lerData(recP).ms);
      alteradas.set(uidP.valor, set);
    }
  }

  for (const corpo of blocos) {
    let uid = "", rrule: string | null = null, transp = "OPAQUE", status = "";
    let dtstart: ReturnType<typeof lerData> | null = null, dtend: ReturnType<typeof lerData> | null = null;
    const exdates = new Set<number>();
    let ehAlteracao = false;
    for (const linha of corpo.split("\n")) {
      const p = lerProp(linha);
      if (!p) continue;
      if (p.nome === "UID") uid = p.valor;
      else if (p.nome === "DTSTART") dtstart = lerData(p);
      else if (p.nome === "DTEND") dtend = lerData(p);
      else if (p.nome === "RRULE") rrule = p.valor;
      else if (p.nome === "TRANSP") transp = p.valor.toUpperCase();
      else if (p.nome === "STATUS") status = p.valor.toUpperCase();
      else if (p.nome === "EXDATE") for (const v of p.valor.split(",")) exdates.add(lerData({ ...p, valor: v }).ms);
      else if (p.nome === "RECURRENCE-ID") ehAlteracao = true;
    }
    if (!dtstart || status === "CANCELLED") continue;
    const duracao = dtend ? dtend.ms - dtstart.ms : dtstart.diaTodo ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    // A ocorrência alterada é um evento avulso (sem regra); a regra da série exclui a data original.
    const excluir = new Set<number>([...exdates, ...(ehAlteracao ? [] : (alteradas.get(uid) ?? []))]);
    for (const t of expandir(dtstart.ms, duracao, ehAlteracao ? null : rrule, excluir, ini, fim)) {
      const inicioIso = dtstart.diaTodo ? paraIsoLocal(t).slice(0, 10) : paraIsoLocal(t);
      const fimIso = dtstart.diaTodo ? paraIsoLocal(t + duracao).slice(0, 10) : paraIsoLocal(t + duracao);
      // Título, local e descrição NUNCA saem do iCloud: o que o app (e as outras pessoas com acesso a
      // ele) veem é só "Compromisso pessoal" — o horário é o que importa pra bloquear e lembrar.
      eventos.push({
        id: `${uid}:${t}`,
        iCalUID: uid,
        titulo: "Compromisso pessoal",
        descricao: null,
        local: null,
        inicioIso,
        fimIso,
        diaTodo: dtstart.diaTodo,
        convidados: [],
        transparente: transp === "TRANSPARENT",
      });
    }
  }
  return eventos.sort((a, b) => a.inicioIso.localeCompare(b.inicioIso));
}

/** Eventos do iCloud de TODAS as sócias que cadastraram o link — cada um marcado com o dono. */
export async function eventosIcloudTodasSocias(janelaIni: Date, janelaFim: Date): Promise<EventoIcloud[]> {
  const admin = createAdminClient();
  const { data: perfis } = await admin.from("profiles").select("id, nome, ics_pessoal_url").not("ics_pessoal_url", "is", null);
  const listas = await Promise.all(
    (perfis ?? []).map(async (p) => {
      try {
        const evs = await lerEventosIcs(p.ics_pessoal_url as string, janelaIni, janelaFim);
        return evs.map((e) => ({ ...e, profileId: p.id, nomeDono: p.nome }));
      } catch {
        return [];
      }
    }),
  );
  return listas.flat();
}
