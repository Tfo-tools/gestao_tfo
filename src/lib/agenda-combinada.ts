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
  /** De quem é a agenda de origem: null = compartilhada (de todas); senão o id do perfil dono. Usado
   * para filtrar o feed por pessoa (cada uma recebe a compartilhada + a dela). */
  profileId: string | null;
};

const FUSO = "America/Sao_Paulo";

/** Resolve com o fallback se a promessa demorar além de `ms` ou falhar — uma fonte lenta (Google numa
 * manhã de cold start) não pode pendurar o feed inteiro até o timeout da função. */
function comTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

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
        profileId: c.profile_id as string | null,
        // 8s por agenda: se o Google demorar, volta vazio e o resumo sai com o resto (pendências etc.).
        eventos: await comTimeout(listarProximosEventos(diasAFrente, 50, c.profile_id), 8000, []),
      })),
    ),
    comTimeout(eventosIcloudTodasSocias(agora, ate), 8000, []),
  ]);
  // iCloud (convite do marido etc.) entra por último, rotulado "Pessoal (nome)".
  const listas = [
    ...listasGoogle,
    ...[...new Set(icloud.map((e) => e.profileId))].map((pid) => ({
      origem: icloud.find((e) => e.profileId === pid)!.nomeDono,
      profileId: pid as string | null,
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
        profileId: lista.profileId,
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

export type Pendencia = { texto: string; venceHoje: boolean; quando: "atrasada" | "hoje" | "amanha"; /** Link curto que abre a tarefa no app (só tarefas). */ link?: string };

export type PerfilFeed = { id: string; nome: string; papel: string };

/** Resolve o parâmetro `usuario` do feed (id do perfil ou primeiro nome, sem diferenciar maiúsculas). */
export async function resolverPerfil(param: string | null): Promise<PerfilFeed | null> {
  const alvo = (param ?? "").trim().toLowerCase();
  if (!alvo) return null;
  const { data } = await createAdminClient().from("profiles").select("id, nome, papel");
  const achar = (data ?? []).find(
    (p) => p.id === param || String(p.nome ?? "").trim().split(" ")[0].toLowerCase() === alvo,
  );
  return achar ? { id: achar.id as string, nome: achar.nome as string, papel: (achar.papel as string) ?? "" } : null;
}

/** Compromissos que uma pessoa vê: a agenda compartilhada (de todas) + a agenda pessoal dela. */
export function eventosDoPerfil(eventos: EventoAgenda[], perfilId: string): EventoAgenda[] {
  return eventos.filter((e) => e.profileId === null || e.profileId === perfilId);
}

/** Filtro do feed por pessoa: tarefas só de quem é responsável/participa; contas só para sócias. */
export type FiltroPendencias = { perfilId?: string | null; contas?: boolean; tarefas?: boolean };

/** Endereço público do app, pra montar links que funcionam fora dele (WhatsApp, push). */
export function urlBaseApp(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://gestao.thefashionoffice.online").replace(/\/$/, "");
}

/** Link curto da tarefa: /t/<8 primeiros caracteres do id> — a rota /t resolve pelo prefixo e abre
 * /tarefas?tarefa=<id>. Curto o bastante pra não poluir a mensagem do WhatsApp. */
export function linkCurtoTarefa(id: string): string {
  return `${urlBaseApp()}/t/${id.slice(0, 8)}`;
}

/** Contas e faturas de cartão que vencem hoje ou amanhã, e tarefas abertas até amanhã — inclusive as
 * atrasadas: tarefa não some do resumo enquanto não for concluída, só muda de bloco. Mesmo recorte do
 * cron diário de lembretes, pra entrar no resumo da manhã junto com a agenda. */
export async function carregarPendencias(filtro: FiltroPendencias = {}): Promise<Pendencia[]> {
  const incluirContas = filtro.contas ?? true;
  const incluirTarefas = filtro.tarefas ?? true;
  const perfilId = filtro.perfilId ?? null;
  const supabase = createAdminClient();
  const hoje = dataLocal(new Date().toISOString());
  const amanha = dataLocal(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
  const dias = [hoje, amanha];

  const [{ data: despesas }, { data: parcelas }, { data: parcelasAtivo }, { data: tarefas }, { data: perfis }] = await Promise.all([
    supabase.from("despesas").select("descricao, valor_total, data_gasto").eq("comprovado", false).in("data_gasto", dias),
    supabase.from("despesa_parcelas").select("valor, data_prevista, despesas(descricao)").eq("status", "prevista").in("data_prevista", dias),
    supabase.from("ativo_parcelas").select("valor, data_prevista, ativos(descricao)").eq("status", "prevista").in("data_prevista", dias),
    supabase.from("tarefas").select("id, titulo, prazo, responsavel_id, participantes, parent_id").neq("status", "feito").lte("prazo", amanha).order("prazo"),
    supabase.from("profiles").select("id, nome"),
  ]);

  const nome = (rel: unknown): string | null => {
    const r = Array.isArray(rel) ? rel[0] : rel;
    return (r as { descricao?: string | null } | null)?.descricao ?? null;
  };

  const itens: Pendencia[] = [];
  for (const d of incluirContas ? (despesas ?? []) : []) {
    itens.push({ texto: `💰 ${d.descricao ?? "Conta"} — ${formatBRL(Number(d.valor_total))}`, venceHoje: d.data_gasto === hoje, quando: d.data_gasto === hoje ? "hoje" : "amanha" });
  }
  for (const p of incluirContas ? (parcelas ?? []) : []) {
    itens.push({ texto: `💳 ${nome(p.despesas) ?? "Compra no cartão"} — ${formatBRL(Number(p.valor))}`, venceHoje: p.data_prevista === hoje, quando: p.data_prevista === hoje ? "hoje" : "amanha" });
  }
  for (const p of incluirContas ? (parcelasAtivo ?? []) : []) {
    itens.push({ texto: `💳 ${nome(p.ativos) ?? "Ativo no cartão"} — ${formatBRL(Number(p.valor))}`, venceHoje: p.data_prevista === hoje, quando: p.data_prevista === hoje ? "hoje" : "amanha" });
  }
  // Tarefa vem com quem faz: responsável primeiro, depois quem participa — "Emyli + Vanessa".
  const primeiroNome = new Map(
    (perfis ?? []).map((p) => {
      const n = String(p.nome ?? "").split(" ")[0];
      return [p.id, n.charAt(0).toUpperCase() + n.slice(1)];
    }),
  );
  // Subtarefa com prazo: mostra a tarefa-mãe junto ("Mãe › atividade"), senão ninguém acha no app;
  // e se a mãe já está feita, a atividade não cobra mais ninguém.
  const maes = await carregarMaes((tarefas ?? []).map((t) => t.parent_id as string | null));
  for (const t of incluirTarefas ? (tarefas ?? []) : []) {
    const ids = [t.responsavel_id, ...((t.participantes as string[] | null) ?? [])].filter((id, i, arr): id is string => !!id && arr.indexOf(id) === i);
    // Filtro por pessoa: só entra se ela é a responsável ou participa.
    if (perfilId && !ids.includes(perfilId)) continue;
    const quem = ids.map((id) => primeiroNome.get(id)).filter(Boolean).join(" + ");
    if (!t.prazo) continue;
    const mae = t.parent_id ? maes.get(t.parent_id as string) : undefined;
    if (t.parent_id && mae?.status === "feito") continue;
    const atrasada = t.prazo < hoje;
    const diasAtraso = atrasada ? Math.round((new Date(`${hoje}T00:00:00Z`).getTime() - new Date(`${t.prazo}T00:00:00Z`).getTime()) / 86400000) : 0;
    const marca = atrasada ? ` (há ${diasAtraso} ${diasAtraso === 1 ? "dia" : "dias"})` : "";
    itens.push({
      texto: `✅ ${rotuloTarefa(t.titulo, mae?.titulo)}${quem ? ` — ${quem}` : ""}${marca}`,
      venceHoje: t.prazo === hoje,
      quando: atrasada ? "atrasada" : t.prazo === hoje ? "hoje" : "amanha",
      link: linkCurtoTarefa(t.id as string),
    });
  }
  return itens;
}

/** "Mãe › atividade" quando é subtarefa; só o título quando é tarefa. */
export function rotuloTarefa(titulo: string, tituloMae?: string | null): string {
  return tituloMae ? `${tituloMae} › ${titulo}` : titulo;
}

/** Título e status das tarefas-mãe das subtarefas listadas (uma consulta só). */
export async function carregarMaes(parentIds: (string | null)[]): Promise<Map<string, { titulo: string; status: string }>> {
  const ids = [...new Set(parentIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const { data } = await createAdminClient().from("tarefas").select("id, titulo, status").in("id", ids);
  return new Map((data ?? []).map((m) => [m.id as string, { titulo: m.titulo as string, status: m.status as string }]));
}

/**
 * Mensagem da manhã. `comLinks`: cada tarefa ganha o link curto numa linha abaixo — no WhatsApp não
 * existe "clique aqui" com hiperlink escondido, só o endereço mesmo vira clicável. No push fica sem
 * (a notificação já abre o app).
 */
export function textoResumoHoje(eventos: EventoAgenda[], pendencias: Pendencia[] = [], opcoes: { comLinks?: boolean } = {}) {
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
  const linha = (p: Pendencia) => (opcoes.comLinks && p.link ? `${p.texto}\n   ↳ ${p.link}` : p.texto);
  if (atrasadas.length > 0) blocos.push(`⚠️ Atrasadas (ficam aqui até concluir):\n${atrasadas.map(linha).join("\n")}`);
  if (vencemHoje.length > 0) blocos.push(`Vence hoje:\n${vencemHoje.map(linha).join("\n")}`);
  if (vencemAmanha.length > 0) blocos.push(`Vence amanhã:\n${vencemAmanha.map(linha).join("\n")}`);

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
