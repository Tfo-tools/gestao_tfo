import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Link curto de tarefa: /t/<8 primeiros caracteres do id> → /tarefas?tarefa=<id>. É o endereço que
 * vai na mensagem da manhã (WhatsApp) — curto o bastante pra não poluir e clicável no celular.
 * Resolve pelo prefixo do uuid (intervalo [prefixo-0000…, prefixo-ffff…]); sem login, o middleware
 * manda pro /login e volta pra cá depois. Prefixo ambíguo ou inexistente cai na lista de tarefas.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const prefixo = codigo.toLowerCase();
  const destinoPadrao = new URL("/tarefas", request.url);
  if (!/^[0-9a-f]{8}$/.test(prefixo)) return NextResponse.redirect(destinoPadrao);

  const { data } = await createAdminClient()
    .from("tarefas")
    .select("id")
    .gte("id", `${prefixo}-0000-0000-0000-000000000000`)
    .lte("id", `${prefixo}-ffff-ffff-ffff-ffffffffffff`)
    .limit(2);
  if (!data || data.length !== 1) return NextResponse.redirect(destinoPadrao);

  const destino = new URL("/tarefas", request.url);
  destino.searchParams.set("tarefa", data[0].id as string);
  return NextResponse.redirect(destino);
}
