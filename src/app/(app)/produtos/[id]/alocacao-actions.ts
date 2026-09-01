"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

export async function criarAlocacao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const fase = String(formData.get("fase") || "");
  const cargo = String(formData.get("cargo") || "").trim();
  const categoria = String(formData.get("categoria") || "pd");
  const quantidade_funcionarios = Number(formData.get("quantidade_funcionarios") || 0);
  const horas_mes = Number(formData.get("horas_mes") || 0);
  const custo_hora = Number(formData.get("custo_hora") || 0);

  if (!produto_id || !cenario_id || !fase || !cargo || !quantidade_funcionarios || !horas_mes || !custo_hora) {
    return { error: "Preencha cargo, quantidade, horas e custo por hora." };
  }

  const supabase = await createClient();

  const { data: existingFase } = await supabase
    .from("fases_produto")
    .select("id")
    .eq("produto_id", produto_id)
    .eq("cenario_id", cenario_id)
    .eq("fase", fase)
    .maybeSingle();

  let faseProdutoId = existingFase?.id as string | undefined;
  if (!faseProdutoId) {
    const { data: created, error: createError } = await supabase
      .from("fases_produto")
      .insert({ produto_id, cenario_id, fase })
      .select("id")
      .single();
    if (createError || !created) {
      return { error: "Não foi possível preparar a fase." };
    }
    faseProdutoId = created.id;
  }

  const { error } = await supabase.from("equipe_alocada").insert({
    fase_produto_id: faseProdutoId,
    cargo,
    categoria,
    quantidade_funcionarios,
    horas_mes,
    custo_hora,
  });

  if (error) {
    return { error: "Não foi possível salvar a alocação." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export async function excluirAlocacao(id: string, produtoId: string) {
  const supabase = await createClient();
  await supabase.from("equipe_alocada").delete().eq("id", id);
  revalidatePath(`/produtos/${produtoId}`);
}
