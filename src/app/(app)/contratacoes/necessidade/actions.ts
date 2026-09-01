"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

export async function criarAlocacaoModelo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const cenario_id = String(formData.get("cenario_id") || "");
  const cargo = String(formData.get("cargo") || "").trim();
  const modelo_id = String(formData.get("modelo_id") || "");
  const quantidade = Number(formData.get("quantidade") || 1);
  const data_inicio = String(formData.get("data_inicio") || "") || null;
  const data_fim = String(formData.get("data_fim") || "") || null;

  if (!cenario_id || !cargo || !modelo_id) {
    return { error: "Selecione o cargo e o modelo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("alocacao_modelo_contratacao").insert({
    cenario_id,
    cargo,
    modelo_id,
    quantidade,
    data_inicio,
    data_fim,
  });

  if (error) {
    return { error: "Não foi possível salvar a alocação." };
  }

  revalidatePath("/contratacoes/necessidade");
  revalidatePath("/relatorios");
  revalidatePath("/relatorios/mensal");
  return { error: null, success: true };
}

export async function excluirAlocacaoModelo(id: string) {
  const supabase = await createClient();
  await supabase.from("alocacao_modelo_contratacao").delete().eq("id", id);
  revalidatePath("/contratacoes/necessidade");
  revalidatePath("/relatorios");
  revalidatePath("/relatorios/mensal");
}
