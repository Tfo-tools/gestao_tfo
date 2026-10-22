import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Canal de ENTRADA da Rayssa → Tarefas (projeto "Plataforma").
 *
 * A IA/sistema da Rayssa faz um POST aqui, com a senha compartilhada no cabeçalho `x-tfo-token`
 * (ou Authorization: Bearer <token>), e o app cria/atualiza a tarefa pra a sócia que ELA indicar.
 *
 * Corpo: um objeto ou uma lista de objetos:
 *   {
 *     "ref": "cronograma:decisao-1",     // id externo — reenvio do mesmo ref ATUALIZA, não duplica
 *     "titulo": "Decisão 1 — ...",        // obrigatório
 *     "descricao": "contexto / a pergunta",
 *     "responsavel": "vanessa" | "emyli", // quem decide (a Rayssa define); vazio = sem responsável
 *     "prazo": "2026-10-28",              // opcional, YYYY-MM-DD
 *     "etiquetas": ["orçamento"],         // opcional (sempre entra "plataforma")
 *     "link": "https://www.thefashionoffice.com.br/cronograma"  // opcional
 *   }
 *
 * Resposta: { ok, resultados: [{ ref, id, url, acao }] } — url é o link direto da tarefa.
 */

const PROJETO_NOME = "Plataforma";
const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://gestaotfo.vercel.app";

type Entrada = {
  ref?: string;
  titulo?: string;
  descricao?: string;
  responsavel?: string;
  prazo?: string;
  etiquetas?: string[];
  link?: string;
};

function tokenValido(req: Request): boolean {
  const esperado = process.env.PLATAFORMA_INBOX_SECRET;
  if (!esperado) return false;
  const header = req.headers.get("x-tfo-token");
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  return header === esperado || bearer === esperado;
}

const dataValida = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function POST(req: Request) {
  if (!tokenValido(req)) return NextResponse.json({ ok: false, error: "Token inválido." }, { status: 401 });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const itens: Entrada[] = Array.isArray(corpo) ? corpo : [corpo as Entrada];
  if (itens.length === 0) return NextResponse.json({ ok: false, error: "Nada para importar." }, { status: 400 });

  const admin = createAdminClient();

  const { data: projeto } = await admin.from("projetos").select("id").eq("nome", PROJETO_NOME).maybeSingle();
  if (!projeto) return NextResponse.json({ ok: false, error: `Projeto "${PROJETO_NOME}" não encontrado.` }, { status: 500 });
  const { data: pessoas } = await admin.from("profiles").select("id, nome");
  const resolverResponsavel = (nome?: string): string | null => {
    const alvo = (nome ?? "").trim().toLowerCase().split("@")[0].split(/\s+/)[0];
    if (!alvo) return null;
    const p = (pessoas ?? []).find((x) => (x.nome ?? "").trim().toLowerCase().split(/\s+/)[0] === alvo);
    return p?.id ?? null;
  };

  const resultados: { ref: string | null; id: string | null; url: string | null; acao: string; aviso?: string }[] = [];

  for (const item of itens) {
    const titulo = String(item?.titulo ?? "").trim();
    if (!titulo) {
      resultados.push({ ref: item?.ref ?? null, id: null, url: null, acao: "ignorada", aviso: "sem título" });
      continue;
    }
    const responsavel_id = resolverResponsavel(item.responsavel);
    const aviso = item.responsavel && !responsavel_id ? `responsável "${item.responsavel}" não reconhecido — ficou sem responsável` : undefined;
    const etiquetas = Array.from(new Set(["plataforma", ...(Array.isArray(item.etiquetas) ? item.etiquetas : [])].map((e) => String(e).trim()).filter(Boolean)));
    const descricao = [String(item.descricao ?? "").trim(), item.link ? `Cronograma: ${item.link}` : null].filter(Boolean).join("\n\n") || null;
    const prazo = dataValida(item.prazo);
    const ref = item.ref ? String(item.ref).trim() : null;

    const campos = { titulo, descricao, responsavel_id, prazo, etiquetas, projeto_id: projeto.id };

    // Já existe tarefa para esse ref? Atualiza. Senão, cria (e registra o ref).
    let existenteId: string | null = null;
    if (ref) {
      const { data: mapa } = await admin.from("entrada_plataforma").select("tarefa_id").eq("ref", ref).maybeSingle();
      existenteId = mapa?.tarefa_id ?? null;
    }

    if (existenteId) {
      const { error } = await admin.from("tarefas").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", existenteId);
      if (error) { resultados.push({ ref, id: existenteId, url: null, acao: "erro", aviso: error.message }); continue; }
      resultados.push({ ref, id: existenteId, url: `${BASE}/tarefas?tarefa=${existenteId}`, acao: "atualizada", aviso });
    } else {
      const { data: nova, error } = await admin.from("tarefas").insert({ ...campos, status: "a_fazer" }).select("id").single();
      if (error || !nova) { resultados.push({ ref, id: null, url: null, acao: "erro", aviso: error?.message }); continue; }
      if (ref) await admin.from("entrada_plataforma").insert({ ref, tarefa_id: nova.id });
      resultados.push({ ref, id: nova.id, url: `${BASE}/tarefas?tarefa=${nova.id}`, acao: "criada", aviso });
    }
  }

  return NextResponse.json({ ok: true, resultados });
}
