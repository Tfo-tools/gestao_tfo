import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  carregarAgendaCombinada,
  carregarPendencias,
  dataLocal,
  eventosEmBreve,
  lembretesDeHoje,
  proximoAlarme,
  textoEvento,
  textoResumoHoje,
} from "@/lib/agenda-combinada";

/**
 * Agenda combinada — lida pelo script do Mac e pelo Atalho do iPhone (essas agendas não estão no
 * Calendário do sistema, então o lembrete precisa vir daqui).
 *   (sem formato)                → JSON com os eventos
 *   ?formato=texto&dia=hoje      → mensagem pronta: agenda de hoje + contas/tarefas vencendo
 *   ?formato=texto&proximos=15   → só o que começa nos próximos N min (vazio se nada)
 *   ?formato=lembretes           → um item por compromisso de hoje com o alerta já calculado
 *   ?formato=proximo-alarme      → "HH:MM" do próximo alarme a criar (ou a semente de amanhã)
 * O texto de "proximos" só sai UMA vez por compromisso (marca em agenda_lembretes_enviados):
 * o Atalho do iPhone roda em qualquer alarme, inclusive o despertador — a segunda chamada
 * recebe vazio e não manda nada.
 */
export const dynamic = "force-dynamic";

const MINUTOS_ANTES = 15;
const HORA_SEMENTE = "08:01";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.ICS_FEED_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formato = request.nextUrl.searchParams.get("formato");
  const eventos = await carregarAgendaCombinada();
  const semCache = { "Cache-Control": "no-store" };

  if (formato === "lembretes") {
    // Lista no topo (não embrulhada em objeto): o Atalhos já a lê como lista de dicionários e cai
    // direto no "Repetir com Cada", sem precisar de um "Obter Valor do Dicionário" antes.
    return NextResponse.json(lembretesDeHoje(eventos, MINUTOS_ANTES), { headers: semCache });
  }

  const textoPlano = (texto: string) =>
    new NextResponse(texto, { headers: { "Content-Type": "text/plain; charset=utf-8", ...semCache } });

  if (formato === "proximo-alarme") {
    return textoPlano(proximoAlarme(eventos, MINUTOS_ANTES, HORA_SEMENTE));
  }

  if (formato === "texto") {
    const proximos = Number(request.nextUrl.searchParams.get("proximos"));
    if (!(proximos > 0)) return textoPlano(textoResumoHoje(eventos, await carregarPendencias()));

    const emBreve = eventosEmBreve(eventos, proximos);
    if (emBreve.length === 0) return textoPlano("");
    // &checar=1: só olha se tem algo, sem "gastar" o aviso — o Atalho usa isso pra decidir se chama
    // o que envia (que aí busca de novo, dessa vez marcando).
    if (request.nextUrl.searchParams.get("checar")) return textoPlano(emBreve.map(textoEvento).join("\n"));
    const supabase = createAdminClient();
    const { data: ganhos } = await supabase
      .from("agenda_lembretes_enviados")
      .upsert(emBreve.map((e) => ({ chave: `whatsapp:${e.id}:${dataLocal(e.inicioIso)}` })), { onConflict: "chave", ignoreDuplicates: true })
      .select("chave");
    const chavesGanhas = new Set((ganhos ?? []).map((g) => g.chave));
    const novos = emBreve.filter((e) => chavesGanhas.has(`whatsapp:${e.id}:${dataLocal(e.inicioIso)}`));
    return textoPlano(novos.map(textoEvento).join("\n"));
  }

  return NextResponse.json({ eventos }, { headers: semCache });
}
