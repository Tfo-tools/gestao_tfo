"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CenarioFormState = { error: string | null };

export async function criarCenario(
  _prevState: CenarioFormState,
  formData: FormData,
): Promise<CenarioFormState> {
  const nome = String(formData.get("nome") || "").trim();
  const descricao = String(formData.get("descricao") || "").trim() || null;
  const duplicarDe = String(formData.get("duplicar_de") || "") || null;

  if (!nome) {
    return { error: "Dê um nome para o cenário." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: novoCenario, error } = await supabase
    .from("cenarios")
    .insert({
      nome,
      descricao,
      status: "rascunho",
      is_base: false,
      cenario_origem_id: duplicarDe,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !novoCenario) {
    return { error: "Não foi possível criar o cenário." };
  }

  if (duplicarDe) {
    const { data: fasesOrigem } = await supabase
      .from("fases_produto")
      .select(
        "id, produto_id, fase, data_inicio, data_fim, taxa_crescimento_mensal, taxa_churn_mensal, observacoes",
      )
      .eq("cenario_id", duplicarDe);

    for (const fase of fasesOrigem ?? []) {
      const { data: novaFase } = await supabase
        .from("fases_produto")
        .insert({
          produto_id: fase.produto_id,
          cenario_id: novoCenario.id,
          fase: fase.fase,
          data_inicio: fase.data_inicio,
          data_fim: fase.data_fim,
          taxa_crescimento_mensal: fase.taxa_crescimento_mensal,
          taxa_churn_mensal: fase.taxa_churn_mensal,
          observacoes: fase.observacoes,
        })
        .select("id")
        .single();

      if (!novaFase) continue;

      const [{ data: betaOrigem }, { data: funilOrigem }, { data: fixosOrigem }, { data: variaveisOrigem }, { data: alocacoesOrigem }] =
        await Promise.all([
          supabase.from("beta_testers_config").select("*").eq("fase_produto_id", fase.id),
          supabase.from("premissas_funil").select("*").eq("fase_produto_id", fase.id),
          supabase
            .from("plano_custos_fixos")
            .select("plano_contas_id, tipo, item, quantidade, valor_unitario")
            .eq("fase_produto_id", fase.id),
          supabase
            .from("plano_custos_variaveis")
            .select("plano_contas_id, item, tipo_calculo, valor_base, percentual, valor_por_unidade")
            .eq("fase_produto_id", fase.id),
          supabase
            .from("equipe_alocada")
            .select("cargo, categoria, quantidade_funcionarios, horas_mes, custo_hora")
            .eq("fase_produto_id", fase.id),
        ]);

      for (const beta of betaOrigem ?? []) {
        await supabase.from("beta_testers_config").insert({
          fase_produto_id: novaFase.id,
          quantidade: beta.quantidade,
          duracao_dias: beta.duracao_dias,
          tipo: beta.tipo,
          bonificacao_meses: beta.bonificacao_meses,
          sem_custo_adicional: beta.sem_custo_adicional,
        });
      }

      for (const funil of funilOrigem ?? []) {
        await supabase.from("premissas_funil").insert({
          fase_produto_id: novaFase.id,
          taxa_conversao: funil.taxa_conversao,
          capacidade_vendedor_mes: funil.capacidade_vendedor_mes,
          span_of_control: funil.span_of_control,
          custo_hora_sdr: funil.custo_hora_sdr,
        });
      }

      if (fixosOrigem && fixosOrigem.length > 0) {
        await supabase
          .from("plano_custos_fixos")
          .insert(fixosOrigem.map((f) => ({ ...f, fase_produto_id: novaFase.id })));
      }
      if (variaveisOrigem && variaveisOrigem.length > 0) {
        await supabase
          .from("plano_custos_variaveis")
          .insert(variaveisOrigem.map((v) => ({ ...v, fase_produto_id: novaFase.id })));
      }
      if (alocacoesOrigem && alocacoesOrigem.length > 0) {
        await supabase
          .from("equipe_alocada")
          .insert(alocacoesOrigem.map((a) => ({ ...a, fase_produto_id: novaFase.id })));
      }
    }

    const { data: contratacoesOrigem } = await supabase
      .from("contratacoes")
      .select(
        "produto_id, cargo, categoria, tipo_contratacao, nome_referencia, salario_bruto, regime_id, valor_mensal, quantidade_pessoas, inclui_coordenador, data_inicio, data_fim, observacoes",
      )
      .eq("cenario_id", duplicarDe);

    if (contratacoesOrigem && contratacoesOrigem.length > 0) {
      await supabase
        .from("contratacoes")
        .insert(contratacoesOrigem.map((c) => ({ ...c, cenario_id: novoCenario.id })));
    }
  }

  revalidatePath("/cenarios");
  redirect(`/produtos?cenario=${novoCenario.id}`);
}
