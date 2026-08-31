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
        "id, produto_id, fase, data_inicio, data_fim, taxa_crescimento_mensal, taxa_churn_mensal, investimento_ms_mensal, observacoes",
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
          investimento_ms_mensal: fase.investimento_ms_mensal,
          observacoes: fase.observacoes,
        })
        .select("id")
        .single();

      if (!novaFase) continue;

      const [{ data: betaOrigem }, { data: funilOrigem }] = await Promise.all([
        supabase.from("beta_testers_config").select("*").eq("fase_produto_id", fase.id),
        supabase.from("premissas_funil").select("*").eq("fase_produto_id", fase.id),
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
    }
  }

  revalidatePath("/cenarios");
  redirect(`/produtos?cenario=${novoCenario.id}`);
}
