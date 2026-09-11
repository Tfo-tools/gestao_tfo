"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

/** Salva de uma vez todos os valores/hora alterados na tabela — é um cadastro de referência, não
 * faz sentido um botão por linha. */
export async function salvarTabelaCustoHora(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const alteracoesRaw = String(formData.get("alteracoes") || "");

  let alteracoes: { id: string; valor_hora: number }[];
  try {
    alteracoes = JSON.parse(alteracoesRaw);
  } catch {
    return { error: "Não foi possível ler as alterações." };
  }

  if (alteracoes.length === 0) return { error: null, success: true };

  const supabase = await createClient();
  for (const a of alteracoes) {
    const { error } = await supabase.from("tabela_custo_hora").update({ valor_hora: a.valor_hora }).eq("id", a.id);
    if (error) return { error: "Não foi possível salvar a tabela." };
  }

  revalidatePath("/contratacoes/custo-hora");
  revalidatePath("/produtos");
  return { error: null, success: true };
}

export async function criarCustoHora(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const area = String(formData.get("area") || "").trim();
  const cargo = String(formData.get("cargo") || "").trim();
  const tipo_contratacao = String(formData.get("tipo_contratacao") || "");
  const senioridade = String(formData.get("senioridade") || "");
  const valor_hora = formData.get("valor_hora") ? Number(formData.get("valor_hora")) : 0;

  if (!area || !cargo || !tipo_contratacao || !senioridade || !valor_hora) {
    return { error: "Preencha área, cargo, contratação, senioridade e valor/hora." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tabela_custo_hora")
    .insert({ area, cargo, tipo_contratacao, senioridade, valor_hora });

  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Já existe uma linha pra esse cargo nessa senioridade e contratação."
        : "Não foi possível salvar a linha.",
    };
  }

  revalidatePath("/contratacoes/custo-hora");
  return { error: null, success: true };
}
