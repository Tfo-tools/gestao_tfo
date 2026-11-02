/**
 * Conector MCP (Streamable HTTP, sem OAuth) — autenticação por CABEÇALHO, que é o modo que o
 * claude.ai oferece ("Cabeçalhos de solicitação" / API key) quando a detecção de login falha.
 *
 * claude.ai → Conectores → adicionar personalizado:
 *   URL: https://gestao.thefashionoffice.online/api/mcp
 *   Autenticação: sem login; em "Cabeçalhos de solicitação" adicione:
 *     x-tfo-token: <CONTEUDO_INBOX_SECRET>     (ou  Authorization: Bearer <CONTEUDO_INBOX_SECRET>)
 *
 * Mesma ferramenta/lógica da rota /api/mcp/[chave] (núcleo em src/lib/mcp-conteudo.ts).
 */

import { CORS, montarRespostaMcp, respostaMcp, streamSseGet, segredoConteudo, segredoDoCabecalho } from "@/lib/mcp-conteudo";

export const maxDuration = 300;

function autorizado(req: Request): boolean {
  const esperado = segredoConteudo();
  return !!esperado && segredoDoCabecalho(req) === esperado;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  if (!autorizado(req)) return new Response("Não autorizado.", { status: 401, headers: CORS });
  return streamSseGet();
}

export async function DELETE() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
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
