import { createAdminClient } from "@/lib/supabase/admin";
import { listarProximosEventos } from "@/lib/google-calendar";
import { eventosIcloudTodasSocias } from "@/lib/agenda-icloud";

/**
 * Agenda combinada: contato@ + agenda pessoal de qualquer sócia conectada, sem repetir compromisso.
 * Alimenta o feed lido pelo Atalho do iPhone/script do Mac e o cron de lembrete push. Consulta todas
 * as conexões salvas em vez de fixar quem é sócia — passa a incluir a agenda da Emyli sozinho no dia
 * em que ela conectar.
 */

export type EventoAgenda = {
  id: string;
  titulo: string;
  local: string | null;
  inicioIso: string;
  fimIso: string;
  diaTodo: boolean;
  /** "Compartilhada (contato)" quando existe lá (toda reunião marcada, que é das duas sócias, mesmo
   * espelhada na agenda pessoal de quem foi convidada), senão o nome de quem é a agenda pessoal. */
  origem: string;
};

const FUSO = "America/Sao_Paulo";

export async function carregarAgendaCombinada(diasAFrente = 2): Promise<EventoAgenda[]> {
  const supabase = createAdminClient();
  const [{ data: conexoes }, { data: perfis }] = await Promise.all([
    supabase.from("google_calendar_conexao").select("profile_id"),
    supabase.from("profiles").select("id, nome"),
  ]);
  const nomePorPerfil = new Map((perfis ?? []).map((p) => [p.id, p.nome]));

  // Compartilhada primeiro: o dedup abaixo mantém a origem da primeira ocorrência, e pra um
  // compromisso que existe nas duas (convite espelhado) o rótulo certo é o da compartilhada.
  const conexoesOrdenadas = [...(conexoes ?? [])].sort((a, b) => (a.profile_id === null ? -1 : 0) - (b.profile_id === null ? -1 : 0));

  const agora = new Date();
  const ate = new Date(agora.getTime() + diasAFrente * 24 * 60 * 60 * 1000);
  const [listasGoogle, icloud] = await Promise.all([
    Promise.all(
      conexoesOrdenadas.map(async (c) => ({
        origem: c.profile_id === null ? "Compartilhada (contato)" : (nomePorPerfil.get(c.profile_id) ?? "Agenda pessoal"),
        eventos: await listarProximosEventos(diasAFrente, 50, c.profile_id),
      })),
    ),
    eventosIcloudTodasSocias(agora, ate),
  ]);
  // iCloud (convite do marido etc.) entra por último, rotulado "Pessoal (nome)".
  const listas = [
    ...listasGoogle,
    ...[...new Set(icloud.map((e) => e.profileId))].map((pid) => ({
      origem: icloud.find((e) => e.profileId === pid)!.nomeDono,
      eventos: icloud.filter((e) => e.profileId === pid),
    })),
  ];

  // iCalUID é estável entre a cópia do organizador e a de cada convidado do MESMO evento —
  // diferente de `id`, que só é único dentro de um calendário.
  // Chave = iCalUID + início: evento recorrente repete o iCalUID em cada instância (Google e iCloud),
  // e só pelo UID a segunda semana em diante sumiria.
  const vistos = new Set<string>();
  const eventos: EventoAgenda[] = [];
  for (const lista of listas) {
    for (const ev of lista.eventos) {
      const chave = `${ev.iCalUID}|${ev.inicioIso}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      eventos.push({
        id: ev.iCalUID,
        titulo: ev.titulo,
        local: ev.local,
        inicioIso: ev.inicioIso,
        fimIso: ev.fimIso,
        diaTodo: ev.diaTodo,
        origem: lista.origem,
      });
    }
  }
  return eventos.sort((a, b) => a.inicioIso.localeCompare(b.inicioIso));
}

export function dataLocal(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: FUSO });
}

export function horaLocal(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
}

/** Hora local (São Paulo) em minutos desde meia-noite — pra decidir "já passou das 8h?". */
export function minutoLocalAgora() {
  const [h, m] = new Date().toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  return h * 60 + m;
}

export function eventosDeHoje(eventos: EventoAgenda[]) {
  const hoje = dataLocal(new Date().toISOString());
  return eventos.filter((e) => dataLocal(e.inicioIso) === hoje);
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type Pendencia = { texto: string; venceHoje: boolean; quando: "atrasada" | "hoje" | "amanha" };

/** Contas e faturas de cartão que vencem hoje ou amanhã, e tarefas abertas até amanhã — inclusive as
 * atrasadas: tarefa não some do resumo enquanto não for concluída, só muda de bloco. Mesmo recorte do
 * cron diário de lembretes, pra entrar no resumo da manhã junto com a agenda. */
export async function carregarPendencias(): Promise<Pendencia[]> {
  const supabase = createAdminClient();
  const hoje = dataLocal(new Date().toISOString());
  const amanha = dataLocal(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
  const dias = [hoje, amanha];

  const [{ data: despesas }, { data: parcelas }, { data: parcelasAtivo }, { data: tarefas }, { data: perfis }] = await Promise.all([
    supabase.from("despesas").select("descricao, valor_total, data_gasto").eq("comprovado", false).in("data_gasto", dias),
    supabase.from("despesa_parcelas").select("valor, data_prevista, despesas(descricao)").eq("status", "prevista").in("data_prevista", dias),
    supabase.from("ativo_parcelas").select("valor, data_prevista, ativos(descricao)").eq("status", "prevista").in("data_prevista", dias),
    supabase.from("tarefas").select("titulo, prazo, responsavel_id, participantes").neq("status", "feito").lte("prazo", amanha).order("prazo"),
    supabase.from("profiles").select("id, nome"),
  ]);

  const nome = (rel: unknown): string | null => {
    const r = Array.isArray(rel) ? rel[0] : rel;
    return (r as { descricao?: string | null } | null)?.descricao ?? null;
  };

  const itens: Pendencia[] = [];
  for (const d of despesas ?? []) {
    itens.push({ texto: `💰 ${d.descricao ?? "Conta"} — ${formatBRL(Number(d.valor_total))}`, venceHoje: d.data_gasto === hoje, quando: d.data_gasto === hoje ? "hoje" : "amanha" });
  }
  for (const p of parcelas ?? []) {
    itens.push({ texto: `💳 ${nome(p.despesas) ?? "Compra no cartão"} — ${formatBRL(Number(p.valor))}`, venceHoje: p.data_prevista === hoje, quando: p.data_prevista === hoje ? "hoje" : "amanha" });
  }
  for (const p of parcelasAtivo ?? []) {
    itens.push({ texto: `💳 ${nome(p.ativos) ?? "Ativo no cartão"} — ${formatBRL(Number(p.valor))}`, venceHoje: p.data_prevista === hoje, quando: p.data_prevista === hoje ? "hoje" : "amanha" });
  }
  // Tarefa vem com quem faz: responsável primeiro, depois quem participa — "Emyli + Vanessa".
  const primeiroNome = new Map(
    (perfis ?? []).map((p) => {
      const n = String(p.nome ?? "").split(" ")[0];
      return [p.id, n.charAt(0).toUpperCase() + n.slice(1)];
    }),
  );
  for (const t of tarefas ?? []) {
    const ids = [t.responsavel_id, ...((t.participantes as string[] | null) ?? [])].filter((id, i, arr): id is string => !!id && arr.indexOf(id) === i);
    const quem = ids.map((id) => primeiroNome.get(id)).filter(Boolean).join(" + ");
    if (!t.prazo) continue;
    const atrasada = t.prazo < hoje;
    const diasAtraso = atrasada ? Math.round((new Date(`${hoje}T00:00:00Z`).getTime() - new Date(`${t.prazo}T00:00:00Z`).getTime()) / 86400000) : 0;
    const marca = atrasada ? ` (há ${diasAtraso} ${diasAtraso === 1 ? "dia" : "dias"})` : "";
    itens.push({
      texto: `✅ ${t.titulo}${quem ? ` — ${quem}` : ""}${marca}`,
      venceHoje: t.prazo === hoje,
      quando: atrasada ? "atrasada" : t.prazo === hoje ? "hoje" : "amanha",
    });
  }
  return itens;
}

export function textoResumoHoje(eventos: EventoAgenda[], pendencias: Pendencia[] = []) {
  const deHoje = eventosDeHoje(eventos);
  const blocos: string[] = [];

  if (deHoje.length === 0) {
    blocos.push("☀️ Bom dia! Nenhum compromisso na agenda hoje.");
  } else {
    const linhas = deHoje.map((e) => `${e.diaTodo ? "Dia todo" : horaLocal(e.inicioIso)} — ${e.titulo} (${e.origem})`);
    blocos.push(`☀️ Bom dia! Compromissos de hoje:\n${linhas.join("\n")}`);
  }

  const atrasadas = pendencias.filter((p) => p.quando === "atrasada");
  const vencemHoje = pendencias.filter((p) => p.quando === "hoje");
  const vencemAmanha = pendencias.filter((p) => p.quando === "amanha");
  if (atrasadas.length > 0) blocos.push(`⚠️ Atrasadas (ficam aqui até concluir):\n${atrasadas.map((p) => p.texto).join("\n")}`);
  if (vencemHoje.length > 0) blocos.push(`Vence hoje:\n${vencemHoje.map((p) => p.texto).join("\n")}`);
  if (vencemAmanha.length > 0) blocos.push(`Vence amanhã:\n${vencemAmanha.map((p) => p.texto).join("\n")}`);

  return blocos.join("\n\n");
}

/** Um lembrete por compromisso de hoje, com o alerta já calculado (início − N min) — pro Atalho
 * do iPhone só percorrer a lista e chamar "Adicionar Novo Lembrete", sem fazer conta de data. */
export function lembretesDeHoje(eventos: EventoAgenda[], minutosAntes: number) {
  return eventosDeHoje(eventos)
    .filter((e) => !e.diaTodo)
    .map((e) => {
      const alerta = new Date(new Date(e.inicioIso).getTime() - minutosAntes * 60000);
      return {
        titulo: `⏰ ${horaLocal(e.inicioIso)} ${e.titulo} (${e.origem})`,
        alerta: alerta.toISOString(),
        // "HH:MM" local — é o que a ação "Criar Alarme" do Atalhos espera, sem converter data.
        hora: horaLocal(alerta.toISOString()),
      };
    });
}

export function minutosPara(ev: EventoAgenda) {
  return (new Date(ev.inicioIso).getTime() - Date.now()) / 60000;
}

export function eventosEmBreve(eventos: EventoAgenda[], minutos: number) {
  return eventos.filter((e) => {
    if (e.diaTodo) return false;
    const faltam = minutosPara(e);
    return faltam >= 0 && faltam <= minutos;
  });
}

export function textoEvento(ev: EventoAgenda) {
  const faltam = Math.max(0, Math.round(minutosPara(ev)));
  return `⏰ Em ${faltam} min: ${ev.titulo}${ev.local ? " — " + ev.local : ""} (${ev.origem})`;
}

export function textoProximos(eventos: EventoAgenda[], minutos: number) {
  return eventosEmBreve(eventos, minutos).map(textoEvento).join("\n");
}

/**
 * Hora (HH:MM local) do PRÓXIMO alarme que o iPhone deve criar: o alerta (início − N min) do
 * primeiro compromisso de hoje que ainda está a pelo menos 2 min no futuro. Quando não sobra
 * nenhum, devolve a hora-semente do dia seguinte — um alarme sem repetição marcado pra uma hora
 * já passada toca amanhã, e é assim que a corrente se reinicia sozinha todo dia.
 */
export function proximoAlarme(eventos: EventoAgenda[], minutosAntes: number, horaSemente: string) {
  const limite = Date.now() + 2 * 60000;
  const proximo = eventosDeHoje(eventos)
    .filter((e) => !e.diaTodo)
    .map((e) => new Date(e.inicioIso).getTime() - minutosAntes * 60000)
    .filter((t) => t >= limite)
    .sort((a, b) => a - b)[0];
  // Data completa com fuso, não "HH:MM" solto: texto de hora sem fuso o Atalhos converte
  // "adivinhando", e chegou a criar alarme 1h fora. Brasil não tem horário de verão — -03:00 fixo.
  // "dd/MM/yyyy HH:mm" em hora local: ISO com fuso o iPhone converteu 2h fora; formato brasileiro
  // por extenso ele lê como hora local, sem conversão.
  if (proximo) return dataHoraBrasil(new Date(proximo));
  const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${dataBrasil(amanha)} ${horaSemente}`;
}

function dataBrasil(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
}

function dataHoraBrasil(d: Date) {
  return `${dataBrasil(d)} ${horaLocal(d.toISOString())}`;
}
