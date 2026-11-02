/**
 * Conector MCP (Streamable HTTP, sem OAuth) — autenticação por SEGREDO NA URL.
 * Alternativa à rota /api/mcp (auth por cabeçalho). Use esta quando o cliente não deixa pôr header:
 *   URL: https://gestao.thefashionoffice.online/api/mcp/<CONTEUDO_INBOX_SECRET>
 * Núcleo compartilhado em src/lib/mcp-conteudo.ts.
 */

import { CORS, montarRespostaMcp, respostaMcp, streamSseGet, segredoConteudo } from "@/lib/mcp-conteudo";

export const maxDuration = 300;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(_req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params;
  const esperado = segredoConteudo();
  if (!esperado || chave !== esperado) return new Response("Não autorizado.", { status: 401, headers: CORS });
  return streamSseGet();
}

export async function DELETE() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params;
  const esperado = segredoConteudo();
  if (!esperado || chave !== esperado) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Não autorizado." } }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const saida = await montarRespostaMcp(corpo);
  return respostaMcp(req, corpo, saida);
}
