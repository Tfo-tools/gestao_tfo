import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverPerfil, linkCurtoTarefa } from "@/lib/agenda-combinada";

// Sempre recalcula por requisição: edição de tarefa/vencimento tem que refletir na hora, sem cache de borda.
export const dynamic = "force-dynamic";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataParaICS(iso: string) {
  return iso.replaceAll("-", "");
}

function escaparTexto(texto: string) {
  return texto.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function eventoVALARM(summary: string, description: string, uid: string, dataISO: string, alarmeDiasAntes: number) {
  const dtstart = dataParaICS(dataISO);
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dataParaICS(new Date().toISOString().slice(0, 10))}T000000Z`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `DTEND;VALUE=DATE:${dtstart}`,
    `SUMMARY:${escaparTexto(summary)}`,
    `DESCRIPTION:${escaparTexto(description)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escaparTexto(summary)}`,
    `TRIGGER:-P${alarmeDiasAntes}D`,
    "END:VALARM",
    "END:VEVENT",
  ].join("\r\n");
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.ICS_FEED_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  // Com ?usuario=<id|nome>: só as tarefas da pessoa (responsável/participa); contas só para sócias.
  const perfil = await resolverPerfil(request.nextUrl.searchParams.get("usuario"));
  const incluirContas = !perfil || perfil.papel === "socia";

  const [{ data: despesas }, { data: tarefas }] = await Promise.all([
    supabase.from("despesas").select("id, descricao, valor_total, data_gasto").eq("comprovado", false),
    supabase.from("tarefas").select("id, titulo, prazo, status, responsavel_id, participantes").neq("status", "feito").not("prazo", "is", null),
  ]);

  const eventos: string[] = [];

  for (const d of incluirContas ? (despesas ?? []) : []) {
    if (!d.data_gasto) continue;
    eventos.push(
      eventoVALARM(
        `💰 Vencimento: ${d.descricao ?? "Despesa"}`,
        `Conta pendente — ${formatBRL(Number(d.valor_total))}`,
        `despesa-${d.id}@gestaotfo`,
        d.data_gasto,
        1,
      ),
    );
  }

  for (const t of tarefas ?? []) {
    if (!t.prazo) continue;
    if (perfil) {
      const ids = [t.responsavel_id, ...((t.participantes as string[] | null) ?? [])].filter((id): id is string => !!id);
      if (!ids.includes(perfil.id)) continue;
    }
    // Link da tarefa na descrição do evento: tocar o evento no Calendário abre a tarefa no app.
    eventos.push(eventoVALARM(`✅ Tarefa: ${t.titulo}`, `Abrir no app: ${linkCurtoTarefa(t.id as string)}`, `tarefa-${t.id}@gestaotfo`, t.prazo, 1));
  }

  const nomeCal = `TFO-Gestão — Lembretes${perfil ? ` (${String(perfil.nome).split(" ")[0]})` : ""}`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TFO-Gestao//Lembretes//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${nomeCal}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...eventos,
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="lembretes-tfo.ics"',
      "Cache-Control": "no-store, max-age=0, must-revalidate",
    },
  });
}
