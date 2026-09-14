"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

function revalidar() {
  revalidatePath("/relatorios");
  revalidatePath("/plano", "layout");
}

/** Receita realizada antes do produto (ex: consultoria). Não entra na simulação — é contexto. */
export async function salvarReceitaHistorica(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "") || null;
  const cenario_id = String(formData.get("cenario_id") || "");
  const descricao = String(formData.get("descricao") || "").trim();
  const valor_mensal = Number(
    String(formData.get("valor_mensal") || "").replace(",", "."),
  );
  const inicio = String(formData.get("data_inicio") || "");
  const fim = String(formData.get("data_fim") || "");
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!cenario_id || !descricao) return { error: "Informe a descrição." };
  if (!Number.isFinite(valor_mensal) || valor_mensal <= 0)
    return { error: "Informe o valor mensal." };
  if (!inicio) return { error: "Informe o mês de início." };
  // Os campos da tela são <input type="month">, então chegam como "AAAA-MM".
  const data_inicio = `${inicio.slice(0, 7)}-01`;
  const data_fim = fim ? `${fim.slice(0, 7)}-01` : null;
  if (data_fim && data_fim < data_inicio)
    return { error: "O fim não pode ser antes do início." };

  const supabase = await createClient();
  const dados = {
    cenario_id,
    descricao,
    valor_mensal,
    data_inicio,
    data_fim,
    observacoes,
  };
  const { error } = id
    ? await supabase.from("receitas_historicas").update(dados).eq("id", id)
    : await supabase.from("receitas_historicas").insert(dados);
  if (error) return { error: "Não foi possível salvar." };

  revalidar();
  return { error: null, success: true };
}

/** Liga e desliga a exibição sem apagar o registro — pra comparar com e sem antes de apresentar. */
export async function alternarReceitaHistorica(id: string, mostrar: boolean) {
  const supabase = await createClient();
  await supabase.from("receitas_historicas").update({ mostrar }).eq("id", id);
  revalidar();
}

/** Liga/desliga a entrada na DRE projetada (receita + imposto, sem COGS). */
export async function alternarReceitaNaDre(id: string, entra_na_dre: boolean) {
  const supabase = await createClient();
  await supabase
    .from("receitas_historicas")
    .update({ entra_na_dre })
    .eq("id", id);
  revalidar();
}

export async function excluirReceitaHistorica(id: string) {
  const supabase = await createClient();
  await supabase.from("receitas_historicas").delete().eq("id", id);
  revalidar();
}
