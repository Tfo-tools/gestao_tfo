import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarProximosEventos } from "@/lib/google-calendar";

/**
 * Agenda combinada (contato@ + agenda pessoal de qualquer sócia conectada) num JSON simples — é o
 * que alimenta o lembrete local (script no Mac que dispara WhatsApp/notificação, já que essas duas
 * agendas não estão sincronizadas no Calendário do sistema). Consulta todas as conexões salvas em
 * vez de fixar quem é sócia, pra continuar funcionando sozinho se mais alguém conectar a agenda
 * pessoal dela depois.
 */
export const dynamic = "force-dynamic";

const DIAS_A_FRENTE = 2;

type EventoAgenda = {
  id: string;
  titulo: string;
  local: string | null;
  inicioIso: string;
  fimIso: string;
  diaTodo: boolean;
  /** De qual agenda esse compromisso veio — "Compartilhada (contato)" quando existe lá (é o caso
   * de toda reunião marcada, que pertence às duas sócias, mesmo espelhada na agenda pessoal de
   * quem foi convidada), senão o nome de quem é a agenda pessoal. */
  origem: string;
};

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.ICS_FEED_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const [{ data: conexoes }, { data: perfis }] = await Promise.all([
    supabase.from("google_calendar_conexao").select("profile_id"),
    supabase.from("profiles").select("id, nome"),
  ]);
  const nomePorPerfil = new Map((perfis ?? []).map((p) => [p.id, p.nome]));

  // Compartilhada primeiro: toda reunião marcada convida as duas sócias, e o Google espelha o
  // mesmo evento na agenda pessoal de quem foi convidada — processando a compartilhada antes, o
  // dedup abaixo mantém essa origem (mais correta pra um compromisso que é das duas) em vez de
  // rotular como agenda pessoal de quem apareceu primeiro por acaso.
  const conexoesOrdenadas = [...(conexoes ?? [])].sort((a, b) => (a.profile_id === null ? -1 : 0) - (b.profile_id === null ? -1 : 0));

  const listas = await Promise.all(
    conexoesOrdenadas.map(async (c) => ({
      origem: c.profile_id === null ? "Compartilhada (contato)" : (nomePorPerfil.get(c.profile_id) ?? "Agenda pessoal"),
      eventos: await listarProximosEventos(DIAS_A_FRENTE, 50, c.profile_id),
    })),
  );

  // iCalUID é estável entre a cópia do organizador e a de cada convidado do MESMO evento —
  // diferente de `id`, que só é único dentro de um calendário — por isso dá pra reconhecer que é
  // o mesmo compromisso vindo de mais de uma conexão e listar só uma vez.
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
  eventos.sort((a, b) => a.inicioIso.localeCompare(b.inicioIso));

  return NextResponse.json({ eventos }, { headers: { "Cache-Control": "no-store" } });
}
