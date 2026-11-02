import { NextResponse } from "next/server";
import { criarTarefasConteudo, type EntradaConteudo } from "@/lib/entrada-conteudo";

/**
 * Canal de ENTRADA do agente de conteúdo/redes sociais → Tarefas (webhook simples por token).
 * A lógica de criar/atualizar está em src/lib/entrada-conteudo.ts (compartilhada com o conector MCP).
 *
 * POST com `x-tfo-token` (ou Authorization: Bearer <token>) = env CONTEUDO_INBOX_SECRET.
 * Corpo: objeto ou lista de { ref?, titulo, projeto?, descricao?, responsavel?, prazo?, etiquetas?, link? }.
 * Resposta: { ok, resultados:[{ ref, id, url, acao, projeto }] }.
 */

function tokenValido(req: Request): boolean {
  const esperado = process.env.CONTEUDO_INBOX_SECRET;
  if (!esperado) return false;
  const header = req.headers.get("x-tfo-token");
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  return header === esperado || bearer === esperado;
}

export async function POST(req: Request) {
  if (!tokenValido(req)) return NextResponse.json({ ok: false, error: "Token inválido." }, { status: 401 });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const itens: EntradaConteudo[] = Array.isArray(corpo) ? corpo : [corpo as EntradaConteudo];
  if (itens.length === 0) return NextResponse.json({ ok: false, error: "Nada para importar." }, { status: 400 });

  const resultados = await criarTarefasConteudo(itens);
  return NextResponse.json({ ok: true, resultados });
}
