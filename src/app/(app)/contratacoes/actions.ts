"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

export async function criarContratacao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const cenario_id = String(formData.get("cenario_id") || "");
  const produto_id = String(formData.get("produto_id") || "") || null;
  const cargo = String(formData.get("cargo") || "");
  const tipo_contratacao = String(formData.get("tipo_contratacao") || "");
  const nome_referencia = String(formData.get("nome_referencia") || "").trim() || null;
  const data_inicio = String(formData.get("data_inicio") || "") || null;
  const data_fim = String(formData.get("data_fim") || "") || null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!cenario_id || !cargo || !tipo_contratacao) {
    return { error: "Selecione cenário, cargo e tipo de contratação." };
  }

  const payload: Record<string, unknown> = {
    cenario_id,
    produto_id,
    cargo,
    tipo_contratacao,
    nome_referencia,
    data_inicio,
    data_fim,
    observacoes,
  };

  if (tipo_contratacao === "clt") {
    const salario_bruto = formData.get("salario_bruto");
    const regime_id = formData.get("regime_id");
    if (!salario_bruto || !regime_id) {
      return { error: "Preencha salário bruto e regime tributário." };
    }
    payload.salario_bruto = Number(salario_bruto);
    payload.regime_id = String(regime_id);
  } else {
    const valor_mensal = formData.get("valor_mensal");
    if (!valor_mensal) {
      return { error: "Preencha o valor mensal cobrado pelo PJ." };
    }
    payload.valor_mensal = Number(valor_mensal);
    payload.quantidade_pessoas = formData.get("quantidade_pessoas")
      ? Number(formData.get("quantidade_pessoas"))
      : 1;
    payload.inclui_coordenador = formData.get("inclui_coordenador") === "on";
  }

  const supabase = await createClient();
  const { error } = await supabase.from("contratacoes").insert(payload);

  if (error) {
    return { error: "Não foi possível salvar a contratação." };
  }

  revalidatePath("/contratacoes");
  revalidatePath("/funil");
  return { error: null, success: true };
}

export async function excluirContratacao(id: string) {
  const supabase = await createClient();
  await supabase.from("contratacoes").delete().eq("id", id);
  revalidatePath("/contratacoes");
  revalidatePath("/funil");
}
