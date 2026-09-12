"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { StatusProduto } from "@/lib/fases-produto";

/**
 * Muda o status do produto — decisão de negócio global, não de cenário.
 *
 * Consequência: o Base (plano da empresa) absorve automaticamente o que estiver aprovado ou
 * iniciado, então promover um produto já o coloca no plano, e rebaixá-lo o tira. Por isso o
 * rebaixamento de um produto iniciado é recusado: o que já foi lançado e gera receita não volta a
 * ser hipótese. Se a intenção é ajustar as datas das fases, o caminho é voltar para aprovado.
 */
export async function alterarStatusProduto(
  produtoId: string,
  status: StatusProduto,
): Promise<{ error: string | null }> {
  if (!produtoId) return { error: "Produto não identificado." };

  const supabase = await createClient();
  const { data: atual } = await supabase.from("produtos").select("status, nome").eq("id", produtoId).single();

  if (atual?.status === "iniciado" && (status === "planejado" || status === "descartado")) {
    return {
      error: `${atual.nome} já foi iniciado: não é coerente voltar para ${status}. Se precisa ajustar as datas das fases, mude para aprovado.`,
    };
  }

  const { error } = await supabase.from("produtos").update({ status }).eq("id", produtoId);
  if (error) return { error: "Não foi possível mudar o status." };

  revalidatePath("/produtos");
  revalidatePath(`/produtos/${produtoId}`);
  revalidatePath("/plano", "layout");
  revalidatePath("/relatorios");
  return { error: null };
}
