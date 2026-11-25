"use server";

import { createClient } from "@/lib/supabase/server";
import { gerarTextoIA, geminiConfigurado, parseJsonDaIA } from "@/lib/gemini";

/** Campos que a IA sugere a partir do texto livre — a sócia confere antes de criar. */
export type SugestaoTarefaIA = {
  titulo: string;
  descricao: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  prazo: string | null; // YYYY-MM-DD
  projeto_id: string | null;
  projeto_nome: string | null;
  etiquetas: string[];
};

type RespostaIA = {
  titulo?: string;
  descricao?: string | null;
  responsavel_nome?: string | null;
  prazo?: string | null;
  projeto_nome?: string | null;
  etiquetas?: string[];
};

const norm = (s?: string | null) => (s || "").trim().toLowerCase();

/**
 * "Criar com IA": a pessoa escreve o que precisa fazer e por quê; a IA devolve os campos
 * estruturados (título, responsável, prazo, projeto, etiquetas), amarrados às opções reais do app.
 * Não inventa urgência nem dado: o que não dá pra inferir volta null e a sócia preenche.
 */
export async function sugerirTarefaIA(texto: string): Promise<{ error: string | null; sugestao?: SugestaoTarefaIA }> {
  if (!geminiConfigurado()) return { error: "Criar com IA está indisponível (falta a chave do Gemini)." };
  const t = (texto || "").trim();
  if (t.length < 4) return { error: "Escreva um pouco do que precisa fazer (e, se der, por quê)." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const [{ data: pessoas }, { data: projetos }] = await Promise.all([
    supabase.from("profiles").select("id, nome").order("nome"),
    supabase.from("projetos").select("id, nome, objetivo, status").order("status"),
  ]);
  const listaP = (pessoas ?? []) as { id: string; nome: string }[];
  const listaProj = (projetos ?? []) as { id: string; nome: string; objetivo: string | null; status: string }[];
  const ativos = listaProj.filter((p) => p.status === "ativo");

  const hoje = new Date().toISOString().slice(0, 10);
  const prompt = `Você é a assistente de tarefas da The Fashion Office (fashiontech capixaba). A pessoa descreve, em texto livre, o que precisa fazer e por quê. Transforme isso numa tarefa estruturada.

Hoje é ${hoje}.
Responsáveis possíveis (use EXATAMENTE um destes nomes, ou null): ${listaP.map((p) => p.nome).join(", ") || "(nenhum cadastrado)"}.
Projetos ativos (use EXATAMENTE um destes nomes, ou null se não encaixar claramente): ${ativos.map((p) => p.nome + (p.objetivo ? ` — ${p.objetivo}` : "")).join(" | ") || "(nenhum)"}.

Regras:
- titulo: curto e acionável, começando por um verbo no infinitivo (ex.: "Fechar 2 marcas novas").
- descricao: o porquê / contexto que a pessoa deu, em 1-2 frases. Não invente nada.
- responsavel_nome: um nome EXATO da lista, ou null se a pessoa não indicou quem faz.
- prazo: data no formato YYYY-MM-DD inferida de pistas do texto ("até sexta", "meados de dezembro"). Se não houver pista, null. Nunca invente urgência.
- projeto_nome: um nome EXATO da lista de projetos ativos, só se encaixar com clareza; senão null.
- etiquetas: de 0 a 3 palavras-chave curtas em minúsculas, só se forem úteis.
- Não faça perguntas. O que faltar, deixe null — a pessoa confere e completa depois.

Texto da pessoa:
"""${t}"""

Responda SOMENTE com JSON válido, sem comentários:
{"titulo": string, "descricao": string|null, "responsavel_nome": string|null, "prazo": string|null, "projeto_nome": string|null, "etiquetas": string[]}`;

  const { error, texto: resp } = await gerarTextoIA(prompt, 1200);
  if (error || !resp) return { error: error || "A IA não respondeu — tente de novo em instantes." };

  const j = parseJsonDaIA<RespostaIA>(resp);
  if (!j || !j.titulo) return { error: "Não consegui estruturar a tarefa — tente escrever com um pouco mais de detalhe." };

  const pessoa = j.responsavel_nome ? listaP.find((p) => norm(p.nome) === norm(j.responsavel_nome)) ?? null : null;
  const proj = j.projeto_nome ? listaProj.find((p) => norm(p.nome) === norm(j.projeto_nome)) ?? null : null;
  const prazoOk = j.prazo && /^\d{4}-\d{2}-\d{2}$/.test(j.prazo) ? j.prazo : null;

  return {
    error: null,
    sugestao: {
      titulo: j.titulo.trim(),
      descricao: j.descricao?.trim() || null,
      responsavel_id: pessoa?.id ?? null,
      responsavel_nome: pessoa?.nome ?? null,
      prazo: prazoOk,
      projeto_id: proj?.id ?? null,
      projeto_nome: proj?.nome ?? null,
      etiquetas: Array.isArray(j.etiquetas) ? j.etiquetas.map((e) => String(e).toLowerCase().trim()).filter(Boolean).slice(0, 3) : [],
    },
  };
}
