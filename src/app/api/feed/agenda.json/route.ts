import { NextRequest, NextResponse } from "next/server";
import { carregarAgendaCombinada, textoProximos, textoResumoHoje } from "@/lib/agenda-combinada";

/**
 * Agenda combinada num JSON simples — lido pelo script do Mac e pelo Atalho do iPhone (essas
 * agendas não estão no Calendário do sistema, então o lembrete precisa vir daqui).
 *   ?formato=texto&dia=hoje     → mensagem pronta com o resumo de hoje
 *   ?formato=texto&proximos=15  → só o que começa nos próximos N min (vazio se nada)
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.ICS_FEED_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const eventos = await carregarAgendaCombinada();

  if (request.nextUrl.searchParams.get("formato") === "texto") {
    const proximos = Number(request.nextUrl.searchParams.get("proximos"));
    const texto = proximos > 0 ? textoProximos(eventos, proximos) : textoResumoHoje(eventos);
    return new NextResponse(texto, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ eventos }, { headers: { "Cache-Control": "no-store" } });
}
