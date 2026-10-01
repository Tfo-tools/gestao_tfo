"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extrairAcoesDeTexto, extrairPlanoDeTexto, type AcaoSugerida, type PlanoImportado } from "@/lib/ia";
import { hojeSP } from "@/lib/rotinas";

/** Etiqueta pela qual a tela agrupa/filtra: nome do programa em minúsculas, sem acentos nem espaços
 * ("Centelha III" → "centelha-iii"). Vínculo a programa é por etiqueta, não coluna nova — "Ver por:
 * etiqueta" em /tarefas já resolve "as tarefas do Centelha". */
export async function etiquetaDoPrograma(nome: string): Promise<string> {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Cola a mensagem (WhatsApp, e-mail, trecho de edital) e a IA sugere as ações. Nada vira tarefa
 * aqui — a lista volta pra tela pra revisão. Exigência sem data explícita entra sem prazo. */
export async function sugerirAcoesDeNota(texto: string, programaId: string | null): Promise<{ error: string | null; acoes: AcaoSugerida[] }> {
  const limpo = texto.trim();
  if (limpo.length < 10) return { error: "Cole a mensagem inteira — ficou curto demais pra extrair alguma coisa.", acoes: [] };
  const supabase = await createClient();
  const [{ data: pessoas }, programa] = await Promise.all([
    supabase.from("profiles").select("nome"),
    programaId ? supabase.from("programas_investimento").select("nome").eq("id", programaId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return extrairAcoesDeTexto(
    limpo,
    (pessoas ?? []).map((p) => p.nome),
    (programa.data as { nome: string } | null)?.nome ?? null,
  );
}

export async function criarTarefasDeNota(
  itens: { titulo: string; responsavel_id: string | null; prazo: string | null }[],
  programaId: string | null,
  textoOrigem: string,
): Promise<{ error: string | null; criadas: number }> {
  if (itens.length === 0) return { error: "Nenhuma tarefa selecionada.", criadas: 0 };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let etiquetas: string[] = [];
  if (programaId) {
    const { data: programa } = await supabase.from("programas_investimento").select("nome").eq("id", programaId).maybeSingle();
    if (programa?.nome) etiquetas = [await etiquetaDoPrograma(programa.nome)];
  }
  const origem = textoOrigem.trim();
  const descricao = origem ? `Origem (mensagem colada):\n${origem.length > 1500 ? origem.slice(0, 1500) + "…" : origem}` : null;

  const { error } = await supabase.from("tarefas").insert(
    itens.map((item) => ({
      titulo: item.titulo,
      descricao,
      responsavel_id: item.responsavel_id,
      prazo: item.prazo,
      etiquetas,
      criado_por: user?.id ?? null,
    })),
  );
  if (error) return { error: "Não foi possível criar as tarefas.", criadas: 0 };

  revalidatePath("/tarefas");
  return { error: null, criadas: itens.length };
}

// ── Importar plano (projeto → tarefa → atividade) ────────────────────────────────────────────


export async function sugerirPlanoDeTexto(texto: string): Promise<{ error: string | null; plano: PlanoImportado | null }> {
  const limpo = texto.trim();
  if (limpo.length < 20) return { error: "Cole o plano inteiro (ou um projeto por vez).", plano: null };
  const supabase = await createClient();
  const { data: pessoas } = await supabase.from("profiles").select("nome");
  return extrairPlanoDeTexto(limpo, (pessoas ?? []).map((p) => p.nome), hojeSP());
}

/** Cria tudo ligado: projeto (reaproveita se já existir um com o mesmo nome), tarefas no projeto,
 * atividades como subtarefas e dependências pelos códigos ("1.1" → id). Responsável = primeiro
 * nome que bater com o perfil; os demais viram participantes. */
export async function importarPlano(plano: PlanoImportado, programaId: string | null = null): Promise<{ error: string | null; projetos: number; tarefas: number; atividades: number; dependencias: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: pessoas }, { data: projetosExistentes }] = await Promise.all([
    supabase.from("profiles").select("id, nome"),
    supabase.from("projetos").select("id, nome"),
  ]);
  const normalizar = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  const pessoaPorNome = (nome: string | null) => {
    if (!nome) return null;
    const n = normalizar(nome);
    return (pessoas ?? []).find((p) => normalizar(p.nome) === n || normalizar(p.nome).split(" ")[0] === n.split(" ")[0]) ?? null;
  };

  // Programa escolhido na tela vira etiqueta (é assim que "ver tudo do Centelha" funciona).
  let etiquetas: string[] = [];
  if (programaId) {
    const { data: programa } = await supabase.from("programas_investimento").select("nome").eq("id", programaId).maybeSingle();
    if (programa?.nome) etiquetas = [await etiquetaDoPrograma(programa.nome)];
  }
  let nProjetos = 0, nTarefas = 0, nAtividades = 0, nDeps = 0;
  const idPorCodigo = new Map<string, string>();
  const pendentesDeps: { tarefaId: string; codigos: string[] }[] = [];

  for (const proj of plano.projetos) {
    let projetoId = proj.nome ? ((projetosExistentes ?? []).find((p) => normalizar(p.nome) === normalizar(proj.nome!))?.id ?? null) : null;
    if (!projetoId && proj.nome) {
      const descricao = [proj.descricao, proj.prazo ? `Prazo previsto: ${proj.prazo.split("-").reverse().join("/")}` : null].filter(Boolean).join(" ");
      const { data, error } = await supabase
        .from("projetos")
        .insert({ nome: proj.nome, descricao: descricao || null, criado_por: user?.id ?? null })
        .select("id")
        .single();
      if (error || !data) return { error: `Não consegui criar o projeto "${proj.nome}".`, projetos: nProjetos, tarefas: nTarefas, atividades: nAtividades, dependencias: nDeps };
      projetoId = data.id as string;
      nProjetos++;
    }

    for (const [i, t] of proj.tarefas.entries()) {
      const nomes = t.responsaveis.map(pessoaPorNome).filter((p): p is { id: string; nome: string } => !!p);
      const responsavel = nomes[0] ?? null;
      const participantes = [...new Set(nomes.slice(1).map((p) => p.id))];
      const titulo = t.codigo ? `${t.codigo} ${t.titulo}` : t.titulo;
      const { data, error } = await supabase
        .from("tarefas")
        .insert({
          titulo,
          descricao: t.descricao,
          responsavel_id: responsavel?.id ?? null,
          participantes,
          data_inicio: t.inicio,
          prazo: t.prazo,
          projeto_id: projetoId,
          ordem: i,
          etiquetas: proj.nome ? [...etiquetas, "plano-importado"] : etiquetas,
          criado_por: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error || !data) return { error: `Não consegui criar a tarefa "${titulo}".`, projetos: nProjetos, tarefas: nTarefas, atividades: nAtividades, dependencias: nDeps };
      nTarefas++;
      if (t.codigo) idPorCodigo.set(t.codigo, data.id as string);
      if (t.depende_de.length > 0) pendentesDeps.push({ tarefaId: data.id as string, codigos: t.depende_de });

      if (t.subtarefas.length > 0) {
        const { error: erroSub } = await supabase.from("tarefas").insert(
          t.subtarefas.map((s, j) => ({
            titulo: s.titulo,
            parent_id: data.id,
            projeto_id: projetoId,
            responsavel_id: pessoaPorNome(s.responsavel)?.id ?? responsavel?.id ?? null,
            prazo: s.prazo,
            ordem: j,
            criado_por: user?.id ?? null,
          })),
        );
        if (!erroSub) nAtividades += t.subtarefas.length;
      }
    }
  }

  const deps = pendentesDeps.flatMap((p) =>
    p.codigos
      .map((c) => idPorCodigo.get(c))
      .filter((id): id is string => !!id && id !== p.tarefaId)
      .map((dependeDeId) => ({ tarefa_id: p.tarefaId, depende_de_id: dependeDeId })),
  );
  if (deps.length > 0) {
    const { error } = await supabase.from("tarefa_dependencias").insert(deps);
    if (!error) nDeps = deps.length;
  }

  revalidatePath("/tarefas");
  return { error: null, projetos: nProjetos, tarefas: nTarefas, atividades: nAtividades, dependencias: nDeps };
}
