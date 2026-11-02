/**
 * Núcleo do conector MCP de conteúdo (Streamable HTTP, JSON-RPC mínimo). Compartilhado pelas rotas
 * /api/mcp (auth por cabeçalho) e /api/mcp/[chave] (auth por segredo na URL). Expõe a ferramenta
 * `criar_tarefas_conteudo`, que chama src/lib/entrada-conteudo.ts.
 */

import { randomUUID } from "crypto";
import { criarTarefasConteudo, type EntradaConteudo } from "@/lib/entrada-conteudo";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-tfo-token, Mcp-Session-Id, MCP-Protocol-Version, Accept",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

const SERVER_INFO = { name: "TFO-Gestão — Conteúdo", version: "1.0.0" };
const VERSAO_PADRAO = "2025-06-18";

const TOOL = {
  name: "criar_tarefas_conteudo",
  description:
    "Cria (ou atualiza) tarefas de conteúdo/redes sociais no app de gestão da TFO. Use para enviar o calendário de posts planejados — uma ou várias tarefas de uma vez. Cada tarefa vira um card no app, com responsável, prazo e etiquetas.",
  inputSchema: {
    type: "object",
    properties: {
      tarefas: {
        type: "array",
        description: "Lista de tarefas (posts/vídeos planejados) a criar ou atualizar.",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "Nome da peça. Obrigatório. Ex.: 'Reels — 3 erros de precificação'." },
            projeto: { type: "string", description: "Tipo de atividade (ex.: 'Vídeos', 'Posts/Design', 'Roteiros'). Criado se não existir. Vazio = 'Conteúdo'. Use nomes consistentes." },
            descricao: { type: "string", description: "Briefing completo: formato, gancho, roteiro/telas, CTA, legenda, hashtags." },
            responsavel: { type: "string", description: "Quem executa: 'vanessa' ou 'emyli'." },
            prazo: { type: "string", description: "Data de produção/publicação no formato YYYY-MM-DD." },
            etiquetas: { type: "array", items: { type: "string" }, description: "1 a 2 tags. Ex.: ['instagram','reels']." },
            ref: { type: "string", description: "Id único e estável da peça (ex.: 'post:2026-11-03-precificacao'). Reenviar o mesmo ref ATUALIZA em vez de duplicar." },
            link: { type: "string", description: "URL de referência (roteiro/board/drive). Opcional." },
          },
          required: ["titulo"],
        },
      },
    },
    required: ["tarefas"],
  },
};

type RpcMsg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

function ok(id: RpcMsg["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function erro(id: RpcMsg["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function tratarMensagem(msg: RpcMsg): Promise<object | null> {
  const metodo = msg.method ?? "";
  if (metodo.startsWith("notifications/")) return null; // notificação não tem resposta

  switch (metodo) {
    case "initialize": {
      const versao = (msg.params?.protocolVersion as string) || VERSAO_PADRAO;
      return ok(msg.id, { protocolVersion: versao, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: [TOOL] });
    case "tools/call": {
      const nome = msg.params?.name as string;
      if (nome !== TOOL.name) return erro(msg.id, -32602, `Ferramenta desconhecida: ${nome}`);
      const args = (msg.params?.arguments ?? {}) as { tarefas?: EntradaConteudo[] };
      const itens = Array.isArray(args.tarefas) ? args.tarefas : [];
      if (itens.length === 0) {
        return ok(msg.id, { content: [{ type: "text", text: "Nenhuma tarefa recebida (campo 'tarefas' vazio)." }], isError: true });
      }
      const resultados = await criarTarefasConteudo(itens);
      const linhas = resultados.map((r) => {
        const base = `- [${r.acao}] ${r.ref ?? "(sem ref)"} → ${r.url ?? "—"} (projeto: ${r.projeto})`;
        return r.aviso ? `${base} ⚠️ ${r.aviso}` : base;
      });
      const resumo = `Processadas ${resultados.length} tarefa(s):\n${linhas.join("\n")}`;
      return ok(msg.id, { content: [{ type: "text", text: resumo }], structuredContent: { resultados } });
    }
    default:
      return erro(msg.id, -32601, `Método não suportado: ${metodo}`);
  }
}

/** Processa o corpo JSON-RPC (mensagem única ou lote) e devolve o que enviar (ou null → 202). */
export async function montarRespostaMcp(corpo: unknown): Promise<object | object[] | null> {
  const mensagens: RpcMsg[] = Array.isArray(corpo) ? (corpo as RpcMsg[]) : [corpo as RpcMsg];
  const respostas: object[] = [];
  for (const m of mensagens) {
    const r = await tratarMensagem(m);
    if (r) respostas.push(r);
  }
  if (respostas.length === 0) return null;
  return Array.isArray(corpo) ? respostas : respostas[0];
}

const encoder = new TextEncoder();

function querSse(req: Request): boolean {
  return (req.headers.get("accept") || "").includes("text/event-stream");
}

/** Monta a Response de um POST JSON-RPC: SSE (event-stream) quando o cliente aceita — que é o que o
 *  claude.ai usa no transporte Streamable HTTP —, senão JSON. Anexa Mcp-Session-Id no initialize. */
export function respostaMcp(req: Request, corpo: unknown, saida: object | object[] | null): Response {
  const headers: Record<string, string> = { ...CORS };
  const ehInit = Array.isArray(corpo)
    ? (corpo as { method?: string }[]).some((m) => m?.method === "initialize")
    : (corpo as { method?: string })?.method === "initialize";
  if (ehInit) headers["Mcp-Session-Id"] = randomUUID();

  if (saida === null) return new Response(null, { status: 202, headers });

  if (querSse(req)) {
    headers["Content-Type"] = "text/event-stream; charset=utf-8";
    headers["Cache-Control"] = "no-cache, no-transform";
    return new Response(`event: message\ndata: ${JSON.stringify(saida)}\n\n`, { status: 200, headers });
  }
  headers["Content-Type"] = "application/json";
  return new Response(JSON.stringify(saida), { status: 200, headers });
}

/** GET = abre o canal SSE server→client (Streamable HTTP). Não enviamos nada server-initiated; só
 *  mantemos vivo com pings até o cliente fechar ou a função expirar. */
export function streamSseGet(): Response {
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": ok\n\n"));
      timer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          if (timer) clearInterval(timer);
        }
      }, 25000);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { ...CORS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}

/** Segredo esperado do canal (mesmo do webhook). */
export function segredoConteudo(): string | undefined {
  return process.env.CONTEUDO_INBOX_SECRET;
}

/** Lê o segredo de um cabeçalho. Aceita `x-tfo-token: <segredo>` ou `Authorization: <segredo>`
 *  com OU sem o prefixo "Bearer " (o claude.ai manda o valor exatamente como foi digitado). */
export function segredoDoCabecalho(req: Request): string | null {
  const header = req.headers.get("x-tfo-token");
  if (header) return header.trim();
  const auth = req.headers.get("authorization");
  if (auth) {
    const v = auth.trim();
    return v.toLowerCase().startsWith("bearer ") ? v.slice(7).trim() : v;
  }
  return null;
}
