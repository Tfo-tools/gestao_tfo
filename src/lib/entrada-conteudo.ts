/**
 * Lógica compartilhada de "criar/atualizar tarefa de conteúdo" — usada pelo webhook
 * (/api/entrada/conteudo) e pelo conector MCP (/api/mcp/[chave]). O agente escolhe o projeto pelo
 * nome (acha-ou-cria); responsável por tarefa; etiquetas livres + base "conteudo". Idempotente por
 * `ref` reusando a tabela `entrada_plataforma` com prefixo "conteudo:" (sem migração).
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type EntradaConteudo = {
  ref?: string;
  titulo?: string;
  descricao?: string;
  projeto?: string;
  responsavel?: string;
  prazo?: string;
  etiquetas?: string[];
  link?: string;
};

export type ResultadoConteudo = {
  ref: string | null;
  id: string | null;
  url: string | null;
  acao: "criada" | "atualizada" | "ignorada" | "erro";
  projeto: string;
  aviso?: string;
};

const PROJETO_PADRAO = "Conteúdo";
const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://gestao.thefashionoffice.online";
const dataValida = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function criarTarefasConteudo(itens: EntradaConteudo[]): Promise<ResultadoConteudo[]> {
  const admin = createAdminClient();

  const { data: pessoas } = await admin.from("profiles").select("id, nome");
  const resolverResponsavel = (nome?: string): string | null => {
    const alvo = (nome ?? "").trim().toLowerCase().split("@")[0].split(/\s+/)[0];
    if (!alvo) return null;
    const p = (pessoas ?? []).find((x) => (x.nome ?? "").trim().toLowerCase().split(/\s+/)[0] === alvo);
    return p?.id ?? null;
  };

  // Acha-ou-cria o projeto pelo nome (ignora maiúsculas), cacheado dentro da chamada.
  const cacheProjetos = new Map<string, string | null>();
  async function resolverProjeto(nome: string): Promise<string | null> {
    const chave = nome.trim().toLowerCase();
    if (cacheProjetos.has(chave)) return cacheProjetos.get(chave)!;
    const { data: existente } = await admin.from("projetos").select("id").ilike("nome", nome.trim()).maybeSingle();
    let id = existente?.id ?? null;
    if (!id) {
      const { data: novo } = await admin.from("projetos").insert({ nome: nome.trim(), criado_por: null }).select("id").single();
      id = novo?.id ?? null;
    }
    cacheProjetos.set(chave, id);
    return id;
  }

  const resultados: ResultadoConteudo[] = [];

  for (const item of itens) {
    const titulo = String(item?.titulo ?? "").trim();
    const nomeProjeto = String(item?.projeto ?? "").trim() || PROJETO_PADRAO;
    if (!titulo) {
      resultados.push({ ref: item?.ref ?? null, id: null, url: null, acao: "ignorada", projeto: nomeProjeto, aviso: "sem título" });
      continue;
    }
    const projetoId = await resolverProjeto(nomeProjeto);
    if (!projetoId) {
      resultados.push({ ref: item?.ref ?? null, id: null, url: null, acao: "erro", projeto: nomeProjeto, aviso: "não consegui achar/criar o projeto" });
      continue;
    }

    const responsavel_id = resolverResponsavel(item.responsavel);
    const aviso = item.responsavel && !responsavel_id ? `responsável "${item.responsavel}" não reconhecido — ficou sem responsável` : undefined;
    const etiquetas = Array.from(new Set(["conteudo", ...(Array.isArray(item.etiquetas) ? item.etiquetas : [])].map((e) => String(e).trim()).filter(Boolean)));
    const descricao = [String(item.descricao ?? "").trim(), item.link ? `Referência: ${item.link}` : null].filter(Boolean).join("\n\n") || null;
    const prazo = dataValida(item.prazo);
    const ref = item.ref ? String(item.ref).trim() : null;
    const refMapa = ref ? `conteudo:${ref}` : null;

    const campos = { titulo, descricao, responsavel_id, prazo, etiquetas, projeto_id: projetoId };

    let existenteId: string | null = null;
    if (refMapa) {
      const { data: mapa } = await admin.from("entrada_plataforma").select("tarefa_id").eq("ref", refMapa).maybeSingle();
      existenteId = mapa?.tarefa_id ?? null;
    }

    if (existenteId) {
      const { error } = await admin.from("tarefas").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", existenteId);
      if (error) { resultados.push({ ref, id: existenteId, url: null, acao: "erro", projeto: nomeProjeto, aviso: error.message }); continue; }
      resultados.push({ ref, id: existenteId, url: `${BASE}/tarefas?tarefa=${existenteId}`, acao: "atualizada", projeto: nomeProjeto, aviso });
    } else {
      const { data: nova, error } = await admin.from("tarefas").insert({ ...campos, status: "a_fazer" }).select("id").single();
      if (error || !nova) { resultados.push({ ref, id: null, url: null, acao: "erro", projeto: nomeProjeto, aviso: error?.message }); continue; }
      if (refMapa) await admin.from("entrada_plataforma").insert({ ref: refMapa, tarefa_id: nova.id });
      resultados.push({ ref, id: nova.id, url: `${BASE}/tarefas?tarefa=${nova.id}`, acao: "criada", projeto: nomeProjeto, aviso });
    }
  }

  return resultados;
}
