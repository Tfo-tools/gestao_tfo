"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CogsPremissas } from "@/lib/cogs";

export type ActionState = { error: string | null; success?: boolean };

/** Grava as premissas de COGS de um produto no cenário. O JSON inteiro vem do formulário já
 *  montado no cliente — uma única escrita, sem risco de meio-salvar. */
export async function salvarCogsPremissas(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const cenario_id = String(formData.get("cenario_id") || "");
  const produto_id = String(formData.get("produto_id") || "");
  const bruto = String(formData.get("parametros") || "");
  if (!cenario_id || !produto_id || !bruto) return { error: "Faltou identificar produto ou cenário." };

  let parametros: CogsPremissas;
  try {
    parametros = JSON.parse(bruto);
  } catch {
    return { error: "Não foi possível ler as premissas." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cogs_premissas")
    .upsert({ cenario_id, produto_id, parametros, updated_at: new Date().toISOString() }, { onConflict: "cenario_id,produto_id" });
  if (error) return { error: "Não foi possível salvar as premissas de COGS." };

  revalidatePath(`/plano/${cenario_id}/custos`);
  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}
