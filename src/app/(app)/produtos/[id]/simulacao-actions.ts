"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calcularSimulacao, type SimulacaoInput } from "@/lib/simulacao";
import { grupoDeConta } from "@/lib/grupo-conta";
import type { FaseValue } from "@/lib/fases";

type PlanoRow = { id: string; tipo_cobranca: string; preco: number; mix_percentual: number | null; reajuste_anual_pct: number | null };
type PlanoFaseRow = { plano_id: string; fase: string; preco: number };

export type SimulacaoActionState = { error: string | null; success?: boolean };

export async function recalcularSimulacao(
  produtoId: string,
  cenarioId: string,
): Promise<SimulacaoActionState> {
  const supabase = await createClient();

  const [{ data: produto }, { data: fases }, { data: planos }] = await Promise.all([
    supabase
      .from("produtos")
      .select("data_inicio_desenvolvimento, data_lancamento_estimada")
      .eq("id", produtoId)
      .single(),
    supabase
      .from("fases_produto")
      .select("id, fase, data_inicio, data_fim, taxa_crescimento_mensal, taxa_churn_mensal")
      .eq("produto_id", produtoId)
      .eq("cenario_id", cenarioId),
    supabase
      .from("planos_precificacao")
      .select("id, tipo_cobranca, preco, mix_percentual, reajuste_anual_pct")
      .eq("produto_id", produtoId),
  ]);

  if (!produto) {
    return { error: "Produto não encontrado." };
  }
  if (!fases || fases.length === 0) {
    return { error: "Cadastre pelo menos uma fase em Produtos antes de calcular." };
  }

  const faseIdByValue = new Map(fases.map((f) => [f.fase as FaseValue, f.id as string]));
  const faseIds = fases.map((f) => f.id);
  const planoIds = (planos ?? []).map((p) => p.id);

  const [
    { data: betas },
    { data: funis },
    { data: contratacoesRaw },
    { data: regimes },
    { data: custosFixosRaw },
    { data: custosVariaveisRaw },
    { data: alocacoesRaw },
    { data: planosFasesRaw },
    { data: modulosRaw },
  ] = await Promise.all([
      supabase.from("beta_testers_config").select("fase_produto_id, quantidade, duracao_dias, bonificacao_meses").in("fase_produto_id", faseIds),
      supabase.from("premissas_funil").select("fase_produto_id, taxa_conversao, capacidade_vendedor_mes, span_of_control").in("fase_produto_id", faseIds),
      supabase
        .from("contratacoes")
        .select("cargo, tipo_contratacao, salario_bruto, regime_id, valor_mensal, data_inicio, data_fim")
        .eq("cenario_id", cenarioId)
        .eq("produto_id", produtoId),
      supabase.from("encargos_regimes").select("id, aliquota_total_efetiva"),
      supabase
        .from("plano_custos_fixos")
        .select("fase_produto_id, quantidade, valor_unitario, plano_contas:plano_contas_id(codigo, tipo)")
        .in("fase_produto_id", faseIds),
      supabase
        .from("plano_custos_variaveis")
        .select("fase_produto_id, tipo_calculo, valor_base, percentual, valor_por_unidade, plano_contas:plano_contas_id(codigo, tipo)")
        .in("fase_produto_id", faseIds),
      supabase
        .from("equipe_alocada")
        .select("fase_produto_id, categoria, quantidade_funcionarios, horas_mes, custo_hora")
        .in("fase_produto_id", faseIds),
      planoIds.length > 0
        ? supabase.from("planos_precificacao_fases").select("plano_id, fase, preco").in("plano_id", planoIds)
        : Promise.resolve({ data: [] as PlanoFaseRow[] }),
      supabase
        .from("modulos_produto")
        .select("nome, preco, fase_lancamento, meses_apos_lancamento, adesao_inicial_pct, crescimento_adesao_mensal_pct")
        .eq("produto_id", produtoId),
    ]);

  const faseValueById = new Map(fases.map((f) => [f.id as string, f.fase as FaseValue]));
  const regimeAliquota = new Map((regimes ?? []).map((r) => [r.id, Number(r.aliquota_total_efetiva)]));

  const precosPorFaseByPlano = new Map<string, Partial<Record<FaseValue, number>>>();
  for (const pf of (planosFasesRaw ?? []) as PlanoFaseRow[]) {
    const atual = precosPorFaseByPlano.get(pf.plano_id) ?? {};
    atual[pf.fase as FaseValue] = Number(pf.preco);
    precosPorFaseByPlano.set(pf.plano_id, atual);
  }

  const input: SimulacaoInput = {
    dataInicioProduto: produto.data_inicio_desenvolvimento,
    dataLancamentoEstimada: produto.data_lancamento_estimada,
    fases: fases.map((f) => ({
      fase: f.fase as FaseValue,
      data_inicio: f.data_inicio,
      data_fim: f.data_fim,
      taxa_crescimento_mensal: f.taxa_crescimento_mensal,
      taxa_churn_mensal: f.taxa_churn_mensal,
    })),
    betas: (betas ?? []).map((b) => ({
      fase: faseValueById.get(b.fase_produto_id)!,
      quantidade: b.quantidade,
      duracao_dias: b.duracao_dias,
      bonificacao_meses: b.bonificacao_meses,
    })),
    funis: (funis ?? []).map((f) => ({
      fase: faseValueById.get(f.fase_produto_id)!,
      taxa_conversao: f.taxa_conversao,
      capacidade_vendedor_mes: f.capacidade_vendedor_mes,
      span_of_control: f.span_of_control,
    })),
    contratacoes: (contratacoesRaw ?? []).map((c) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cargo: c.cargo as any,
      data_inicio: c.data_inicio,
      data_fim: c.data_fim,
      custo_mensal:
        c.tipo_contratacao === "clt"
          ? Number(c.salario_bruto ?? 0) * (1 + (regimeAliquota.get(c.regime_id ?? "") ?? 0))
          : Number(c.valor_mensal ?? 0),
    })),
    alocacoes: (alocacoesRaw ?? []).map((a) => ({
      fase: faseValueById.get(a.fase_produto_id)!,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoria: a.categoria as any,
      quantidade_funcionarios: Number(a.quantidade_funcionarios),
      horas_mes: Number(a.horas_mes),
      custo_hora: Number(a.custo_hora),
    })),
    planos: ((planos ?? []) as PlanoRow[]).map((p) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tipo_cobranca: p.tipo_cobranca as any,
      preco: Number(p.preco),
      mix_percentual: p.mix_percentual,
      reajuste_anual_pct: p.reajuste_anual_pct,
      precos_por_fase: precosPorFaseByPlano.get(p.id) ?? {},
    })),
    modulos: (modulosRaw ?? []).map((m) => ({
      nome: m.nome,
      preco: Number(m.preco),
      fase_lancamento: (m.fase_lancamento as FaseValue) ?? null,
      meses_apos_lancamento: m.meses_apos_lancamento,
      adesao_inicial_pct: Number(m.adesao_inicial_pct),
      crescimento_adesao_mensal_pct: Number(m.crescimento_adesao_mensal_pct),
    })),
    custosFixos: (custosFixosRaw ?? []).map((c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conta = c.plano_contas as any;
      const grupoBruto = conta ? grupoDeConta(conta.codigo, conta.tipo) : "outros";
      const grupo = grupoBruto === "financeiro" || grupoBruto === "ativo" ? "outros" : grupoBruto;
      return {
        fase: faseValueById.get(c.fase_produto_id)!,
        grupo,
        quantidade: Number(c.quantidade ?? 1),
        valor_unitario: Number(c.valor_unitario ?? 0),
      };
    }),
    custosVariaveis: (custosVariaveisRaw ?? []).map((c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conta = c.plano_contas as any;
      const grupoBruto = conta ? grupoDeConta(conta.codigo, conta.tipo) : "outros";
      const grupo = grupoBruto === "financeiro" || grupoBruto === "ativo" ? "outros" : grupoBruto;
      return {
        fase: faseValueById.get(c.fase_produto_id)!,
        grupo,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tipo_calculo: c.tipo_calculo as any,
        valor_base: c.valor_base,
        percentual: c.percentual,
        valor_por_unidade: c.valor_por_unidade,
      };
    }),
  };

  const resultado = calcularSimulacao(input);

  if (resultado.length === 0) {
    return { error: "Não foi possível calcular — confira as datas das fases." };
  }

  const { error } = await supabase.from("simulacao_mensal").upsert(
    resultado.map((r) => ({
      produto_id: produtoId,
      cenario_id: cenarioId,
      ...r,
      calculado_em: new Date().toISOString(),
    })),
    { onConflict: "produto_id,cenario_id,mes_referencia" },
  );

  if (error) {
    return { error: "Não foi possível salvar a simulação." };
  }

  revalidatePath(`/produtos/${produtoId}`);
  revalidatePath("/");
  return { error: null, success: true };
}
