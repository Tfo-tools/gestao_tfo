"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TarefaFormState = { error: string | null; success?: boolean };

function texto(fd: FormData, k: string) {
  return String(fd.get(k) || "").trim();
}
function opcional(fd: FormData, k: string) {
  return texto(fd, k) || null;
}
/** "centelha, jurídico" → ["centelha","jurídico"] (minúsculas, sem repetição). */
function etiquetas(fd: FormData) {
  return [...new Set(texto(fd, "etiquetas").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))];
}
function dependencias(fd: FormData) {
  return fd.getAll("depende_de").map(String).filter(Boolean);
}

function camposTarefa(fd: FormData) {
  return {
    titulo: texto(fd, "titulo"),
    descricao: opcional(fd, "descricao"),
    responsavel_id: opcional(fd, "responsavel_id"),
    prazo: opcional(fd, "prazo"),
    data_inicio: opcional(fd, "data_inicio"),
    produto_id: opcional(fd, "produto_id"),
    area: opcional(fd, "area"),
    projeto_id: opcional(fd, "projeto_id"),
    fase_id: opcional(fd, "fase_id"),
    parent_id: opcional(fd, "parent_id"),
    etiquetas: etiquetas(fd),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function salvarDependencias(supabase: any, tarefaId: string, dependeDe: string[]) {
  await supabase.from("tarefa_dependencias").delete().eq("tarefa_id", tarefaId);
  const validas = dependeDe.filter((d) => d !== tarefaId);
  if (validas.length > 0) {
    await supabase.from("tarefa_dependencias").insert(validas.map((d) => ({ tarefa_id: tarefaId, depende_de_id: d })));
  }
}

export async function criarTarefa(_prevState: TarefaFormState, formData: FormData): Promise<TarefaFormState> {
  const campos = camposTarefa(formData);
  if (!campos.titulo) return { error: "Dê um título pra tarefa." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Subtarefa herda projeto e fase da mãe quando não vierem preenchidos.
  if (campos.parent_id && (!campos.projeto_id || !campos.fase_id)) {
    const { data: mae } = await supabase.from("tarefas").select("projeto_id, fase_id").eq("id", campos.parent_id).maybeSingle();
    campos.projeto_id = campos.projeto_id ?? mae?.projeto_id ?? null;
    campos.fase_id = campos.fase_id ?? mae?.fase_id ?? null;
  }

  const { data, error } = await supabase
    .from("tarefas")
    .insert({ ...campos, criado_por: user?.id ?? null })
    .select("id")
    .single();
  if (error || !data) return { error: "Não foi possível criar a tarefa." };

  const deps = dependencias(formData);
  if (deps.length > 0) await salvarDependencias(supabase, data.id, deps);

  revalidatePath("/tarefas");
  return { error: null, success: true };
}

export async function atualizarTarefa(_prevState: TarefaFormState, formData: FormData): Promise<TarefaFormState> {
  const id = texto(formData, "id");
  const campos = camposTarefa(formData);
  if (!id || !campos.titulo) return { error: "Preencha o título." };
  if (campos.parent_id === id) return { error: "Uma tarefa não pode ser subtarefa dela mesma." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tarefas")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Não foi possível salvar." };

  await salvarDependencias(supabase, id, dependencias(formData));

  revalidatePath("/tarefas");
  return { error: null, success: true };
}

export async function mudarStatusTarefa(id: string, status: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tarefas").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Não foi possível atualizar o status." };
  revalidatePath("/tarefas");
  return { error: null };
}

export async function excluirTarefa(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tarefas").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/tarefas");
  return { error: null };
}

// ── Projetos e fases ─────────────────────────────────────────────────────────────────────────

export async function criarProjeto(_prev: TarefaFormState, formData: FormData): Promise<TarefaFormState> {
  const nome = texto(formData, "nome");
  if (!nome) return { error: "Dê um nome pro projeto." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("projetos").insert({
    nome,
    objetivo: opcional(formData, "objetivo"),
    produto_fase_id: opcional(formData, "produto_fase_id"),
    criado_por: user?.id ?? null,
  });
  if (error) return { error: "Não foi possível criar o projeto." };
  revalidatePath("/tarefas");
  return { error: null, success: true };
}

export async function atualizarProjeto(_prev: TarefaFormState, formData: FormData): Promise<TarefaFormState> {
  const id = texto(formData, "id");
  const nome = texto(formData, "nome");
  if (!id || !nome) return { error: "Preencha o nome." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("projetos")
    .update({
      nome,
      objetivo: opcional(formData, "objetivo"),
      produto_fase_id: opcional(formData, "produto_fase_id"),
      status: texto(formData, "status") || "ativo",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: "Não foi possível salvar o projeto." };
  revalidatePath("/tarefas");
  return { error: null, success: true };
}

/** Só apaga projeto sem tarefas — as tarefas ficariam órfãs (projeto_id vira null) e a EAP some sem aviso. */
export async function excluirProjeto(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { count } = await supabase.from("tarefas").select("id", { count: "exact", head: true }).eq("projeto_id", id);
  if ((count ?? 0) > 0) return { error: `Esse projeto tem ${count} tarefa(s). Mova ou exclua elas antes, ou arquive o projeto.` };
  const { error } = await supabase.from("projetos").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/tarefas");
  return { error: null };
}

export async function criarFaseProjeto(formData: FormData): Promise<{ error: string | null }> {
  const projeto_id = texto(formData, "projeto_id");
  const nome = texto(formData, "nome");
  if (!projeto_id || !nome) return { error: "Dê um nome pra fase." };
  const supabase = await createClient();
  const { count } = await supabase.from("projeto_fases").select("id", { count: "exact", head: true }).eq("projeto_id", projeto_id);
  const { error } = await supabase.from("projeto_fases").insert({
    projeto_id,
    nome,
    ordem: count ?? 0,
    data_inicio: opcional(formData, "data_inicio"),
    data_fim: opcional(formData, "data_fim"),
  });
  if (error) return { error: "Não foi possível criar a fase." };
  revalidatePath("/tarefas");
  return { error: null };
}

export async function excluirFaseProjeto(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("projeto_fases").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir a fase." };
  revalidatePath("/tarefas");
  return { error: null };
}
