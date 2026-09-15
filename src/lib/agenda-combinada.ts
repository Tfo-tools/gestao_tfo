import { createAdminClient } from "@/lib/supabase/admin";
import { listarProximosEventos } from "@/lib/google-calendar";

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

  const listas = await Promise.all(
    conexoesOrdenadas.map(async (c) => ({
      origem: c.profile_id === null ? "Compartilhada (contato)" : (nomePorPerfil.get(c.profile_id) ?? "Agenda pessoal"),
      eventos: await listarProximosEventos(diasAFrente, 50, c.profile_id),
    })),
  );

  // iCalUID é estável entre a cópia do organizador e a de cada convidado do MESMO evento —
  // diferente de `id`, que só é único dentro de um calendário.
  const vistos = new Set<string>();
  const eventos: EventoAgenda[] = [];
  for (const lista of listas) {
    for (const ev of lista.eventos) {
      if (vistos.has(ev.iCalUID)) continue;
      vistos.add(ev.iCalUID);
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

export function textoResumoHoje(eventos: EventoAgenda[]) {
  const deHoje = eventosDeHoje(eventos);
  if (deHoje.length === 0) return "☀️ Bom dia! Nenhum compromisso na agenda hoje.";
  const linhas = deHoje.map((e) => `${e.diaTodo ? "Dia todo" : horaLocal(e.inicioIso)} — ${e.titulo} (${e.origem})`);
  return `☀️ Bom dia! Compromissos de hoje:\n${linhas.join("\n")}`;
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
