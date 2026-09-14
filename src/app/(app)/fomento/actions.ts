"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

export async function criarPrograma(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const nome = String(formData.get("nome") || "").trim();
  const tipo = String(formData.get("tipo") || "");
  const valorTotalRaw = formData.get("valor_total");
  const valor_total =
    valorTotalRaw && valorTotalRaw !== "" ? Number(valorTotalRaw) : null;
  const valorPropostoRaw = formData.get("valor_proposto");
  const valor_proposto =
    valorPropostoRaw && valorPropostoRaw !== ""
      ? Number(valorPropostoRaw)
      : null;
  const valor_subvencao = formData.get("valor_subvencao")
    ? Number(formData.get("valor_subvencao"))
    : 0;
  const valor_contrapartida = formData.get("valor_contrapartida")
    ? Number(formData.get("valor_contrapartida"))
    : 0;
  const data_assinatura_prevista =
    String(formData.get("data_assinatura_prevista") || "") || null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!nome || !tipo || (!valor_total && !valor_proposto)) {
    return {
      error:
        "Preencha nome, tipo e o valor total (ou o valor proposto, se ainda não foi aprovado).",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("programas_investimento").insert({
    nome,
    tipo,
    valor_total,
    valor_proposto,
    valor_subvencao,
    valor_contrapartida,
    data_assinatura_prevista,
    observacoes,
    status: "em_negociacao",
  });

  if (error) return { error: "Não foi possível criar o programa." };

  revalidatePath("/fomento");
  return { error: null, success: true };
}

export async function atualizarStatusPrograma(id: string, status: string) {
  const supabase = await createClient();
  await supabase.from("programas_investimento").update({ status }).eq("id", id);
  revalidatePath("/fomento");
}

/** Confirma o valor aprovado — pode ser igual, menor ou (se recusado) o programa fica encerrado
 * sem valor. Separado do valor_proposto, que fica registrado como histórico do que foi pedido. */
export async function confirmarValorAprovado(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const valor_total = Number(formData.get("valor_total") || 0);

  if (!id || !valor_total) {
    return { error: "Informe o valor aprovado." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("programas_investimento")
    .update({ valor_total })
    .eq("id", id);

  if (error) return { error: "Não foi possível salvar o valor aprovado." };

  revalidatePath("/fomento");
  return { error: null, success: true };
}

/** Altera o valor PEDIDO enquanto o programa ainda não foi aprovado — a tese do aporte muda
 *  (ex: R$500k → R$800k) e a planilha do investidor precisa seguir o pedido atual. */
export async function alterarValorProposto(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const valor_proposto = Number(formData.get("valor_proposto") || 0);
  if (!id || !valor_proposto) return { error: "Informe o valor solicitado." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("programas_investimento")
    .update({ valor_proposto })
    .eq("id", id);
  if (error) return { error: "Não foi possível alterar o valor solicitado." };

  revalidatePath("/fomento");
  revalidatePath("/relatorios");
  revalidatePath("/plano", "layout");
  return { error: null, success: true };
}

export async function excluirPrograma(id: string) {
  const supabase = await createClient();
  await supabase.from("programas_investimento").delete().eq("id", id);
  revalidatePath("/fomento");
}

export async function criarParcela(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const programa_id = String(formData.get("programa_id") || "");
  const numero_parcela = Number(formData.get("numero_parcela") || 1);
  const valor = Number(formData.get("valor") || 0);
  const percentual = formData.get("percentual")
    ? Number(formData.get("percentual"))
    : null;
  const data_prevista = String(formData.get("data_prevista") || "") || null;
  const condicao = String(formData.get("condicao") || "").trim() || null;

  if (!programa_id || !valor) {
    return { error: "Preencha o valor da parcela." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("parcelas_investimento").insert({
    programa_id,
    numero_parcela,
    valor,
    percentual,
    data_prevista,
    condicao,
    status: "prevista",
  });

  if (error) return { error: "Não foi possível salvar a parcela." };

  revalidatePath("/fomento");
  return { error: null, success: true };
}

export async function excluirParcela(id: string) {
  const supabase = await createClient();
  await supabase.from("parcelas_investimento").delete().eq("id", id);
  revalidatePath("/fomento");
}

export async function atualizarValuationPrograma(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("programa_id") || "");
  const valuation_pre_money = Number(formData.get("valuation_pre_money") || 0);
  const data_aporte = String(formData.get("data_aporte") || "") || null;

  if (!id || !valuation_pre_money) {
    return { error: "Informe o valuation pré-money." };
  }

  const supabase = await createClient();
  const { data: programa } = await supabase
    .from("programas_investimento")
    .select("valor_total, valor_proposto")
    .eq("id", id)
    .single();
  if (!programa) return { error: "Programa não encontrado." };

  // Rodada em negociação ainda não tem valor aprovado: o pós-money sai do valor proposto. Quando a
  // aprovação vier menor, é só editar a rodada de novo que o pós-money se refaz.
  const aporte = Number(programa.valor_total ?? programa.valor_proposto ?? 0);
  if (aporte <= 0)
    return {
      error:
        "Informe o valor solicitado do programa antes de precificar a rodada.",
    };
  const valuation_post_money = valuation_pre_money + aporte;

  const { error } = await supabase
    .from("programas_investimento")
    .update({ valuation_pre_money, valuation_post_money, data_aporte })
    .eq("id", id);

  if (error) return { error: "Não foi possível salvar o valuation." };

  revalidatePath("/fomento");
  revalidatePath("/relatorios");
  return { error: null, success: true };
}

export async function criarReavaliacao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const programa_id = String(formData.get("programa_id") || "");
  const data_referencia = String(formData.get("data_referencia") || "");
  const novo_valuation = Number(formData.get("novo_valuation") || 0);
  const fator_diluicao = Number(formData.get("fator_diluicao") || 0) / 100;
  const tipo_evento = String(formData.get("tipo_evento") || "reavaliacao");
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!programa_id || !data_referencia || !novo_valuation) {
    return { error: "Preencha data e novo valuation." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reavaliacoes_valuation").insert({
    programa_id,
    data_referencia,
    novo_valuation,
    fator_diluicao,
    tipo_evento,
    observacoes,
  });

  if (error) return { error: "Não foi possível salvar a reavaliação." };

  revalidatePath("/fomento");
  revalidatePath("/relatorios");
  return { error: null, success: true };
}

export async function excluirReavaliacao(id: string) {
  const supabase = await createClient();
  await supabase.from("reavaliacoes_valuation").delete().eq("id", id);
  revalidatePath("/fomento");
  revalidatePath("/relatorios");
}

function deslocarData(
  dataIso: string | null | undefined,
  deltaDias: number,
): string | null {
  if (!dataIso) return null;
  const d = new Date(dataIso + "T00:00:00");
  d.setDate(d.getDate() + deltaDias);
  return d.toISOString().slice(0, 10);
}

/** Cria um cenário de planejamento pra um programa de captação, clonando o Plano Base e
 * deslocando todas as datas pra começar na data prevista do programa — assim o plano já nasce
 * com a progressão dos custos atuais a partir de quando o investimento deve entrar, em vez de
 * recomeçar do zero. Já vincula o cenário novo ao programa. */
export async function criarCenarioParaPrograma(
  programaId: string,
): Promise<{ error: string | null; cenarioId?: string }> {
  const supabase = await createClient();

  const { data: programa } = await supabase
    .from("programas_investimento")
    .select("nome, data_assinatura_prevista, data_aporte")
    .eq("id", programaId)
    .single();
  if (!programa) return { error: "Programa não encontrado." };

  const dataAlvo = programa.data_assinatura_prevista ?? programa.data_aporte;
  if (!dataAlvo)
    return {
      error:
        "Preencha a data prevista de assinatura do programa antes de gerar o plano.",
    };

  const { data: base } = await supabase
    .from("cenarios")
    .select("id")
    .eq("is_base", true)
    .maybeSingle();
  if (!base)
    return {
      error:
        "Nenhum cenário marcado como Plano Base — marque um cenário como base em Cenários primeiro.",
    };

  const { data: fasesBase } = await supabase
    .from("fases_produto")
    .select("data_inicio")
    .eq("cenario_id", base.id)
    .order("data_inicio", { ascending: true })
    .limit(1);
  const primeiraDataBase = fasesBase?.[0]?.data_inicio;
  if (!primeiraDataBase)
    return {
      error: "O Plano Base ainda não tem fases de produto cadastradas.",
    };

  const deltaDias = Math.round(
    (new Date(dataAlvo + "T00:00:00").getTime() -
      new Date(primeiraDataBase + "T00:00:00").getTime()) /
      86400000,
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: novoCenario, error } = await supabase
    .from("cenarios")
    .insert({
      nome: `Captação — ${programa.nome}`,
      descricao: `Gerado a partir do Plano Base, com custos projetados a partir de ${dataAlvo} (data prevista do programa).`,
      status: "rascunho",
      is_base: false,
      cenario_origem_id: base.id,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !novoCenario)
    return { error: "Não foi possível criar o cenário." };

  const { data: fasesOrigem } = await supabase
    .from("fases_produto")
    .select(
      "id, produto_id, fase, data_inicio, data_fim, taxa_crescimento_mensal, taxa_churn_mensal, observacoes",
    )
    .eq("cenario_id", base.id);

  for (const fase of fasesOrigem ?? []) {
    const { data: novaFase } = await supabase
      .from("fases_produto")
      .insert({
        produto_id: fase.produto_id,
        cenario_id: novoCenario.id,
        fase: fase.fase,
        data_inicio: deslocarData(fase.data_inicio, deltaDias),
        data_fim: deslocarData(fase.data_fim, deltaDias),
        taxa_crescimento_mensal: fase.taxa_crescimento_mensal,
        taxa_churn_mensal: fase.taxa_churn_mensal,
        observacoes: fase.observacoes,
      })
      .select("id")
      .single();
    if (!novaFase) continue;

    const [
      { data: funilOrigem },
      { data: fixosOrigem },
      { data: variaveisOrigem },
      { data: alocacoesOrigem },
    ] = await Promise.all([
      supabase
        .from("premissas_funil")
        .select("*")
        .eq("fase_produto_id", fase.id),
      supabase
        .from("plano_custos_fixos")
        .select("plano_contas_id, tipo, item, quantidade, valor_unitario")
        .eq("fase_produto_id", fase.id),
      supabase
        .from("plano_custos_variaveis")
        .select(
          "plano_contas_id, item, tipo_calculo, valor_base, percentual, valor_por_unidade",
        )
        .eq("fase_produto_id", fase.id),
      supabase
        .from("equipe_alocada")
        .select(
          "cargo, categoria, quantidade_funcionarios, horas_mes, custo_hora",
        )
        .eq("fase_produto_id", fase.id),
    ]);

    for (const funil of funilOrigem ?? []) {
      await supabase.from("premissas_funil").insert({
        fase_produto_id: novaFase.id,
        taxa_conversao: funil.taxa_conversao,
        capacidade_vendedor_mes: funil.capacidade_vendedor_mes,
        span_of_control: funil.span_of_control,
        custo_hora_sdr: funil.custo_hora_sdr,
        horas_suporte_por_cliente_mes: funil.horas_suporte_por_cliente_mes,
      });
    }
    if (fixosOrigem && fixosOrigem.length > 0) {
      await supabase
        .from("plano_custos_fixos")
        .insert(
          fixosOrigem.map((f) => ({ ...f, fase_produto_id: novaFase.id })),
        );
    }
    if (variaveisOrigem && variaveisOrigem.length > 0) {
      await supabase
        .from("plano_custos_variaveis")
        .insert(
          variaveisOrigem.map((v) => ({ ...v, fase_produto_id: novaFase.id })),
        );
    }
    if (alocacoesOrigem && alocacoesOrigem.length > 0) {
      await supabase
        .from("equipe_alocada")
        .insert(
          alocacoesOrigem.map((a) => ({ ...a, fase_produto_id: novaFase.id })),
        );
    }
  }

  const { data: contratacoesOrigem } = await supabase
    .from("contratacoes")
    .select(
      "produto_id, cargo, categoria, tipo_contratacao, nome_referencia, salario_bruto, regime_id, valor_mensal, quantidade_pessoas, inclui_coordenador, data_inicio, data_fim, observacoes",
    )
    .eq("cenario_id", base.id);
  if (contratacoesOrigem && contratacoesOrigem.length > 0) {
    await supabase.from("contratacoes").insert(
      contratacoesOrigem.map((c) => ({
        ...c,
        cenario_id: novoCenario.id,
        data_inicio: deslocarData(c.data_inicio, deltaDias),
        data_fim: deslocarData(c.data_fim, deltaDias),
      })),
    );
  }

  const { data: betasOrigem } = await supabase
    .from("beta_testers_config")
    .select(
      "produto_id, quantidade, data_inicio, data_fim, tipo, condicao_especial_pct, condicao_especial_meses",
    )
    .eq("cenario_id", base.id);
  if (betasOrigem && betasOrigem.length > 0) {
    await supabase.from("beta_testers_config").insert(
      betasOrigem.map((b) => ({
        ...b,
        cenario_id: novoCenario.id,
        data_inicio: deslocarData(b.data_inicio, deltaDias),
        data_fim: deslocarData(b.data_fim, deltaDias),
      })),
    );
  }

  const { data: custosEmpresaOrigem } = await supabase
    .from("custos_empresa")
    .select(
      "item, plano_contas_id, tipo_custo, valor_mensal, data_inicio, data_fim, parametros, observacoes",
    )
    .eq("cenario_id", base.id);
  if (custosEmpresaOrigem && custosEmpresaOrigem.length > 0) {
    await supabase.from("custos_empresa").insert(
      custosEmpresaOrigem.map((c) => ({
        ...c,
        cenario_id: novoCenario.id,
        data_inicio: deslocarData(c.data_inicio, deltaDias),
        data_fim: deslocarData(c.data_fim, deltaDias),
      })),
    );
  }

  const { data: alocacoesModeloOrigem } = await supabase
    .from("alocacao_modelo_contratacao")
    .select("produto_id, cargo, modelo_id, quantidade, data_inicio, data_fim")
    .eq("cenario_id", base.id);
  if (alocacoesModeloOrigem && alocacoesModeloOrigem.length > 0) {
    await supabase.from("alocacao_modelo_contratacao").insert(
      alocacoesModeloOrigem.map((a) => ({
        ...a,
        cenario_id: novoCenario.id,
        data_inicio: deslocarData(a.data_inicio, deltaDias),
        data_fim: deslocarData(a.data_fim, deltaDias),
      })),
    );
  }

  await supabase
    .from("cenario_programas")
    .insert({ cenario_id: novoCenario.id, programa_id: programaId });

  revalidatePath("/fomento");
  revalidatePath("/cenarios");
  revalidatePath("/relatorios");
  return { error: null, cenarioId: novoCenario.id };
}

export async function alternarVinculoCenario(
  programaId: string,
  cenarioId: string,
  vincular: boolean,
) {
  const supabase = await createClient();
  if (vincular) {
    await supabase
      .from("cenario_programas")
      .insert({ cenario_id: cenarioId, programa_id: programaId });
  } else {
    await supabase
      .from("cenario_programas")
      .delete()
      .eq("cenario_id", cenarioId)
      .eq("programa_id", programaId);
  }
  revalidatePath("/fomento");
  revalidatePath("/relatorios");
}
