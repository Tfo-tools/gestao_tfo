"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Inclui ou retira um produto de um cenário.
 *
 * Só vale para cenários que não são o Base: o Base é o plano da empresa e absorve automaticamente
 * todo produto aprovado ou iniciado, então lá a escolha se faz pelo status, em Produtos.
 *
 * Ao desmarcar, a projeção daquele produto neste cenário é apagada — se ficasse gravada, as telas
 * continuariam somando receita de um produto que o cenário não simula mais.
 */
export async function alternarProdutoNoCenario(
  cenarioId: string,
  produtoId: string,
  incluir: boolean,
): Promise<{ error: string | null }> {
  if (!cenarioId || !produtoId) return { error: "Dados incompletos." };

  const supabase = await createClient();
  const { data: cenario } = await supabase.from("cenarios").select("is_base").eq("id", cenarioId).single();

  if (cenario?.is_base) {
    return { error: "No cenário Base os produtos entram pelo status. Mude o status do produto em Produtos." };
  }

  if (incluir) {
    const { error } = await supabase.from("produto_cenario").insert({ cenario_id: cenarioId, produto_id: produtoId });
    if (error && !error.message.includes("duplicate")) return { error: "Não foi possível incluir o produto." };
  } else {
    const { error } = await supabase
      .from("produto_cenario")
      .delete()
      .eq("cenario_id", cenarioId)
      .eq("produto_id", produtoId);
    if (error) return { error: "Não foi possível retirar o produto." };
    await supabase.from("simulacao_mensal").delete().eq("cenario_id", cenarioId).eq("produto_id", produtoId);
  }

  revalidatePath("/plano", "layout");
  revalidatePath("/relatorios");
  revalidatePath("/indicadores");
  return { error: null };
}
