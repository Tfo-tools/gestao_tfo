"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

export async function salvarFunil(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const fase = String(formData.get("fase") || "");

  if (!produto_id || !cenario_id || !fase) {
    return { error: "Dados incompletos." };
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

  const taxaConversaoRaw = formData.get("taxa_conversao");
  const capacidadeRaw = formData.get("capacidade_vendedor_mes");

  if (taxaConversaoRaw && capacidadeRaw) {
    const { error } = await supabase.from("premissas_funil").upsert(
      {
        fase_produto_id: faseProdutoId,
        taxa_conversao: Number(taxaConversaoRaw) / 100,
        capacidade_vendedor_mes: Number(capacidadeRaw),
        span_of_control: formData.get("span_of_control") ? Number(formData.get("span_of_control")) : 8,
        horas_suporte_por_cliente_mes: formData.get("horas_suporte_por_cliente_mes")
          ? Number(formData.get("horas_suporte_por_cliente_mes"))
          : null,
      },
      { onConflict: "fase_produto_id" },
    );
    if (error) return { error: "Não foi possível salvar as premissas do funil." };
  }

  revalidatePath(`/funil/${produto_id}`);
  return { error: null, success: true };
}
