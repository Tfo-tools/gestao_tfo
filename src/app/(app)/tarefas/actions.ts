"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TarefaFormState = { error: string | null; success?: boolean };

export async function criarTarefa(_prevState: TarefaFormState, formData: FormData): Promise<TarefaFormState> {
  const titulo = String(formData.get("titulo") || "").trim();
  const descricao = String(formData.get("descricao") || "").trim() || null;
  const responsavel_id = String(formData.get("responsavel_id") || "") || null;
  const prazo = String(formData.get("prazo") || "") || null;
  const produto_id = String(formData.get("produto_id") || "") || null;
  const area = String(formData.get("area") || "").trim() || null;

  if (!titulo) return { error: "Dê um título pra tarefa." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("tarefas").insert({
    titulo,
    descricao,
    responsavel_id,
    prazo,
    produto_id,
    area,
    criado_por: user?.id ?? null,
  });

  if (error) return { error: "Não foi possível criar a tarefa." };

  revalidatePath("/tarefas");
  return { error: null, success: true };
}

export async function atualizarTarefa(_prevState: TarefaFormState, formData: FormData): Promise<TarefaFormState> {
  const id = String(formData.get("id") || "");
  const titulo = String(formData.get("titulo") || "").trim();
  const descricao = String(formData.get("descricao") || "").trim() || null;
  const responsavel_id = String(formData.get("responsavel_id") || "") || null;
  const prazo = String(formData.get("prazo") || "") || null;
  const produto_id = String(formData.get("produto_id") || "") || null;
  const area = String(formData.get("area") || "").trim() || null;

  if (!id || !titulo) return { error: "Preencha o título." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tarefas")
    .update({ titulo, descricao, responsavel_id, prazo, produto_id, area, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: "Não foi possível salvar." };

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
