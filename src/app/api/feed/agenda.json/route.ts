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

type EventoAgenda = { id: string; titulo: string; local: string | null; inicioIso: string; fimIso: string; diaTodo: boolean };

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.ICS_FEED_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: conexoes } = await supabase.from("google_calendar_conexao").select("profile_id");

  const listas = await Promise.all(
    (conexoes ?? []).map((c) => listarProximosEventos(DIAS_A_FRENTE, 50, c.profile_id)),
  );

  // Reunião marcada convida as duas sócias — o Google espelha o mesmo evento na agenda pessoal de
  // quem foi convidada, então pode vir mais de uma vez entre as conexões. iCalUID é estável entre
  // essas cópias (diferente de `id`, que só é único dentro de um calendário).
  const vistos = new Set<string>();
  const eventos: EventoAgenda[] = [];
  for (const lista of listas) {
    for (const ev of lista) {
      if (vistos.has(ev.iCalUID)) continue;
      vistos.add(ev.iCalUID);
      eventos.push({ id: ev.iCalUID, titulo: ev.titulo, local: ev.local, inicioIso: ev.inicioIso, fimIso: ev.fimIso, diaTodo: ev.diaTodo });
    }
  }
  eventos.sort((a, b) => a.inicioIso.localeCompare(b.inicioIso));

  return NextResponse.json({ eventos }, { headers: { "Cache-Control": "no-store" } });
}
