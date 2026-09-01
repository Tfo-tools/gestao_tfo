"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

async function getOrCreateFaseId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  produto_id: string,
  cenario_id: string,
  fase: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("fases_produto")
    .select("id")
    .eq("produto_id", produto_id)
    .eq("cenario_id", cenario_id)
    .eq("fase", fase)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("fases_produto")
    .insert({ produto_id, cenario_id, fase })
    .select("id")
    .single();

  return created?.id ?? null;
}

export async function criarCustoFixo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const fase = String(formData.get("fase") || "");
  const item = String(formData.get("item") || "").trim();
  const plano_contas_id = String(formData.get("plano_contas_id") || "") || null;
  const quantidade = Number(formData.get("quantidade") || 1);
  const valor_unitario = Number(formData.get("valor_unitario") || 0);

  if (!produto_id || !cenario_id || !fase || !item || !valor_unitario) {
    return { error: "Preencha item e valor." };
  }

  const supabase = await createClient();
  const faseProdutoId = await getOrCreateFaseId(supabase, produto_id, cenario_id, fase);
  if (!faseProdutoId) return { error: "Não foi possível preparar a fase." };

  const { error } = await supabase.from("plano_custos_fixos").insert({
    fase_produto_id: faseProdutoId,
    plano_contas_id,
    tipo: "estrutura",
    item,
    quantidade,
    valor_unitario,
  });

  if (error) return { error: "Não foi possível salvar o custo." };

  revalidatePath(`/plano-de-custos/${produto_id}`);
  return { error: null, success: true };
}

export async function excluirCustoFixo(id: string, produtoId: string) {
  const supabase = await createClient();
  await supabase.from("plano_custos_fixos").delete().eq("id", id);
  revalidatePath(`/plano-de-custos/${produtoId}`);
}

export async function criarCustoVariavel(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const fase = String(formData.get("fase") || "");
  const item = String(formData.get("item") || "").trim();
  const plano_contas_id = String(formData.get("plano_contas_id") || "") || null;
  const tipo_calculo = String(formData.get("tipo_calculo") || "");
  const valor_base = formData.get("valor_base") ? Number(formData.get("valor_base")) : null;
  const percentual = formData.get("percentual") ? Number(formData.get("percentual")) / 100 : null;
  const valor_por_unidade = formData.get("valor_por_unidade") ? Number(formData.get("valor_por_unidade")) : null;

  if (!produto_id || !cenario_id || !fase || !item || !tipo_calculo) {
    return { error: "Preencha item e tipo de cálculo." };
  }

  const supabase = await createClient();
  const faseProdutoId = await getOrCreateFaseId(supabase, produto_id, cenario_id, fase);
  if (!faseProdutoId) return { error: "Não foi possível preparar a fase." };

  const { error } = await supabase.from("plano_custos_variaveis").insert({
    fase_produto_id: faseProdutoId,
    plano_contas_id,
    item,
    tipo_calculo,
    valor_base,
    percentual,
    valor_por_unidade,
  });

  if (error) return { error: "Não foi possível salvar o custo." };

  revalidatePath(`/plano-de-custos/${produto_id}`);
  return { error: null, success: true };
}

export async function excluirCustoVariavel(id: string, produtoId: string) {
  const supabase = await createClient();
  await supabase.from("plano_custos_variaveis").delete().eq("id", id);
  revalidatePath(`/plano-de-custos/${produtoId}`);
}
