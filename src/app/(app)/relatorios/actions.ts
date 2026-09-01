"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

export async function criarAlocacaoInvestimento(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const cenario_id = String(formData.get("cenario_id") || "");
  const categoria = String(formData.get("categoria") || "").trim();
  const percentual = Number(formData.get("percentual") || 0);
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!cenario_id || !categoria || !percentual) {
    return { error: "Preencha categoria e percentual." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("alocacao_investimento").insert({
    cenario_id,
    categoria,
    percentual,
    observacoes,
  });

  if (error) {
    return { error: "Não foi possível salvar a alocação." };
  }

  revalidatePath("/relatorios");
  return { error: null, success: true };
}

export async function excluirAlocacaoInvestimento(id: string) {
  const supabase = await createClient();
  await supabase.from("alocacao_investimento").delete().eq("id", id);
  revalidatePath("/relatorios");
}
