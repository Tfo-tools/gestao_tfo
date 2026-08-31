"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

export async function salvarFase(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const fase = String(formData.get("fase") || "");

  if (!produto_id || !cenario_id || !fase) {
    return { error: "Dados incompletos." };
  }

  const pct = (name: string) => {
    const v = formData.get(name);
    return v !== null && v !== "" ? Number(v) / 100 : null;
  };
  const num = (name: string) => {
    const v = formData.get(name);
    return v !== null && v !== "" ? Number(v) : null;
  };
  const str = (name: string) => {
    const v = String(formData.get(name) || "").trim();
    return v || null;
  };

  const supabase = await createClient();

  const { data: faseRow, error } = await supabase
    .from("fases_produto")
    .upsert(
      {
        produto_id,
        cenario_id,
        fase,
        data_inicio: str("data_inicio"),
        data_fim: str("data_fim"),
        taxa_crescimento_mensal: pct("taxa_crescimento_mensal"),
        taxa_churn_mensal: pct("taxa_churn_mensal"),
        investimento_ms_mensal: num("investimento_ms_mensal") ?? 0,
        observacoes: str("observacoes"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "produto_id,cenario_id,fase" },
    )
    .select("id")
    .single();

  if (error || !faseRow) {
    return { error: "Não foi possível salvar a fase." };
  }

  const betaQuantidade = formData.get("beta_quantidade");
  if (betaQuantidade !== null && betaQuantidade !== "") {
    const payload = {
      fase_produto_id: faseRow.id,
      quantidade: Number(betaQuantidade),
      duracao_dias: num("beta_duracao_dias"),
      tipo: str("beta_tipo") ?? "mvp_inicial",
      bonificacao_meses: num("beta_bonificacao_meses") ?? 0,
      sem_custo_adicional: formData.get("beta_sem_custo") === "on",
    };
    const { data: existingBeta } = await supabase
      .from("beta_testers_config")
      .select("id")
      .eq("fase_produto_id", faseRow.id)
      .maybeSingle();

    if (existingBeta) {
      await supabase.from("beta_testers_config").update(payload).eq("id", existingBeta.id);
    } else {
      await supabase.from("beta_testers_config").insert(payload);
    }
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export async function criarPlano(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const nome_plano = String(formData.get("nome_plano") || "").trim();
  const tipo_cobranca = String(formData.get("tipo_cobranca") || "");
  const tipo_venda = String(formData.get("tipo_venda") || "individual");
  const preco = Number(formData.get("preco") || 0);
  const desconto_pct = formData.get("desconto_pct") ? Number(formData.get("desconto_pct")) : 0;
  const is_annual_only = formData.get("is_annual_only") === "on";

  if (!produto_id || !nome_plano || !tipo_cobranca || !preco) {
    return { error: "Preencha nome do plano, cobrança e preço." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("planos_precificacao").insert({
    produto_id,
    nome_plano,
    tipo_cobranca,
    tipo_venda,
    preco,
    desconto_pct,
    is_annual_only,
  });

  if (error) {
    return { error: "Não foi possível salvar o plano." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export async function excluirPlano(planoId: string, produtoId: string) {
  const supabase = await createClient();
  await supabase.from("planos_precificacao").delete().eq("id", planoId);
  revalidatePath(`/produtos/${produtoId}`);
}
