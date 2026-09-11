"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

const CHAVES = [
  "iss_pct",
  "pis_pct",
  "cofins_pct",
  "cbs_pct",
  "ibs_pct",
  "presuncao_pct",
  "irpj_pct",
  "irpj_adicional_pct",
  "csll_pct",
  "credito_fator",
] as const;

/** Alíquotas de depois do Simples — a tela pede em %, o banco guarda a fração (5% → 0,05). */
export async function salvarParametrosTributarios(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const dados: Record<string, number> = {};
  for (const k of CHAVES) {
    const v = formData.get(k);
    if (v === null || v === "") continue;
    const n = Number(String(v).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) return { error: "Informe percentuais entre 0 e 100." };
    dados[k] = n / 100;
  }
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("parametros_tributarios")
    .upsert({ id: 1, ...dados, observacoes, atualizado_em: new Date().toISOString() });
  if (error) return { error: "Não foi possível salvar as alíquotas." };

  revalidatePath("/configuracoes");
  revalidatePath("/relatorios");
  revalidatePath("/plano", "layout");
  return { error: null, success: true };
}
