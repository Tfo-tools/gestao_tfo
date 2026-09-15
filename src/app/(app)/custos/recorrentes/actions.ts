"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function alternarRecorrente(id: string, ativo: boolean) {
  const supabase = await createClient();
  await supabase.from("despesas_recorrentes").update({ ativo, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/custos/recorrentes");
}

/** Só pra recorrência criada errada (cadastro duplicado, valor trocado etc). Se algum mês dela já
 * virou despesa lançada, o banco recusa a exclusão (a recorrência é referência daquele lançamento
 * real) — nesse caso, pausar é o caminho, não excluir. */
export async function excluirRecorrente(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("despesas_recorrentes").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return { error: "Essa recorrência já gerou despesas lançadas — não dá pra excluir sem apagar histórico real. Pause em vez de excluir." };
    }
    return { error: "Não foi possível excluir." };
  }
  revalidatePath("/custos/recorrentes");
  return { error: null };
}

// Anexar fatura/comprovante e marcar como comprovado, pros lançamentos gerados por uma
// recorrência, deixou de existir nesta tela — vira responsabilidade única do Extrato (que já
// cobre isso pra qualquer despesa, recorrente ou avulsa, com filtro e ordenação). A regra fixa de
// "só sai de pendente com fatura E comprovante" não valia pra assinatura cobrada direto no
// cartão, onde só existe a invoice — no Extrato quem decide se aquele arquivo já basta é a pessoa
// lançando, caso a caso, não uma regra única pra toda despesa.
