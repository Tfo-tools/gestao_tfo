"use server";

import {
  custoImplementacaoDasEtapas,
  temAjusteDeEtapas,
} from "@/lib/implementacao";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calcularSimulacao, type SimulacaoInput } from "@/lib/simulacao";
import { subgrupoDeConta } from "@/lib/subgrupo-conta";
import type { FaseValue } from "@/lib/fases";
import { idsDoCenario, produtoEstaNoCenario } from "@/lib/fases-produto";
import { pontoPartidaDoProduto, type PontoPartida } from "@/lib/ponto-partida";
import { vendasAcaoPorMes, type AcaoMarketing } from "@/lib/acoes-marketing";

type PlanoRow = {
  id: string;
  nome_plano: string | null;
  tipo_cobranca: string;
  preco: number;
  mix_percentual: number | null;
  reajuste_anual_pct: number | null;
};
type PlanoFaseRow = { plano_id: string; fase: string; preco: number };

export type SimulacaoActionState = {
  error: string | null;
  success?: boolean;
  /** Cenário não simula este produto — não é falha, só não há o que calcular. */
  foraDoCenario?: boolean;
};

export async function recalcularSimulacao(
  produtoId: string,
  cenarioId: string,
): Promise<SimulacaoActionState> {
  const supabase = await createClient();

  const [
    { data: produto },
    { data: fases },
    { data: planos },
    { data: datasFases },
    noCenario,
  ] = await Promise.all([
    supabase
      .from("produtos")
      .select(
        "data_inicio_desenvolvimento, data_lancamento_estimada, tipo_precificacao, tem_implementacao, preco_implementacao, implementacao_parcelas, implementacao_formas_pagamento",
      )
      .eq("id", produtoId)
      .single(),
    supabase
      .from("fases_produto")
      .select(
        "id, fase, data_inicio, data_fim, taxa_crescimento_mensal, taxa_churn_mensal, fases_trimestres(indice, taxa_crescimento_mensal, taxa_churn_mensal)",
      )
      .eq("produto_id", produtoId)
      .eq("cenario_id", cenarioId),
    supabase
      .from("planos_precificacao")
      .select(
        "id, nome_plano, tipo_cobranca, preco, mix_percentual, reajuste_anual_pct",
      )
      .eq("produto_id", produtoId)
      .eq("cenario_id", cenarioId),
    // Datas de fase são do PRODUTO: as mesmas em todo cenário onde ele está vinculado.
    supabase
      .from("produto_fases")
      .select("fase, data_inicio, data_fim")
      .eq("produto_id", produtoId),
    produtoEstaNoCenario(supabase, produtoId, cenarioId),
  ]);

  if (!produto) {
    return { error: "Produto não encontrado." };
  }
  if (!noCenario) {
    // Não é erro: este cenário não simula este produto. Antes, um produto global sem fase no
    // cenário fazia o recálculo inteiro reportar falha — foi o que aconteceu com a Consultoria.
    await supabase
      .from("simulacao_mensal")
      .delete()
      .eq("produto_id", produtoId)
      .eq("cenario_id", cenarioId);
    return { error: null, foraDoCenario: true };
  }
  if (!fases || fases.length === 0) {
    return {
      error: "Cadastre pelo menos uma fase em Produtos antes de calcular.",
    };
  }

  const faseIdByValue = new Map(
    fases.map((f) => [f.fase as FaseValue, f.id as string]),
  );
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
    supabase
      .from("beta_testers_config")
      .select(
        "quantidade, data_inicio, data_fim, condicao_especial_pct, condicao_especial_meses",
      )
      .eq("produto_id", produtoId)
      .eq("cenario_id", cenarioId),
    supabase
      .from("premissas_funil")
      .select(
        "fase_produto_id, taxa_conversao, capacidade_vendedor_mes, span_of_control",
      )
      .in("fase_produto_id", faseIds),
    supabase
      .from("contratacoes")
      .select(
        "cargo, categoria, tipo_contratacao, salario_bruto, regime_id, valor_mensal, data_inicio, data_fim",
      )
      .eq("cenario_id", cenarioId)
      .eq("produto_id", produtoId),
    supabase.from("encargos_regimes").select("id, aliquota_total_efetiva"),
    supabase
      .from("plano_custos_fixos")
      .select(
        "fase_produto_id, quantidade, valor_unitario, plano_contas:plano_contas_id(codigo, tipo)",
      )
      .in("fase_produto_id", faseIds),
    supabase
      .from("plano_custos_variaveis")
      .select(
        "fase_produto_id, tipo_calculo, valor_base, percentual, valor_por_unidade, plano_contas:plano_contas_id(codigo, tipo)",
      )
      .in("fase_produto_id", faseIds),
    supabase
      .from("equipe_alocada")
      .select(
        "fase_produto_id, cargo, categoria, quantidade_funcionarios, horas_mes, custo_hora",
      )
      .in("fase_produto_id", faseIds),
    planoIds.length > 0
      ? supabase
          .from("planos_precificacao_fases")
          .select("plano_id, fase, preco")
          .in("plano_id", planoIds)
      : Promise.resolve({ data: [] as PlanoFaseRow[] }),
    supabase
      .from("modulos_produto")
      .select(
        "id, nome, preco, fase_lancamento, meses_apos_lancamento, data_disponibilidade, adesao_inicial_pct, crescimento_adesao_mensal_pct, percentual_permanencia_estimado, reajuste_pct, reajuste_apos_meses",
      )
      .eq("produto_id", produtoId)
      .eq("cenario_id", cenarioId),
  ]);

  // O canal é do cenário. Trazemos a matriz INTEIRA (todos os produtos), porque além do que vale
  // pra este produto precisamos do total do canal pra saber que fatia da produção dos parceiros
  // é dele.
  const { data: canaisRaw } = await supabase
    .from("canais_aquisicao")
    .select(
      "id, tipo_canal, parametros, canal_produto(produto_id, percentual_mix, desconto_cliente_pct, desconto_cliente_meses, isencao_implementacao, desconto_implementacao_pct, implementacao_horas_por_etapa)",
    )
    .eq("cenario_id", cenarioId);

  const canalIds = (canaisRaw ?? []).map((c) => c.id);
  const { data: parceirosRaw } =
    canalIds.length > 0
      ? await supabase
          .from("canal_parceiros_fase")
          .select("canal_id, fase, quantidade_parceiros")
          .in("canal_id", canalIds)
      : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parceirosPorCanalId = new Map<string, any[]>();
  for (const p of parceirosRaw ?? []) {
    const atual = parceirosPorCanalId.get(p.canal_id) ?? [];
    atual.push({
      fase: p.fase as FaseValue,
      quantidade_parceiros: Number(p.quantidade_parceiros),
    });
    parceirosPorCanalId.set(p.canal_id, atual);
  }

  // Combos em que este produto entra: o desconto é lançado aqui, no próprio produto. O combo só
  // passa a valer a partir do lançamento do ÚLTIMO produto que o compõe — antes disso não existe
  // combo pra vender.
  const { data: itensDesteProduto } = await supabase
    .from("combo_produtos_itens")
    .select("combo_id")
    .eq("produto_id", produtoId);
  const comboIdsDoProduto = (itensDesteProduto ?? []).map((i) => i.combo_id);

  const [{ data: combosRaw }, { data: todosItensRaw }] =
    comboIdsDoProduto.length > 0
      ? await Promise.all([
          supabase
            .from("combos_produtos")
            .select("id, desconto_pct, percentual_clientes_combo")
            .in("id", comboIdsDoProduto)
            .not("percentual_clientes_combo", "is", null),
          supabase
            .from("combo_produtos_itens")
            .select("combo_id, produto_id")
            .in("combo_id", comboIdsDoProduto),
        ])
      : [{ data: [] }, { data: [] }];

  const produtoIdsDosCombos = [
    ...new Set((todosItensRaw ?? []).map((i) => i.produto_id)),
  ];
  const { data: produtosDosCombos } =
    produtoIdsDosCombos.length > 0
      ? await supabase
          .from("produtos")
          .select("id, data_lancamento_estimada")
          .in("id", produtoIdsDosCombos)
      : { data: [] };
  const lancamentoPorProduto = new Map(
    (produtosDosCombos ?? []).map((p) => [p.id, p.data_lancamento_estimada]),
  );

  const { data: etapasImplementacao } = await supabase
    .from("implementacao_etapas")
    .select("nome_etapa, horas, valor_hora")
    .eq("produto_id", produtoId)
    .eq("cenario_id", cenarioId);
  const custoImplementacaoTotal = custoImplementacaoDasEtapas(
    etapasImplementacao ?? [],
    null,
  );

  // Premissas de COGS do produto neste cenário + tabela de custo/hora (suporte e CS são horas × R$/h).
  const [{ data: cogsRaw }, { data: custoHoraRaw }] = await Promise.all([
    supabase
      .from("cogs_premissas")
      .select("parametros")
      .eq("produto_id", produtoId)
      .eq("cenario_id", cenarioId)
      .maybeSingle(),
    supabase
      .from("tabela_custo_hora")
      .select("cargo, tipo_contratacao, senioridade, valor_hora"),
  ]);
  const custoHoraPorPerfil = (perfil: {
    cargo?: string;
    tipo_contratacao?: string;
    senioridade?: string;
  }) => {
    const linha = (custoHoraRaw ?? []).find(
      (t) =>
        t.cargo === perfil.cargo &&
        t.tipo_contratacao === perfil.tipo_contratacao &&
        t.senioridade === perfil.senioridade,
    );
    return linha ? Number(linha.valor_hora) : 0;
  };

  const moduloIds = (modulosRaw ?? []).map((m) => m.id);
  const { data: betasModuloRaw } =
    moduloIds.length > 0
      ? await supabase
          .from("beta_testers_modulo")
          .select(
            "modulo_id, quantidade, condicao_especial_pct, condicao_especial_meses",
          )
          .in("modulo_id", moduloIds)
      : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const betasModuloByModuloId = new Map<string, any[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (betasModuloRaw ?? []) as any[]) {
    const atual = betasModuloByModuloId.get(b.modulo_id) ?? [];
    atual.push(b);
    betasModuloByModuloId.set(b.modulo_id, atual);
  }

  const faseValueById = new Map(
    fases.map((f) => [f.id as string, f.fase as FaseValue]),
  );
  const datasPorFase = new Map(
    (
      (datasFases ?? []) as {
        fase: string;
        data_inicio: string | null;
        data_fim: string | null;
      }[]
    ).map((d) => [d.fase as FaseValue, d]),
  );
  const regimeAliquota = new Map(
    (regimes ?? []).map((r) => [r.id, Number(r.aliquota_total_efetiva)]),
  );

  const precosPorFaseByPlano = new Map<
    string,
    Partial<Record<FaseValue, number>>
  >();
  for (const pf of (planosFasesRaw ?? []) as PlanoFaseRow[]) {
    const atual = precosPorFaseByPlano.get(pf.plano_id) ?? {};
    atual[pf.fase as FaseValue] = Number(pf.preco);
    precosPorFaseByPlano.set(pf.plano_id, atual);
  }

  const { data: cenario } = await supabase
    .from("cenarios")
    .select("data_fim, ponto_partida")
    .eq("id", cenarioId)
    .single();
  const pontoPartida = pontoPartidaDoProduto(
    cenario?.ponto_partida as PontoPartida | null,
    produtoId,
  );

  // Feiras e eventos do cenário: vendas deste produto, mês a mês, com o plano/nível fechado
  // (casado pelo nome dentro do cenário — assim sobrevive à cópia de cenário).
  const { data: acoesRaw } = await supabase
    .from("acoes_marketing")
    .select("*")
    .eq("cenario_id", cenarioId);
  // Por padrão os clientes das ações de marketing EXPLICAM a meta do canal direto (não somam) — só a
  // ação marcada "somar à meta" acrescenta clientes além do crescimento da fase.
  const vendasAcoes = ((acoesRaw ?? []) as AcaoMarketing[])
    .filter((a) => a.soma_na_meta === true)
    .flatMap((a) =>
      vendasAcaoPorMes(a, produtoId, cenario?.data_fim ?? null).map((v) => {
        const indice =
          v.retorno.plano_tipo === "plano"
            ? ((planos ?? []) as PlanoRow[]).findIndex(
                (p) => p.nome_plano === v.retorno.plano_nome,
              )
            : v.retorno.plano_tipo === "modulo"
              ? (modulosRaw ?? []).findIndex(
                  (m) => m.nome === v.retorno.plano_nome,
                )
              : -1;
        return {
          mes: v.mes,
          clientes: v.clientes,
          plano:
            indice >= 0 && v.retorno.plano_tipo
              ? { tipo: v.retorno.plano_tipo, indice }
              : null,
        };
      }),
    );

  const input: SimulacaoInput = {
    dataInicioProduto: produto.data_inicio_desenvolvimento,
    dataLancamentoEstimada: produto.data_lancamento_estimada,
    modulosExclusivos: produto.tipo_precificacao === "modulos",
    dataFimCenario: cenario?.data_fim ?? null,
    pontoPartida,
    vendasAcoes,
    fases: fases.map((f) => ({
      fase: f.fase as FaseValue,
      // Data: do produto. Taxa: do cenário. É a separação que a tela de produto e a de cenário
      // refletem — mudar a data no produto vale para todos os cenários vinculados.
      data_inicio:
        datasPorFase.get(f.fase as FaseValue)?.data_inicio ?? f.data_inicio,
      data_fim: datasPorFase.get(f.fase as FaseValue)?.data_fim ?? f.data_fim,
      taxa_crescimento_mensal: f.taxa_crescimento_mensal,
      taxa_churn_mensal: f.taxa_churn_mensal,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trimestres: ((f as any).fases_trimestres ?? []).map(
        (t: {
          indice: number;
          taxa_crescimento_mensal: number | null;
          taxa_churn_mensal: number | null;
        }) => ({
          indice: Number(t.indice),
          taxa_crescimento_mensal:
            t.taxa_crescimento_mensal != null
              ? Number(t.taxa_crescimento_mensal)
              : null,
          taxa_churn_mensal:
            t.taxa_churn_mensal != null ? Number(t.taxa_churn_mensal) : null,
        }),
      ),
    })),
    betas: (betas ?? []).map((b) => ({
      quantidade: b.quantidade,
      data_inicio: b.data_inicio,
      data_fim: b.data_fim,
      condicao_especial_pct: b.condicao_especial_pct,
      condicao_especial_meses: b.condicao_especial_meses,
    })),
    funis: (funis ?? []).map((f) => ({
      fase: faseValueById.get(f.fase_produto_id)!,
      taxa_conversao: f.taxa_conversao,
      capacidade_vendedor_mes: f.capacidade_vendedor_mes,
      span_of_control: f.span_of_control,
    })),
    contratacoes: (contratacoesRaw ?? []).map((c) => ({
      cargo: c.cargo,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoria: c.categoria as any,
      data_inicio: c.data_inicio,
      data_fim: c.data_fim,
      custo_mensal:
        c.tipo_contratacao === "clt"
          ? Number(c.salario_bruto ?? 0) *
            (1 + (regimeAliquota.get(c.regime_id ?? "") ?? 0))
          : Number(c.valor_mensal ?? 0),
    })),
    alocacoes: (alocacoesRaw ?? []).map((a) => ({
      fase: faseValueById.get(a.fase_produto_id)!,
      cargo: a.cargo,
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
      data_disponibilidade: m.data_disponibilidade,
      adesao_inicial_pct: Number(m.adesao_inicial_pct),
      crescimento_adesao_mensal_pct: Number(m.crescimento_adesao_mensal_pct),
      percentual_permanencia_estimado:
        m.percentual_permanencia_estimado != null
          ? Number(m.percentual_permanencia_estimado)
          : null,
      reajuste_pct: m.reajuste_pct != null ? Number(m.reajuste_pct) : null,
      reajuste_apos_meses: m.reajuste_apos_meses,
      betaTesters: (betasModuloByModuloId.get(m.id) ?? []).map((b) => ({
        quantidade: Number(b.quantidade),
        condicao_especial_pct: b.condicao_especial_pct,
        condicao_especial_meses: b.condicao_especial_meses,
      })),
    })),
    canais: (canaisRaw ?? []).map((c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (c.parametros ?? {}) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linhas = (c.canal_produto ?? []) as any[];
      // A remuneração do parceiro é do canal; o benefício ao cliente é da linha deste produto.
      const doProduto = linhas.find((l) => l.produto_id === produtoId) ?? {};
      const mixDoProduto = Number(doProduto.percentual_mix ?? 0);
      const mixDoCanal = linhas.reduce(
        (acc, l) => acc + Number(l.percentual_mix ?? 0),
        0,
      );
      return {
        peso_no_canal: mixDoCanal > 0 ? mixDoProduto / mixDoCanal : 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tipo_canal: c.tipo_canal as any,
        comissao_pct: p.comissao_pct ?? null,
        valor_fixo_fechamento: p.valor_fixo_fechamento ?? null,
        desconto_cliente_pct: doProduto.desconto_cliente_pct ?? null,
        // Duração em branco = desconto permanente (o motor trata null como "nunca expira").
        desconto_cliente_meses: doProduto.desconto_cliente_meses ?? null,
        credito_uso_valor: p.credito_uso_valor ?? null,
        credito_uso_destino: p.credito_uso_destino ?? null,
        isencao_implementacao: doProduto.isencao_implementacao === true,
        desconto_implementacao_pct:
          doProduto.desconto_implementacao_pct ?? null,
        custo_implementacao_por_cliente: temAjusteDeEtapas(
          doProduto.implementacao_horas_por_etapa,
        )
          ? custoImplementacaoDasEtapas(
              etapasImplementacao ?? [],
              doProduto.implementacao_horas_por_etapa,
            )
          : null,
        media_clientes_parceiro_inicial:
          p.media_clientes_parceiro_inicial ?? null,
        queda_intensidade_mensal_pct: p.queda_intensidade_mensal_pct ?? null,
        media_clientes_parceiro_minima:
          p.media_clientes_parceiro_minima ?? null,
        custo_por_trial: p.custo_por_trial ?? null,
        taxa_conversao_trial: p.taxa_conversao_trial ?? null,
        parceirosPorFase: parceirosPorCanalId.get(c.id) ?? [],
      };
    }),
    combos: (combosRaw ?? []).map((combo) => {
      const produtosDoCombo = (todosItensRaw ?? [])
        .filter((i) => i.combo_id === combo.id)
        .map((i) => i.produto_id);
      const lancamentos = produtosDoCombo
        .map((pid) => lancamentoPorProduto.get(pid))
        .filter((d): d is string => Boolean(d));
      // O combo só existe quando o último produto dele já lançou.
      const ativo_a_partir_de =
        lancamentos.length > 0 ? lancamentos.sort().at(-1)! : null;
      return {
        percentual_clientes_combo: Number(combo.percentual_clientes_combo),
        desconto_pct: Number(combo.desconto_pct),
        ativo_a_partir_de,
      };
    }),
    implementacao:
      produto.tem_implementacao && produto.preco_implementacao != null
        ? {
            preco_venda: Number(produto.preco_implementacao),
            parcelas: Number(produto.implementacao_parcelas ?? 1),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formas: (produto.implementacao_formas_pagamento as any) ?? null,
            custo_total: custoImplementacaoTotal,
          }
        : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cogs: (cogsRaw?.parametros as any) ?? null,
    custoHoraPorPerfil,
    custosFixos: (custosFixosRaw ?? []).map((c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conta = c.plano_contas as any;
      const subgrupo = conta
        ? subgrupoDeConta(conta.codigo, conta.tipo)
        : "outros";
      return {
        fase: faseValueById.get(c.fase_produto_id)!,
        subgrupo,
        quantidade: Number(c.quantidade ?? 1),
        valor_unitario: Number(c.valor_unitario ?? 0),
      };
    }),
    custosVariaveis: (custosVariaveisRaw ?? []).map((c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conta = c.plano_contas as any;
      const subgrupo = conta
        ? subgrupoDeConta(conta.codigo, conta.tipo)
        : "outros";
      return {
        fase: faseValueById.get(c.fase_produto_id)!,
        subgrupo,
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
  // Sem isto a tabela de projeção em Vendas continuava mostrando o cálculo anterior mesmo depois
  // de recalcular — a página não era invalidada.
  revalidatePath(`/plano/${cenarioId}/vendas`);
  revalidatePath(`/plano/${cenarioId}`);
  revalidatePath("/");
  revalidatePath("/relatorios");
  revalidatePath("/relatorios/mensal");
  revalidatePath("/contratacoes/necessidade");
  return { error: null, success: true };
}

/** Recalcula a projeção de todos os produtos do cenário (globais + exclusivos dele). Usado depois
 * de espelhar um cenário, mudar o período ou o ponto de partida — sem isso a tela mostraria a
 * projeção antiga (ou nenhuma) até alguém clicar em "Recalcular projeção". */
export async function recalcularTodosProdutos(
  cenarioId: string,
): Promise<{ falhas: string[] }> {
  const supabase = await createClient();
  // Só o que o cenário simula: no Base, todo produto aprovado ou iniciado; nos demais, a seleção
  // explícita. O que está fora não é recalculado nem conta como falha.
  const ids = await idsDoCenario(supabase, cenarioId);
  const { data: produtos } =
    ids.length > 0
      ? await supabase.from("produtos").select("id, nome").in("id", ids)
      : { data: [] };
  const falhas: string[] = [];
  for (const p of produtos ?? []) {
    const r = await recalcularSimulacao(p.id, cenarioId);
    if (r.error) falhas.push(`${p.nome}: ${r.error}`);
  }
  return { falhas };
}
