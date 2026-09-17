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
  // Em pontos (40 = 40%). Quem digita "0,4" quis dizer 40 — normaliza em vez de gravar 0,4%.
  const bruto = Number(String(formData.get("percentual") || "0").replace(",", "."));
  const percentual = bruto > 0 && bruto <= 1 ? bruto * 100 : bruto;
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
  revalidatePath("/plano", "layout");
  return { error: null, success: true };
}

export async function excluirAlocacaoInvestimento(id: string) {
  const supabase = await createClient();
  await supabase.from("alocacao_investimento").delete().eq("id", id);
  revalidatePath("/relatorios");
  revalidatePath("/plano", "layout");
}
