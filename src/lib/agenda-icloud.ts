import { createAdminClient } from "@/lib/supabase/admin";
import type { EventoGoogle } from "@/lib/google-calendar";

/**
 * Lê o "Calendário Público" do iCloud de cada sócia (um link .ics só de leitura) — é onde caem os
 * compromissos que não estão em nenhuma conta Google, tipo convite do marido. Entra como
 * "Pessoal": bloqueia o link de agendamento e aparece no resumo/avisos. Parser mínimo de iCalendar:
 * eventos simples + recorrência DAILY/WEEKLY (o que um calendário pessoal costuma ter). Brasil não
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

/** Instâncias de uma recorrência DAILY/WEEKLY dentro da janela. Outras frequências: só a primeira. */
function expandir(inicioMs: number, duracaoMs: number, rrule: string | null, exdates: Set<number>, janelaIni: number, janelaFim: number) {
  const saida: number[] = [];
  if (!rrule) {
    if (inicioMs + duracaoMs >= janelaIni && inicioMs <= janelaFim) saida.push(inicioMs);
    return saida;
  }
  const r: Record<string, string> = {};
  for (const par of rrule.split(";")) {
    const [k, v] = par.split("=");
    if (k && v) r[k.toUpperCase()] = v.toUpperCase();
  }
  const freq = r.FREQ;
  const intervalo = Number(r.INTERVAL || 1);
  const until = r.UNTIL ? lerData({ nome: "UNTIL", params: {}, valor: r.UNTIL }).ms : Infinity;
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const limite = Math.min(until, janelaFim);
  const dia = 24 * 60 * 60 * 1000;

  if (freq === "DAILY") {
    for (let n = 0, t = inicioMs; t <= limite && n < count; n++, t += intervalo * dia) {
      if (t + duracaoMs >= janelaIni && !exdates.has(t)) saida.push(t);
    }
  } else if (freq === "WEEKLY") {
    const byday = r.BYDAY ? r.BYDAY.split(",").map((d) => DIAS[d]).filter((d) => d !== undefined) : [new Date(inicioMs - 3 * 3600000).getUTCDay()];
    const horaDoDia = inicioMs - new Date(paraIsoLocal(inicioMs).slice(0, 10) + `T00:00:00${FUSO_OFFSET}`).getTime();
    const primeiraSemana = new Date(paraIsoLocal(inicioMs).slice(0, 10) + `T00:00:00${FUSO_OFFSET}`).getTime();
    let n = 0;
    for (let semana = 0; ; semana++) {
      const baseSemana = primeiraSemana + semana * intervalo * 7 * dia;
      if (baseSemana > limite) break;
      const diaSemanaBase = new Date(baseSemana - 3 * 3600000).getUTCDay();
      // Ordena pelas DATAS da semana, não pelo número do dia — a semana começa no dia do 1º evento,
      // então "MO" pode cair depois de "WE" dentro da mesma semana.
      const datas = byday.map((d) => baseSemana + ((d - diaSemanaBase + 7) % 7) * dia + horaDoDia).sort((a, b) => a - b);
      let passou = false;
      for (const t of datas) {
        if (t < inicioMs) continue;
        if (t > limite || n >= count) {
          passou = true;
          break;
        }
        n++;
        if (t + duracaoMs >= janelaIni && !exdates.has(t)) saida.push(t);
      }
      if (passou || n >= count) break;
    }
  } else {
    if (inicioMs + duracaoMs >= janelaIni && inicioMs <= janelaFim) saida.push(inicioMs);
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

  for (const bloco of texto.split("BEGIN:VEVENT").slice(1)) {
    const corpo = bloco.split("END:VEVENT")[0];
    let uid = "", rrule: string | null = null, transp = "OPAQUE", status = "";
    let dtstart: ReturnType<typeof lerData> | null = null, dtend: ReturnType<typeof lerData> | null = null;
    const exdates = new Set<number>();
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
    }
    if (!dtstart || status === "CANCELLED") continue;
    const duracao = dtend ? dtend.ms - dtstart.ms : dtstart.diaTodo ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    for (const t of expandir(dtstart.ms, duracao, rrule, exdates, ini, fim)) {
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
