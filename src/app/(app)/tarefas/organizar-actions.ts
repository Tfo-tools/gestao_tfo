"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { gerarTextoIA, geminiConfigurado, parseJsonDaIA } from "@/lib/gemini";

/** Um agrupamento proposto pela IA (já resolvido para ids reais), que a sócia aprova ou descarta. */
export type GrupoSugerido = {
  nome: string;
  tipo: "projeto" | "subtarefas";
  projetoId: string | null; // projeto existente que encaixa; null = criar um novo com `nome`
  projetoNome: string | null; // nome do projeto existente (só para exibir)
  maeId: string | null; // tipo "subtarefas": a tarefa-mãe; as demais viram filhas dela
  tarefas: { id: string; titulo: string }[];
  motivo: string;
};

type RespIA = {
  grupos?: {
    nome?: string;
    tipo?: string;
    projeto_existente?: string | null;
    mae?: number | null;
    tarefas?: number[];
    motivo?: string;
  }[];
};

const norm = (s?: string | null) => (s || "").trim().toLowerCase();

/**
 * "Organizar com IA": lê as tarefas soltas (sem projeto e sem mãe, abertas) e propõe agrupá-las —
 * num projeto (novo ou existente) ou como mãe + subtarefas. Só propõe; nada muda sem o aceite da
 * sócia (aplicarAgrupamento). Não inventa tarefa nem relação que não esteja clara no texto.
 */
export async function sugerirOrganizacaoIA(): Promise<{ error: string | null; grupos?: GrupoSugerido[] }> {
  if (!geminiConfigurado()) return { error: "Organizar com IA está indisponível (falta a chave do Gemini)." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const [{ data: soltasRaw }, { data: projetosRaw }, { data: pessoas }] = await Promise.all([
    supabase
      .from("tarefas")
      .select("id, titulo, descricao, etiquetas, responsavel_id")
      .is("projeto_id", null)
      .is("parent_id", null)
      .neq("status", "feito")
      .order("created_at", { ascending: true }),
    supabase.from("projetos").select("id, nome, objetivo, status").eq("status", "ativo").order("nome"),
    supabase.from("profiles").select("id, nome"),
  ]);

  const soltas = (soltasRaw ?? []) as { id: string; titulo: string; descricao: string | null; etiquetas: string[] | null; responsavel_id: string | null }[];
  if (soltas.length < 2) return { error: "Há menos de 2 tarefas soltas — nada para agrupar." };
  const projetos = (projetosRaw ?? []) as { id: string; nome: string; objetivo: string | null }[];
  const nomePessoa = new Map(((pessoas ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome]));

  const lista = soltas
    .map((t, i) => {
      const resp = t.responsavel_id ? nomePessoa.get(t.responsavel_id) : null;
      const etq = (t.etiquetas ?? []).filter(Boolean);
      return `[${i + 1}] ${t.titulo}${t.descricao ? ` — ${t.descricao}` : ""}${resp ? ` (resp: ${resp.split(" ")[0]})` : ""}${etq.length ? ` #${etq.join(" #")}` : ""}`;
    })
    .join("\n");

  const prompt = `Você organiza as tarefas soltas da The Fashion Office (fashiontech capixaba). Abaixo, tarefas abertas sem projeto. Agrupe APENAS as que têm relação clara entre si — num projeto ou como mãe + subtarefas. Deixe de fora as que não encaixam. Não invente tarefas nem relações.

Projetos ativos (use o nome EXATO em "projeto_existente" se o grupo encaixa num deles; senão deixe null e proponha um nome novo curto em "nome"): ${projetos.map((p) => p.nome + (p.objetivo ? ` — ${p.objetivo}` : "")).join(" | ") || "(nenhum)"}.

Tarefas soltas:
${lista}

Regras:
- Cada grupo tem no MÍNIMO 2 tarefas; cada tarefa entra em no máximo um grupo.
- tipo "projeto": tarefas que formam uma frente de trabalho comum → viram um projeto (existente ou novo).
- tipo "subtarefas": quando UMA tarefa é claramente o todo e as outras são partes dela → eleja a "mae" (o índice dela) e as demais viram subtarefas. Só use quando a relação mãe/parte for óbvia.
- Se não houver relação clara, NÃO agrupe. É melhor sugerir poucos grupos bons do que forçar.
- "nome": curto (2-4 palavras), começando por substantivo. "motivo": 1 frase curta.

Responda SOMENTE com JSON válido, sem comentários:
{"grupos":[{"nome":string,"tipo":"projeto"|"subtarefas","projeto_existente":string|null,"mae":number|null,"tarefas":number[],"motivo":string}]}`;

  const { error, texto } = await gerarTextoIA(prompt, 1800);
  if (error || !texto) return { error: error || "A IA não respondeu — tente de novo em instantes." };

  const j = parseJsonDaIA<RespIA>(texto);
  if (!j || !Array.isArray(j.grupos)) return { error: "Não consegui ler a sugestão da IA — tente de novo." };

  const usados = new Set<string>();
  const grupos: GrupoSugerido[] = [];
  for (const g of j.grupos) {
    const idxs = Array.isArray(g.tarefas) ? [...new Set(g.tarefas)] : [];
    const tarefas = idxs
      .map((n) => soltas[Number(n) - 1])
      .filter((t): t is (typeof soltas)[number] => Boolean(t) && !usados.has(t.id));
    if (tarefas.length < 2) continue;
    const tipo = g.tipo === "subtarefas" ? "subtarefas" : "projeto";
    const proj = g.projeto_existente ? projetos.find((p) => norm(p.nome) === norm(g.projeto_existente)) ?? null : null;
    let maeId: string | null = null;
    if (tipo === "subtarefas") {
      const mae = g.mae != null ? soltas[Number(g.mae) - 1] : null;
      maeId = mae && tarefas.some((t) => t.id === mae.id) ? mae.id : tarefas[0].id;
    }
    for (const t of tarefas) usados.add(t.id);
    grupos.push({
      nome: (g.nome || proj?.nome || "Novo projeto").trim(),
      tipo,
      projetoId: proj?.id ?? null,
      projetoNome: proj?.nome ?? null,
      maeId,
      tarefas: tarefas.map((t) => ({ id: t.id, titulo: t.titulo })),
      motivo: (g.motivo || "").trim(),
    });
  }

  if (grupos.length === 0) return { error: "A IA não encontrou agrupamentos claros nas tarefas soltas." };
  return { error: null, grupos };
}

/** Aplica um agrupamento aprovado: cria o projeto (se novo) e move as tarefas, ou aninha as subtarefas. */
export async function aplicarAgrupamento(grupo: {
  nome: string;
  tipo: "projeto" | "subtarefas";
  projetoId: string | null;
  maeId: string | null;
  tarefaIds: string[];
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };
  const ids = [...new Set(grupo.tarefaIds)].filter(Boolean);
  if (ids.length < 2) return { error: "Grupo com menos de 2 tarefas." };

  if (grupo.tipo === "subtarefas") {
    const maeId = grupo.maeId && ids.includes(grupo.maeId) ? grupo.maeId : ids[0];
    const { data: mae } = await supabase.from("tarefas").select("projeto_id").eq("id", maeId).maybeSingle();
    const filhas = ids.filter((id) => id !== maeId);
    if (filhas.length === 0) return { error: "Sem subtarefas para aninhar." };
    const { error } = await supabase
      .from("tarefas")
      .update({ parent_id: maeId, projeto_id: mae?.projeto_id ?? null })
      .in("id", filhas);
    if (error) return { error: "Não consegui aninhar as subtarefas." };
    revalidatePath("/tarefas");
    return { error: null };
  }

  // tipo "projeto": projeto existente ou novo, e move as tarefas pra ele.
  let projetoId = grupo.projetoId;
  if (!projetoId) {
    const nome = (grupo.nome || "Novo projeto").trim();
    const { data: novo, error: errProj } = await supabase.from("projetos").insert({ nome, status: "ativo" }).select("id").single();
    if (errProj || !novo) return { error: "Não consegui criar o projeto." };
    projetoId = novo.id;
  }
  const { error } = await supabase.from("tarefas").update({ projeto_id: projetoId }).in("id", ids);
  if (error) return { error: "Não consegui mover as tarefas para o projeto." };
  revalidatePath("/tarefas");
  return { error: null };
}
