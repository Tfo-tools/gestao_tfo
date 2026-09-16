import { NextRequest, NextResponse } from "next/server";
import { carregarAgendaCombinada, carregarPendencias, lembretesDeHoje, textoProximos, textoResumoHoje } from "@/lib/agenda-combinada";

/**
 * Agenda combinada — lida pelo script do Mac e pelo Atalho do iPhone (essas agendas não estão no
 * Calendário do sistema, então o lembrete precisa vir daqui).
 *   (sem formato)                → JSON com os eventos
 *   ?formato=texto&dia=hoje      → mensagem pronta: agenda de hoje + contas/tarefas vencendo
 *   ?formato=texto&proximos=15   → só o que começa nos próximos N min (vazio se nada)
 *   ?formato=lembretes           → um item por compromisso de hoje com o alerta já calculado
 *                                  (início − 15 min), pro Atalho criar Lembretes nativos
 */
export const dynamic = "force-dynamic";

const MINUTOS_ANTES = 15;

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

  if (formato === "texto") {
    const proximos = Number(request.nextUrl.searchParams.get("proximos"));
    const texto = proximos > 0 ? textoProximos(eventos, proximos) : textoResumoHoje(eventos, await carregarPendencias());
    return new NextResponse(texto, { headers: { "Content-Type": "text/plain; charset=utf-8", ...semCache } });
  }

  return NextResponse.json({ eventos }, { headers: semCache });
}
