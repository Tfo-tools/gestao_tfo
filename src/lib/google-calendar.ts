import { createAdminClient } from "@/lib/supabase/admin";

// userinfo.email é só pra descobrir qual conta autorizou (mostrar "conectado como fulana@...") —
// sem esse escopo o Google recusa a chamada ao userinfo e a conta fica salva como "desconhecido".
const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** "shared" é a conta contato@ — calendário de origem de toda reunião marcada pelo link público
 * de agendamento. "pessoal" é a agenda da própria sócia logada, só pra visualização — nunca cria
 * evento nela. */
export type TipoConexaoGoogle = "shared" | "pessoal";

function redirectUri() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://gestaotfo.vercel.app";
  return `${base}/api/google/callback`;
}

export function googleConfigurado() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function urlAutorizacaoGoogle(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function trocarCodigoPorTokens(code: string) {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!resp.ok) throw new Error(`Falha ao trocar código por tokens: ${await resp.text()}`);
  return (await resp.json()) as { access_token: string; refresh_token?: string; expires_in: number };
}

/** Lê a conexão salva (a compartilhada quando profileId é null, ou a pessoal de quem tem esse id)
 * e devolve um access_token válido, renovando via refresh_token quando expirado. `null` quando
 * essa conexão específica ainda não existe. */
async function obterAccessTokenValido(profileId: string | null): Promise<string | null> {
  const admin = createAdminClient();
  const query = admin.from("google_calendar_conexao").select("*");
  const { data: conexao } = await (profileId ? query.eq("profile_id", profileId) : query.is("profile_id", null)).maybeSingle();
  if (!conexao) return null;

  const expiraEm = conexao.access_token_expira_em ? new Date(conexao.access_token_expira_em).getTime() : 0;
  if (conexao.access_token && expiraEm > Date.now() + 60_000) {
    return conexao.access_token;
  }

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: conexao.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) return null;
  const dados = (await resp.json()) as { access_token: string; expires_in: number };

  await admin
    .from("google_calendar_conexao")
    .update({
      access_token: dados.access_token,
      access_token_expira_em: new Date(Date.now() + dados.expires_in * 1000).toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", conexao.id);

  return dados.access_token;
}

/** `profileId` null = conexão compartilhada (contato@); um id = a conexão pessoal daquela sócia. */
export async function contaGoogleConectada(profileId: string | null = null): Promise<string | null> {
  const admin = createAdminClient();
  const query = admin.from("google_calendar_conexao").select("conta_email");
  const { data } = await (profileId ? query.eq("profile_id", profileId) : query.is("profile_id", null)).maybeSingle();
  return data?.conta_email ?? null;
}

export async function desconectarGoogle(profileId: string | null): Promise<void> {
  const admin = createAdminClient();
  const query = admin.from("google_calendar_conexao").delete();
  await (profileId ? query.eq("profile_id", profileId) : query.is("profile_id", null));
}

/** Cria o evento no calendário da conta compartilhada (contato@thefashionoffice.com.br) e convida
 * os participantes — cada convidado recebe e-mail do Google e o compromisso aparece automaticamente
 * na agenda de quem aceitar. Devolve o id do evento (pra permitir cancelar depois) ou null se a
 * conta Google ainda não foi conectada. Sempre a conexão compartilhada — nunca cria evento na
 * agenda pessoal de ninguém. */
export async function criarEventoReuniao(input: {
  titulo: string;
  descricao: string;
  inicioIso: string;
  fimIso: string;
  timeZone: string;
  emailsConvidados: string[];
}): Promise<string | null> {
  const accessToken = await obterAccessTokenValido(null);
  if (!accessToken) return null;

  const resp = await fetch(`${EVENTS_URL}?sendUpdates=all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: input.titulo,
      description: input.descricao,
      start: { dateTime: input.inicioIso, timeZone: input.timeZone },
      end: { dateTime: input.fimIso, timeZone: input.timeZone },
      attendees: input.emailsConvidados.map((email) => ({ email })),
    }),
  });
  if (!resp.ok) {
    console.error("Erro ao criar evento no Google Calendar:", await resp.text());
    return null;
  }
  const evento = (await resp.json()) as { id: string };
  return evento.id;
}

export async function cancelarEventoReuniao(googleEventId: string): Promise<void> {
  const accessToken = await obterAccessTokenValido(null);
  if (!accessToken) return;
  await fetch(`${EVENTS_URL}/${googleEventId}?sendUpdates=all`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export type EventoGoogle = {
  id: string;
  /** Estável entre a cópia do organizador e a cópia de cada convidado do MESMO evento — ao
   * contrário de `id`, que é só único dentro de um calendário. Usado pra reconhecer que um
   * compromisso da agenda compartilhada e um da agenda pessoal são, na real, o mesmo evento (a
   * pessoa foi convidada, o Google espelha na agenda dela) — sem isso a tela mostra os dois. */
  iCalUID: string;
  titulo: string;
  descricao: string | null;
  local: string | null;
  inicioIso: string;
  fimIso: string;
  diaTodo: boolean;
  convidados: { email: string; nome: string | null; status: string }[];
};

type EventoGoogleBruto = {
  id: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string; organizer?: boolean }[];
};

/** Busca os eventos de uma conexão (compartilhada ou pessoal) dentro da janela — serve tanto pra
 * listar "próximos compromissos" nas telas internas quanto pra calcular horários ocupados na hora
 * de montar os slots de agendamento público (não usa o endpoint separado de freeBusy pra não
 * precisar pedir um escopo OAuth novo, já que "calendar.events" já dá acesso de leitura). */
async function listarEventosBrutos(
  profileId: string | null,
  timeMinIso: string,
  timeMaxIso: string,
  maxResults = 250,
): Promise<EventoGoogleBruto[]> {
  const accessToken = await obterAccessTokenValido(profileId);
  if (!accessToken) return [];

  const params = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const resp = await fetch(`${EVENTS_URL}?${params.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    console.error("Erro ao listar eventos do Google Calendar:", await resp.text());
    return [];
  }
  const dados = (await resp.json()) as { items?: EventoGoogleBruto[] };
  return (dados.items ?? []).filter((ev) => ev.status !== "cancelled");
}

/** `profileId` null lista a agenda compartilhada (contato@); um id lista a agenda pessoal daquela
 * sócia — nos dois casos só leitura, nunca cria ou altera nada nela. */
export async function listarProximosEventos(diasAFrente: number, maxResults = 20, profileId: string | null = null): Promise<EventoGoogle[]> {
  const agora = new Date();
  const ate = new Date(agora.getTime() + diasAFrente * 24 * 60 * 60 * 1000);
  const brutos = await listarEventosBrutos(profileId, agora.toISOString(), ate.toISOString(), maxResults);
  return brutos.map((ev) => ({
    id: ev.id,
    iCalUID: ev.iCalUID ?? ev.id,
    titulo: ev.summary ?? "(sem título)",
    descricao: ev.description ?? null,
    local: ev.location ?? null,
    inicioIso: (ev.start?.dateTime ?? ev.start?.date) as string,
    fimIso: (ev.end?.dateTime ?? ev.end?.date) as string,
    diaTodo: !ev.start?.dateTime,
    convidados: (ev.attendees ?? [])
      .filter((a) => !a.organizer)
      .map((a) => ({ email: a.email, nome: a.displayName ?? null, status: a.responseStatus ?? "needsAction" })),
  }));
}

/** Períodos ocupados no calendário COMPARTILHADO (independente de terem sido criados por aqui ou
 * não) — cruza com a disponibilidade na hora de montar os horários livres pro agendamento público,
 * pra não oferecer um horário que já tem outro compromisso marcado direto no Google. Ignora eventos
 * marcados como "Livre" (transparency: transparent) e eventos de dia inteiro. */
export async function periodosOcupadosGoogle(diasAFrente: number): Promise<{ data_hora_inicio: string; data_hora_fim: string }[]> {
  const agora = new Date();
  const ate = new Date(agora.getTime() + diasAFrente * 24 * 60 * 60 * 1000);
  const brutos = await listarEventosBrutos(null, agora.toISOString(), ate.toISOString(), 250);
  return brutos
    .filter((ev) => ev.transparency !== "transparent" && ev.start?.dateTime && ev.end?.dateTime)
    .map((ev) => ({ data_hora_inicio: ev.start!.dateTime!, data_hora_fim: ev.end!.dateTime! }));
}
