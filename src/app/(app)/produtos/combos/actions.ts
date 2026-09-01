"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

export async function salvarTierCombo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const quantidade_produtos = Number(formData.get("quantidade_produtos") || 0);
  const desconto_pct = formData.get("desconto_pct") ? Number(formData.get("desconto_pct")) / 100 : 0;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!quantidade_produtos || quantidade_produtos < 2) {
    return { error: "Informe a quantidade de produtos (mínimo 2)." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("combos_desconto")
    .upsert({ quantidade_produtos, desconto_pct, observacoes }, { onConflict: "quantidade_produtos" });

  if (error) {
    return { error: "Não foi possível salvar o pacote." };
  }

  revalidatePath("/produtos/combos");
  return { error: null, success: true };
}

export async function excluirTierCombo(id: string) {
  const supabase = await createClient();
  await supabase.from("combos_desconto").delete().eq("id", id);
  revalidatePath("/produtos/combos");
}
