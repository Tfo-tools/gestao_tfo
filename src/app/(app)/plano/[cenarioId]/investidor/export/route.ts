import { NextRequest, NextResponse } from "next/server";

/** PDF de 6 abas com a DRE mês a mês é mais pesado que o xlsx — o padrão da Vercel (10s) não basta. */
export const maxDuration = 60;
import ExcelJS from "exceljs";
import { criarCapturaPlanilha, type PlanilhaAlvo } from "@/lib/planilha-modelo";
import { planilhaParaPdf } from "@/lib/planilha-pdf";
import { createClient } from "@/lib/supabase/server";
import {
  agregarPorCenario,
  computeMetricas,
  recortarPeriodo,
} from "@/lib/relatorios-cenario";
import {
  mesesDaReceita,
  resumirReceitasHistoricas,
  type ReceitaHistorica,
} from "@/lib/receitas-historicas";
import {
  carregarOrcamentoProgramas,
  LABEL_CATEGORIA_USO,
  somaPorCategoria,
} from "@/lib/orcamento-programa";
import {
  clientesTotaisAcao,
  custoTotalAcao,
  type AcaoMarketing,
} from "@/lib/acoes-marketing";
import {
  calcularRetornoPrograma,
  agregarRetornoProgramas,
  simularRetornoInvestidor,
} from "@/lib/retorno-investidor";
import {
  FOCOS_INVESTIMENTO,
  formatarMesAno,
  indicadoresInvestidor,
  linhasMensaisInvestidor,
  resumoAnualInvestidor,
  type FocoInvestimento,
  type IndicadorInvestidor,
  type LinhaMensalInvestidor,
} from "@/lib/indicadores-investidor";

const CABECALHO = "FFF1E6E9";
const FECHAMENTO = "FFEDEDED";
const FOCO_CABECALHO = "FF34101E";
const FOCO_CELULA = "FFF4E9EC";
const LEITURA_COR: Record<string, string> = {
  alto: "FFE8F2EC",
  bom: "FFF6F5F2",
  atencao: "FFFAECE7",
};
const LEITURA_TEXTO: Record<string, string> = {
  alto: "Alto potencial",
  bom: "Dentro da referência",
  atencao: "Atenção",
};
const BRL = '"R$" #,##0;[Red]-"R$" #,##0';
const PCT = "0.0%";

const LABEL_FOCO: Record<FocoInvestimento, string> = {
  marketing: "Marketing",
  vendas: "Vendas",
  operacao: "Operação e suporte (COGS)",
  produto: "Produto e tecnologia (P&D)",
  estrutura: "Estrutura (G&A)",
};

function letra(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function preencher(cell: { fill: unknown }, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Planilha pro investidor: indicadores de decisão na 1ª aba, resumo anual (EBITDA consolidado por
 * ano), DRE mês a mês com custos fixos e variáveis e as colunas de foco do investimento destacadas. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cenarioId: string }> },
) {
  const { cenarioId } = await params;
  const { searchParams } = new URL(request.url);
  const supabase = await createClient();

  const focosValidos = new Set(FOCOS_INVESTIMENTO.map((f) => f.key));
  const focoPedido = searchParams
    .getAll("foco")
    .filter((f): f is FocoInvestimento =>
      focosValidos.has(f as FocoInvestimento),
    );
  // Sem foco na URL (link direto), vale o padrão; com o formulário, vale o que foi marcado.
  const focos = new Set<FocoInvestimento>(
    searchParams.has("inicio") || focoPedido.length > 0
      ? focoPedido
      : FOCOS_INVESTIMENTO.filter((f) => f.padrao).map((f) => f.key),
  );

  const [
    { data: cenario },
    resumo,
    { data: simRows },
    { data: produtos },
    { data: alocacoes },
    { data: acoesRaw },
  ] = await Promise.all([
    supabase
      .from("cenarios")
      .select("id, nome, data_inicio, data_fim")
      .eq("id", cenarioId)
      .single(),
    agregarPorCenario(supabase, cenarioId),
    supabase
      .from("simulacao_mensal")
      .select(
        "produto_id, mes_referencia, mrr, clientes_perdidos, clientes_ativos, receita_bruta",
      )
      .eq("cenario_id", cenarioId),
    supabase
      .from("produtos")
      .select("id, nome")
      .or(`cenario_id.is.null,cenario_id.eq.${cenarioId}`)
      .order("nome"),
    supabase
      .from("alocacao_investimento")
      .select("categoria, percentual, observacoes")
      .eq("cenario_id", cenarioId)
      .order("created_at"),
    supabase
      .from("acoes_marketing")
      .select("*")
      .eq("cenario_id", cenarioId)
      .order("created_at"),
  ]);
  const orcamento = await carregarOrcamentoProgramas(
    supabase,
    resumo.aportes.programas.map((p) => p.id),
  );
  const { data: historicoRaw } = await supabase
    .from("receitas_historicas")
    .select(
      "id, descricao, valor_mensal, data_inicio, data_fim, mostrar, observacoes",
    )
    .eq("cenario_id", cenarioId)
    .order("data_inicio");
  const historico = resumirReceitasHistoricas(
    (historicoRaw ?? []) as ReceitaHistorica[],
    resumo.periodo,
  );
  const acoes = (acoesRaw ?? []) as AcaoMarketing[];
  if (!cenario)
    return new NextResponse("Cenário não encontrado", { status: 404 });

  const inicio = searchParams.get("inicio") || resumo.periodo.inicio;
  const fim = searchParams.get("fim") || resumo.periodo.fim;
  const linhas = recortarPeriodo(resumo.linhas, inicio, fim);
  const metricas = computeMetricas(
    linhas,
    resumo.totalInvestido,
    resumo.aportes.capitalNovoPorMes,
  );

  const mrrPorMes = new Map<string, number>();
  const perdidosPorMes = new Map<string, number>();
  for (const r of simRows ?? []) {
    mrrPorMes.set(
      r.mes_referencia,
      (mrrPorMes.get(r.mes_referencia) ?? 0) + Number(r.mrr ?? 0),
    );
    perdidosPorMes.set(
      r.mes_referencia,
      (perdidosPorMes.get(r.mes_referencia) ?? 0) +
        Number(r.clientes_perdidos ?? 0),
    );
  }
  const mensal = linhasMensaisInvestidor(linhas, {
    mrrPorMes,
    perdidosPorMes,
    aportesPorMes: resumo.aportes.porMes,
  });
  const anual = resumoAnualInvestidor(mensal);
  const mesesDoPeriodo = new Set(mensal.map((m) => m.mes));
  const aportesTotal = mensal.reduce((s, m) => s + m.aportes, 0);

  // Retorno do investidor por equity (MOIC/TIR) — só quando houver valuation cadastrado.
  const idsNaoFomento = resumo.aportes.programas
    .filter((p) => p.tipo !== "fomento")
    .map((p) => p.id);
  let retornoEquity: { moic: number | null; tirPct: number | null } | null =
    null;
  let programasRodada: {
    valor_total: number;
    valuation_post_money: number | null;
    data_aporte: string | null;
  }[] = [];
  if (idsNaoFomento.length > 0) {
    const [{ data: progs }, { data: reav }] = await Promise.all([
      supabase
        .from("programas_investimento")
        .select("id, valor_total, valor_proposto, valuation_post_money, data_aporte")
        .in("id", idsNaoFomento),
      supabase
        .from("reavaliacoes_valuation")
        .select("programa_id, data_referencia, novo_valuation, fator_diluicao")
        .in("programa_id", idsNaoFomento),
    ]);
    const agregado = agregarRetornoProgramas(
      (progs ?? []).map((p) => ({
        valorInvestido: Number(p.valor_total ?? p.valor_proposto ?? 0),
        retorno: calcularRetornoPrograma({
          valor_investido: Number(p.valor_total ?? p.valor_proposto ?? 0),
          valuation_post_money:
            p.valuation_post_money != null
              ? Number(p.valuation_post_money)
              : null,
          data_aporte: p.data_aporte,
          reavaliacoes: (reav ?? []).filter((r) => r.programa_id === p.id),
        }),
      })),
    );
    if (agregado.temValuation)
      retornoEquity = { moic: agregado.moic, tirPct: agregado.tirPct };
    programasRodada = (progs ?? []).map((p) => ({
      valor_total: Number(p.valor_total ?? p.valor_proposto ?? 0),
      valuation_post_money:
        p.valuation_post_money != null ? Number(p.valuation_post_money) : null,
      data_aporte: p.data_aporte,
    }));
  }

  // Retorno projetado da rodada: valor de saída (múltiplo de ARR ou EBITDA no fim do período) ×
  // participação. Os parâmetros vêm da URL (mesma simulação da tela) ou da rodada cadastrada.
  const rodadaCadastrada = programasRodada[0] ?? null;
  const numParam = (chave: string, padrao: number) => {
    const v = searchParams.get(chave);
    const n = v != null && v !== "" ? Number(v.replace(",", ".")) : NaN;
    return Number.isFinite(n) ? n : padrao;
  };
  const capitalSim = numParam(
    "capital",
    rodadaCadastrada
      ? Number(rodadaCadastrada.valor_total)
      : resumo.totalInvestido,
  );
  const equitySim = numParam(
    "equity",
    rodadaCadastrada?.valuation_post_money
      ? (Number(rodadaCadastrada.valor_total) /
          Number(rodadaCadastrada.valuation_post_money)) *
          100
      : 10,
  );
  const multiploSim = numParam("multiplo", 5);
  const baseSim = searchParams.get("base") === "ebitda" ? "ebitda" : "arr";
  const mesSaidaSim = mensal[mensal.length - 1]?.mes ?? "";
  const simulado =
    capitalSim > 0 && mesSaidaSim
      ? simularRetornoInvestidor({
          valorInvestido: capitalSim,
          mesAporte: searchParams.get("aporte")
            ? `${searchParams.get("aporte")}-01`
            : rodadaCadastrada?.data_aporte
              ? `${String(rodadaCadastrada.data_aporte).slice(0, 7)}-01`
              : (metricas.mesCapital ?? mensal[0]?.mes ?? mesSaidaSim),
          equityPct: equitySim,
          multiploSaida: multiploSim,
          baseSaida: baseSim,
          arrNaSaida: (mrrPorMes.get(mesSaidaSim) ?? 0) * 12,
          ebitdaNaSaida: mensal.slice(-12).reduce((s, m) => s + m.ebitda, 0),
          mesSaida: mesSaidaSim,
        })
      : null;

  const indicadores = indicadoresInvestidor({
    mensal,
    anual,
    metricas,
    capitalNovo: resumo.totalInvestido,
    aportesTotal,
    retornoEquity,
    retornoSimulado: simulado
      ? {
          ...simulado,
          equityPct: equitySim,
          multiplo: multiploSim,
          base: baseSim as "arr" | "ebitda",
        }
      : null,
  });

  // A MESMA montagem serve o xlsx (exceljs) e o PDF (captura em planilha-modelo.ts): um único
  // código produz as abas, e cada formato só muda quem recebe as chamadas. É o que garante que
  // planilha e PDF nunca divirjam.
  const periodoTexto =
    mensal.length > 0
      ? `${formatarMesAno(mensal[0].mes)} a ${formatarMesAno(mensal[mensal.length - 1].mes)}`
      : "sem projeção no período";
  const focoTexto =
    [...focos].map((f) => LABEL_FOCO[f]).join(", ") ||
    "nenhum (custos consolidados)";

  // Preço da rodada: consultado uma vez, fora da montagem — a montagem é síncrona pra poder rodar
  // igual contra o exceljs e contra a captura do PDF.
  const idsRodada = resumo.aportes.programas
    .filter((p) => p.tipo !== "fomento")
    .map((p) => p.id);
  const { data: rodadas } =
    idsRodada.length > 0
      ? await supabase
          .from("programas_investimento")
          .select(
            "nome, valor_total, valor_proposto, valuation_pre_money, valuation_post_money",
          )
          .in("id", idsRodada)
      : { data: [] };

  const montar = (workbook: PlanilhaAlvo) => {
    workbook.creator = "TFO-Gestão";
    workbook.created = new Date();
    // As fórmulas já vão com o valor calculado; isso só garante o recálculo se alguém editar a planilha.
    workbook.calcProperties.fullCalcOnLoad = true;

    // ─── Aba 1: Indicadores ────────────────────────────────────────────────────────────────────
    const ind = workbook.addWorksheet("Indicadores", {
      views: [{ showGridLines: false }],
    });
    ind.columns = [
      { width: 30 },
      { width: 46 },
      { width: 20 },
      { width: 62 },
      { width: 46 },
      { width: 20 },
    ];
    ind.addRow([`Plano financeiro — ${cenario.nome}`]).font = {
      bold: true,
      size: 14,
    };
    ind.addRow([
      `Período: ${periodoTexto} · gerado em ${new Date().toLocaleDateString("pt-BR")}`,
    ]).font = { color: { argb: "FF726E69" } };
    ind.addRow([
      `Foco do investimento (colunas destacadas nas abas seguintes): ${focoTexto}`,
    ]).font = { color: { argb: "FF726E69" } };
    ind.addRow([]);

    const titulo = (texto: string) => {
      const r = ind.addRow([texto]);
      r.font = { bold: true, size: 12 };
    };
    const cabecalho = (valores: string[]) => {
      const r = ind.addRow(valores);
      r.font = { bold: true };
      r.eachCell((c) => preencher(c, CABECALHO));
    };

    // Tração antes do produto: receita já realizada (consultoria, serviço) que validou a metodologia.
    // Fica fora da projeção de propósito — não entra em MRR, ARR, CAC nem EBITDA — e aparece aqui só
    // quando o registro está com a exibição ligada.
    if (historico.ativos.length > 0 && historico.total > 0) {
      titulo(
        "Tração antes do produto (receita já realizada, fora da projeção)",
      );
      cabecalho([
        "O que foi vendido",
        "Valor mensal",
        "Período",
        "Meses",
        "Total realizado",
      ]);
      for (const h of historico.ativos) {
        const meses = mesesDaReceita(h, resumo.periodo.fim);
        const fimTexto = h.data_fim
          ? formatarMesAno(`${h.data_fim.slice(0, 7)}-01`)
          : "em aberto";
        const r = ind.addRow([
          h.descricao + (h.observacoes ? ` — ${h.observacoes}` : ""),
          Number(h.valor_mensal),
          `${formatarMesAno(`${h.data_inicio.slice(0, 7)}-01`)} a ${fimTexto}`,
          meses,
          Number(h.valor_mensal) * meses,
        ]);
        r.getCell(2).numFmt = BRL;
        r.getCell(5).numFmt = BRL;
        r.getCell(1).alignment = { wrapText: true, vertical: "top" };
      }
      const rTotal = ind.addRow([
        "Total realizado antes do produto",
        "",
        "",
        "",
        historico.total,
      ]);
      rTotal.font = { bold: true };
      rTotal.getCell(5).numFmt = BRL;
      const rNota = ind.addRow([
        "Não entra em MRR, ARR, preço médio, CAC, churn nem no EBITDA projetado: é receita de serviço já realizada, mostrada como prova de que a metodologia era vendida antes de existir software.",
      ]);
      rNota.getCell(1).alignment = { wrapText: true, vertical: "top" };
      ind.addRow([]);
    }

    // Resumo — as mesmas 12 métricas da tela "Métricas para investidor", com a fórmula de cada uma.
    titulo("Resumo — métricas da tela Indicadores");
    cabecalho([
      "Indicador",
      "Valor",
      "",
      "Como é calculado (igual à tela do app)",
      "Onde conferir",
      "",
    ]);
    const fmtMes = (m: string | null) => (m ? formatarMesAno(m) : "—");
    const brlTxt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
    const resumoTela: [string, number | string, string, string, string][] = [
      [
        "Meta do período",
        metricas.clientesFinal,
        "#,##0",
        "Clientes pagantes ativos no último mês do período.",
        "Mês a mês → Clientes ativos (último mês)",
      ],
      [
        "Break-even",
        metricas.breakEvenMes
          ? `${fmtMes(metricas.breakEvenMes)}${metricas.breakEvenClientes != null ? ` · ${metricas.breakEvenClientes.toLocaleString("pt-BR")} clientes` : ""}`
          : "não atingido",
        "@",
        "Primeiro mês do período em que o EBITDA fica positivo e assim permanece; clientes ativos naquele mês.",
        "Mês a mês → EBITDA",
      ],
      [
        "Margem operacional",
        metricas.margemOperacional != null
          ? metricas.margemOperacional / 100
          : "—",
        PCT,
        "EBITDA acumulado ÷ receita acumulada do período.",
        "Resumo anual → Total do período",
      ],
      [
        "Margem bruta",
        metricas.margemBruta != null ? metricas.margemBruta / 100 : "—",
        PCT,
        `Lucro bruto ÷ receita líquida: (receita − COGS − impostos sobre a receita) ÷ (receita − impostos).${metricas.margemBrutaAssinatura != null ? ` Só assinatura (sem implantação): ${metricas.margemBrutaAssinatura.toFixed(0)}%.` : ""}`,
        "Mês a mês → Operação e suporte (COGS) e Impostos",
      ],
      [
        "CAC (all-in)",
        metricas.cacMedio ?? "—",
        BRL,
        "Fully-loaded: marketing + vendas + outros S&M do período ÷ novos clientes do período.",
        "Mês a mês → Marketing, Vendas ÷ Novos clientes",
      ],
      [
        "LTV",
        metricas.ltvMedio ?? "—",
        BRL,
        "ARPU × margem bruta ÷ churn mensal, ponderado pelos clientes ativos de cada produto.",
        "Indicadores do app → LTV",
      ],
      [
        "Preço médio de venda",
        metricas.precoMedioVenda ?? "—",
        BRL,
        `Mensalidade de tabela de cada venda nova (planos pelo mix + níveis pela adesão), ponderada pelas vendas — sem descontos nem implantação.${metricas.arpaRecorrente != null ? ` ARPA recorrente (MRR ÷ clientes ativos): ${brlTxt(metricas.arpaRecorrente)}.` : ""}`,
        "Receita por produto",
      ],
      [
        "Ticket de entrada (mês 1)",
        metricas.ticketEntrada ?? "sem implantação",
        BRL,
        `Implantação que o cliente quita no ato + 1ª mensalidade — o caixa do mês 1 de cada cliente novo, comparado ao CAC${metricas.cacMedio != null ? ` de ${brlTxt(metricas.cacMedio)}` : ""}.`,
        "Indicadores do app → Ticket de entrada",
      ],
      [
        "Receita por cobrança",
        metricas.ticketMedio ?? "—",
        BRL,
        "Receita total ÷ cobranças do mês (assinaturas ativas + parcelas de implantação em andamento) — inclui implantação e descontos.",
        "Receita por produto",
      ],
      [
        "Churn médio",
        metricas.churnMedio != null ? metricas.churnMedio / 100 : "—",
        PCT,
        "Taxa planejada por fase, ponderada pelos clientes ativos (não é churn realizado).",
        "Mês a mês → Clientes perdidos",
      ],
      [
        "Capital coberto por caixa próprio",
        resumo.totalInvestido > 0 && metricas.roiPct != null
          ? metricas.roiPct / 100
          : "sem captação vinculada",
        PCT,
        `Caixa gerado pela operação (EBITDA acumulado positivo) ÷ capital novo. ${resumo.totalInvestido > 0 ? `${brlTxt(metricas.investimentoRecuperado)} de caixa gerado${metricas.paybackMes ? ` até ${fmtMes(metricas.paybackMes)} (payback)` : ""}.` : "Fomento não entra nessa conta."}`,
        "Mês a mês → EBITDA acumulado e Aportes",
      ],
      [
        "TIR do projeto (empresa)",
        metricas.tirAnualPct != null
          ? metricas.tirAnualPct / 100
          : "não se aplica",
        PCT,
        metricas.tirBase === "capital_novo"
          ? "Taxa que zera o valor presente do fluxo mensal: capital novo sai no mês do aporte e volta como EBITDA; anualizada. O retorno do investidor está na simulação da rodada."
          : "Taxa que zera o valor presente do fluxo de caixa do período (queima = investimento), anualizada.",
        "Mês a mês → EBITDA e Aportes",
      ],
    ];
    for (const [nome, valor, fmt, formula, onde] of resumoTela) {
      const r = ind.addRow([nome, valor, "", formula, onde]);
      r.getCell(1).font = { bold: true };
      r.getCell(2).numFmt = fmt;
      r.getCell(2).alignment = { horizontal: "right" };
      for (const c of [4, 5])
        r.getCell(c).alignment = { wrapText: true, vertical: "top" };
    }
    ind.addRow([]);

    titulo("Captação vinculada ao cenário");
    cabecalho([
      "Programa",
      "Tipo",
      "Valor total",
      "Tratamento na planilha",
      "Parcelas previstas",
      "",
    ]);
    if (resumo.aportes.programas.length === 0)
      ind.addRow(["Nenhum programa vinculado a este cenário."]);
    for (const p of resumo.aportes.programas) {
      // Parcela fora do período (ex: fomento recebido antes do início do cenário) aparece marcada —
      // não entra na linha de aportes do período, mas o investidor precisa saber que ela existe.
      const inicioPeriodo = mensal[0]?.mes ?? "";
      const descreverParcela = (x: (typeof p.parcelas)[number]) =>
        `${formatarMesAno(x.mes)}: R$ ${Math.round(x.valor).toLocaleString("pt-BR")}${
          mesesDoPeriodo.has(x.mes)
            ? ""
            : x.mes < inicioPeriodo
              ? " (antes do período)"
              : " (depois do período)"
        }${x.recebida ? " — recebida" : ""}`;
      const r = ind.addRow([
        p.nome,
        p.tipo,
        p.valorTotal,
        p.tratamento,
        p.parcelas.map(descreverParcela).join(" · ") || "—",
      ]);
      r.getCell(3).numFmt = BRL;
      r.getCell(4).alignment = { wrapText: true, vertical: "top" };
      r.getCell(5).alignment = { wrapText: true, vertical: "top" };
      if (p.entraNoRetorno) r.getCell(1).font = { bold: true };
    }
    const rCap = ind.addRow([
      "Capital novo (base do retorno)",
      "",
      resumo.totalInvestido,
      "Só o investimento ainda não aplicado. Fomento entra nos aportes, fora do retorno.",
    ]);
    rCap.font = { bold: true };
    rCap.getCell(3).numFmt = BRL;
    // Preço da rodada: o que o investidor recebe em troca do aporte (Fomento → programa → Rodada).
    if (idsRodada.length > 0) {
      for (const rod of rodadas ?? []) {
        // Rodada em negociação ainda não tem valor fechado: vale o proposto. O pós-money sai do
        // pré-money + aporte (o cadastrado pode ter ficado de uma versão anterior da rodada).
        const valorRodada = Number(rod.valor_total ?? rod.valor_proposto ?? 0);
        const pre = Number(rod.valuation_pre_money ?? 0);
        const pos =
          pre > 0 && valorRodada > 0
            ? pre + valorRodada
            : Number(rod.valuation_post_money ?? 0);
        const pctInv = pos > 0 ? (valorRodada / pos) * 100 : 0;
        const texto =
          pos > 0
            ? `Pré-money R$ ${Math.round(pre > 0 ? pre : pos - valorRodada).toLocaleString("pt-BR")} · pós-money R$ ${Math.round(pos).toLocaleString("pt-BR")} · investidor fica com ${pctInv.toFixed(1).replace(".", ",")}% · sócias com ${(100 - pctInv).toFixed(1).replace(".", ",")}%`
            : "Preço da rodada ainda não definido (Fomento → programa → Rodada).";
        const r = ind.addRow([
          `Rodada — ${rod.nome}`,
          "preço",
          valorRodada,
          texto,
        ]);
        r.getCell(3).numFmt = BRL;
        r.getCell(4).alignment = { wrapText: true, vertical: "top" };
      }
    }
    ind.addRow([]);

    titulo("Indicadores para decisão");
    cabecalho([
      "Grupo",
      "Indicador",
      "Valor",
      "Como é calculado",
      "Referência de mercado",
      "Leitura",
    ]);
    let grupoAnterior = "";
    for (const i of indicadores) {
      const r = ind.addRow([
        i.grupo === grupoAnterior ? "" : i.grupo,
        i.nome,
        valorCelula(i),
        i.calculo,
        i.referencia,
        i.leitura ? LEITURA_TEXTO[i.leitura] : "",
      ]);
      grupoAnterior = i.grupo;
      r.getCell(1).font = { bold: true };
      r.getCell(3).numFmt = formatoCelula(i);
      r.getCell(3).alignment = { horizontal: "right" };
      for (const c of [2, 4, 5])
        r.getCell(c).alignment = { wrapText: true, vertical: "top" };
      if (i.leitura) preencher(r.getCell(6), LEITURA_COR[i.leitura]);
    }
    ind.addRow([]);

    titulo("EBITDA consolidado por ano");
    cabecalho([
      "Ano",
      "Receita",
      "EBITDA",
      "Margem EBITDA",
      "Aportes",
      "Caixa acumulado ao fim",
    ]);
    for (const a of anual) {
      const r = ind.addRow([
        a.meses === 12
          ? a.ano
          : `${a.ano} (${a.meses} ${a.meses === 1 ? "mês" : "meses"})`,
        a.receita,
        a.ebitda,
        a.margemEbitda,
        a.aportes,
        a.caixaFinal,
      ]);
      for (const c of [2, 3, 5, 6]) r.getCell(c).numFmt = BRL;
      r.getCell(4).numFmt = PCT;
    }
    const totalEbitda = anual.reduce((s, a) => s + a.ebitda, 0);
    const totalReceita = anual.reduce((s, a) => s + a.receita, 0);
    const rTot = ind.addRow([
      "Total do período",
      totalReceita,
      totalEbitda,
      totalReceita > 0 ? totalEbitda / totalReceita : null,
      aportesTotal,
      mensal[mensal.length - 1]?.caixaAcumulado ?? 0,
    ]);
    rTot.font = { bold: true };
    rTot.eachCell((c) => preencher(c, FECHAMENTO));
    for (const c of [2, 3, 5, 6]) rTot.getCell(c).numFmt = BRL;
    rTot.getCell(4).numFmt = PCT;

    if (orcamento.length > 0) {
      ind.addRow([]);
      const rUso = ind.addRow([
        "Uso do recurso",
        "",
        "",
        'Detalhado na aba "Uso do recurso": capital total, cada programa por frente, atividades cobertas e justificativa.',
      ]);
      rUso.getCell(1).font = { bold: true };
      rUso.getCell(4).alignment = { wrapText: true, vertical: "top" };
    }

    if (acoes.length > 0) {
      ind.addRow([]);
      titulo("Feiras e eventos (plano de marketing)");
      cabecalho([
        "Ação",
        "Quando",
        "Custo total",
        "Retorno previsto",
        "Custo por cliente",
        "",
      ]);
      const nomeProd = new Map((produtos ?? []).map((p) => [p.id, p.nome]));
      for (const a of acoes) {
        const total = custoTotalAcao(a, resumo.periodo.fim);
        const clientes = clientesTotaisAcao(a, resumo.periodo.fim);
        const r = ind.addRow([
          `${a.tipo === "feira" ? "Feira" : "Eventos"} — ${a.nome}`,
          a.tipo === "feira" && a.mes
            ? `${formatarMesAno(a.mes)} (custo provisionado em 12 parcelas no ano)`
            : `${a.ano}: ${a.quantidade} evento(s) × R$ ${Math.round(Number(a.custo)).toLocaleString("pt-BR")} (provisão mensal)`,
          total,
          `${clientes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} clientes${a.tipo === "evento" ? " no ano" : ""}: ` +
            (a.retorno ?? [])
              .map(
                (x) =>
                  `${x.clientes} ${nomeProd.get(x.produto_id) ?? ""}${x.plano_nome ? ` (${x.plano_nome})` : ""}${a.tipo === "evento" ? "/evento" : ""}`,
              )
              .join(" · "),
          clientes > 0 ? total / clientes : null,
        ]);
        r.getCell(3).numFmt = BRL;
        r.getCell(5).numFmt = BRL;
        r.getCell(4).alignment = { wrapText: true, vertical: "top" };
      }
    }

    if ((alocacoes ?? []).length > 0) {
      ind.addRow([]);
      titulo("Destinação resumida do investimento (% por categoria)");
      cabecalho([
        "Categoria",
        "Observações",
        "% do capital novo",
        "Valor estimado",
        "",
        "",
      ]);
      for (const a of alocacoes ?? []) {
        const pct = Number(a.percentual) / 100;
        const r = ind.addRow([
          a.categoria,
          a.observacoes ?? "",
          pct,
          pct * resumo.totalInvestido,
        ]);
        r.getCell(3).numFmt = PCT;
        r.getCell(4).numFmt = BRL;
      }
    }

    // ─── Aba 2: Resumo anual (anos em colunas) ─────────────────────────────────────────────────
    const res = workbook.addWorksheet("Resumo anual");
    res.columns = [
      { width: 36 },
      ...anual.map(() => ({ width: 16 })),
      { width: 18 },
    ];
    const cabAnos = res.addRow([
      "",
      ...anual.map((a) => (a.meses === 12 ? a.ano : `${a.ano} (${a.meses}m)`)),
      "Total",
    ]);
    cabAnos.font = { bold: true };
    cabAnos.eachCell((c) => preencher(c, CABECALHO));
    res.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

    const focosVariaveis = FOCOS_INVESTIMENTO.filter(
      (f) => f.secao === "variavel" && focos.has(f.key),
    ).map((f) => f.key);
    const CATEGORIAS_FIXAS = FOCOS_INVESTIMENTO.filter(
      (f) => f.secao === "fixo",
    ).map((f) => f.key);
    const valorCategoria = (
      x: Record<FocoInvestimento, number>,
      k: FocoInvestimento,
    ) => x[k];
    type Anual = (typeof anual)[number];
    // Resto do grupo; resíduo de ponto flutuante (ex: −0,0000001) vira zero pra não poluir a planilha.
    const outrosVariaveis = (
      a: Pick<Anual, "variaveis" | "impostos"> &
        Record<FocoInvestimento, number>,
    ) => {
      const v =
        a.variaveis -
        a.impostos -
        focosVariaveis.reduce((s, k) => s + valorCategoria(a, k), 0);
      return Math.abs(v) < 0.005 ? 0 : v;
    };

    const linhaRes = (
      rotulo: string,
      valor: (a: Anual) => number | null,
      opcoes: {
        fmt?: string;
        total?: "soma" | "ultimo" | null;
        negrito?: boolean;
        foco?: boolean;
        recuo?: boolean;
      } = {},
    ) => {
      const valores = anual.map(valor);
      const total =
        opcoes.total === "soma"
          ? valores.reduce<number>((s, v) => s + (v ?? 0), 0)
          : opcoes.total === "ultimo"
            ? (valores[valores.length - 1] ?? null)
            : null;
      const r = res.addRow([
        `${opcoes.recuo ? "   " : ""}${rotulo}`,
        ...valores,
        total,
      ]);
      for (let c = 2; c <= anual.length + 2; c++)
        r.getCell(c).numFmt = opcoes.fmt ?? BRL;
      if (opcoes.negrito) r.font = { bold: true };
      if (opcoes.foco) r.eachCell((c) => preencher(c, FOCO_CELULA));
      return r;
    };
    const secaoRes = (texto: string) => {
      const r = res.addRow([texto]);
      r.font = { bold: true, color: { argb: "FF726E69" } };
    };

    secaoRes("CLIENTES E RECEITA");
    linhaRes("Clientes ativos ao fim do ano", (a) => a.clientesFinal, {
      fmt: "#,##0",
      total: "ultimo",
    });
    linhaRes("Novos clientes", (a) => a.novos, { fmt: "#,##0", total: "soma" });
    if (anual.some((a) => a.novosAcoes > 0))
      linhaRes("dos quais via feiras e eventos", (a) => a.novosAcoes, {
        fmt: "#,##0",
        total: "soma",
        recuo: true,
      });
    linhaRes("Clientes perdidos", (a) => a.perdidos, {
      fmt: "#,##0",
      total: "soma",
    });
    linhaRes("MRR ao fim do ano", (a) => a.mrrFinal, { total: "ultimo" });
    linhaRes("ARR ao fim do ano", (a) => a.arrFinal, {
      total: "ultimo",
      negrito: true,
    });
    linhaRes("Crescimento do ARR no ano", (a) => a.crescimentoArr, {
      fmt: PCT,
    });
    linhaRes("Receita de software (assinaturas)", (a) => a.receitaSoftware, {
      total: "soma",
      recuo: true,
    });
    if (anual.some((a) => a.receitaImplantacao > 0))
      linhaRes(
        "Receita de serviços de implantação",
        (a) => a.receitaImplantacao,
        { total: "soma", recuo: true },
      );
    linhaRes("Receita total", (a) => a.receita, {
      total: "soma",
      negrito: true,
    });
    secaoRes("CUSTOS FIXOS");
    for (const k of CATEGORIAS_FIXAS)
      linhaRes(LABEL_FOCO[k], (a) => a[k], {
        total: "soma",
        foco: focos.has(k),
        recuo: true,
      });
    linhaRes("Total custos fixos", (a) => a.fixos, {
      total: "soma",
      negrito: true,
    });
    secaoRes("CUSTOS VARIÁVEIS");
    for (const k of focosVariaveis) {
      linhaRes(LABEL_FOCO[k], (a) => a[k], {
        total: "soma",
        foco: true,
        recuo: true,
      });
      if (k === "marketing" && anual.some((a) => a.feirasEventos > 0))
        linhaRes("   dos quais feiras e eventos", (a) => a.feirasEventos, {
          total: "soma",
          foco: true,
          recuo: true,
        });
    }
    linhaRes("Impostos sobre a receita", (a) => a.impostos, {
      total: "soma",
      recuo: true,
    });
    linhaRes("Outros variáveis", (a) => outrosVariaveis(a), {
      total: "soma",
      recuo: true,
    });
    linhaRes("Total custos variáveis", (a) => a.variaveis, {
      total: "soma",
      negrito: true,
    });
    secaoRes("RESULTADO");
    const rEbitda = linhaRes("EBITDA consolidado do ano", (a) => a.ebitda, {
      total: "soma",
      negrito: true,
    });
    rEbitda.eachCell((c) => preencher(c, FECHAMENTO));
    if (anual.some((a) => a.irpjCsll > 0)) {
      linhaRes(
        "IRPJ/CSLL (lucro presumido, fora do Simples)",
        (a) => a.irpjCsll,
        { total: "soma", recuo: true },
      );
      linhaRes("Resultado depois de IRPJ/CSLL", (a) => a.ebitda - a.irpjCsll, {
        total: "soma",
      });
    }
    linhaRes("Margem EBITDA", (a) => a.margemEbitda, { fmt: PCT });
    linhaRes("Margem bruta (blended)", (a) => a.margemBruta, { fmt: PCT });
    // DRE segregada: o SaaS puro (> 80%) separado dos serviços de implantação — é o que prova a
    // escalabilidade do modelo pra banca, sem a implantação puxar a média pra baixo.
    linhaRes("Margem bruta de software", (a) => a.margemBrutaSoftware, {
      fmt: PCT,
      recuo: true,
      negrito: true,
    });
    if (anual.some((a) => a.receitaImplantacao > 0))
      linhaRes(
        "Margem dos serviços de implantação",
        (a) => a.margemImplantacao,
        { fmt: PCT, recuo: true },
      );
    linhaRes(
      "Regra dos 40 (crescimento ARR + margem EBITDA)",
      (a) => a.regra40,
      { fmt: PCT },
    );
    linhaRes("Burn multiple (queima ÷ ARR novo)", (a) => a.burnMultiple, {
      fmt: '0.0"x"',
    });
    secaoRes("CAIXA");
    linhaRes("Aportes (todos os programas)", (a) => a.aportes, {
      total: "soma",
    });
    linhaRes(
      "Caixa acumulado ao fim do ano (aportes + EBITDA)",
      (a) => a.caixaFinal,
      { total: "ultimo", negrito: true },
    );

    // ─── Aba 3: Mês a mês ──────────────────────────────────────────────────────────────────────
    const mm = workbook.addWorksheet("Mês a mês");
    type ColMes = {
      titulo: string;
      grupo: string;
      largura: number;
      fmt: string;
      foco?: boolean;
      valor?: (m: LinhaMensalInvestidor) => number;
      tipo:
        | "valor"
        | "total_fixos"
        | "total_variaveis"
        | "custos"
        | "ebitda"
        | "margem"
        | "acum_ebitda"
        | "acum_caixa"
        | "mes";
    };
    const colunas: ColMes[] = [
      { titulo: "Mês", grupo: "", largura: 12, fmt: "mmm/yyyy", tipo: "mes" },
      {
        titulo: "Clientes ativos",
        grupo: "CLIENTES E RECEITA",
        largura: 13,
        fmt: "#,##0",
        valor: (m) => m.clientes,
        tipo: "valor",
      },
      {
        titulo: "Novos clientes",
        grupo: "CLIENTES E RECEITA",
        largura: 12,
        fmt: "#,##0",
        valor: (m) => m.novos,
        tipo: "valor",
      },
      {
        titulo: "Clientes perdidos",
        grupo: "CLIENTES E RECEITA",
        largura: 13,
        fmt: "#,##0",
        valor: (m) => m.perdidos,
        tipo: "valor",
      },
      {
        titulo: "MRR",
        grupo: "CLIENTES E RECEITA",
        largura: 14,
        fmt: BRL,
        valor: (m) => m.mrr,
        tipo: "valor",
      },
      {
        titulo: "Receita total",
        grupo: "CLIENTES E RECEITA",
        largura: 15,
        fmt: BRL,
        valor: (m) => m.receita,
        tipo: "valor",
      },
      // Fixos são só duas categorias: saem sempre abertas (destacadas quando forem o foco).
      ...CATEGORIAS_FIXAS.map((k) => ({
        titulo: LABEL_FOCO[k],
        grupo: "CUSTOS FIXOS",
        largura: 18,
        fmt: BRL,
        foco: focos.has(k),
        valor: (m: LinhaMensalInvestidor) => m[k],
        tipo: "valor" as const,
      })),
      {
        titulo: "Total fixos",
        grupo: "CUSTOS FIXOS",
        largura: 14,
        fmt: BRL,
        tipo: "total_fixos",
      },
      ...focosVariaveis.map((k) => ({
        titulo: LABEL_FOCO[k],
        grupo: "CUSTOS VARIÁVEIS",
        largura: 18,
        fmt: BRL,
        foco: true,
        valor: (m: LinhaMensalInvestidor) => m[k],
        tipo: "valor" as const,
      })),
      {
        titulo: "Impostos s/ receita",
        grupo: "CUSTOS VARIÁVEIS",
        largura: 14,
        fmt: BRL,
        valor: (m) => m.impostos,
        tipo: "valor",
      },
      {
        titulo: "Outros variáveis",
        grupo: "CUSTOS VARIÁVEIS",
        largura: 15,
        fmt: BRL,
        valor: (m) => outrosVariaveis(m),
        tipo: "valor",
      },
      {
        titulo: "Total variáveis",
        grupo: "CUSTOS VARIÁVEIS",
        largura: 15,
        fmt: BRL,
        tipo: "total_variaveis",
      },
      {
        titulo: "Custos totais",
        grupo: "RESULTADO",
        largura: 15,
        fmt: BRL,
        tipo: "custos",
      },
      {
        titulo: "EBITDA",
        grupo: "RESULTADO",
        largura: 15,
        fmt: BRL,
        tipo: "ebitda",
      },
      {
        titulo: "Margem EBITDA",
        grupo: "RESULTADO",
        largura: 12,
        fmt: PCT,
        tipo: "margem",
      },
      {
        titulo: "EBITDA acumulado",
        grupo: "RESULTADO",
        largura: 16,
        fmt: BRL,
        tipo: "acum_ebitda",
      },
      {
        titulo: "Aportes",
        grupo: "CAIXA",
        largura: 14,
        fmt: BRL,
        valor: (m) => m.aportes,
        tipo: "valor",
      },
      {
        titulo: "Caixa acumulado (aportes + EBITDA)",
        grupo: "CAIXA",
        largura: 20,
        fmt: BRL,
        tipo: "acum_caixa",
      },
    ];
    mm.columns = colunas.map((c) => ({ width: c.largura }));
    const idx = (pred: (c: ColMes) => boolean) => colunas.findIndex(pred) + 1;
    const L = {
      receita: letra(idx((c) => c.titulo === "Receita total")),
      totalFixos: letra(idx((c) => c.tipo === "total_fixos")),
      totalVariaveis: letra(idx((c) => c.tipo === "total_variaveis")),
      custos: letra(idx((c) => c.tipo === "custos")),
      ebitda: letra(idx((c) => c.tipo === "ebitda")),
      acumEbitda: letra(idx((c) => c.tipo === "acum_ebitda")),
      aportes: letra(idx((c) => c.titulo === "Aportes")),
      acumCaixa: letra(idx((c) => c.tipo === "acum_caixa")),
    };
    const faixaCols = (grupo: string, excetoTipo: ColMes["tipo"]) => {
      const cols = colunas
        .map((c, i) => ({ c, i: i + 1 }))
        .filter(({ c }) => c.grupo === grupo && c.tipo !== excetoTipo);
      return `${letra(cols[0].i)}{r}:${letra(cols[cols.length - 1].i)}{r}`;
    };
    const faixaFixos = faixaCols("CUSTOS FIXOS", "total_fixos");
    const faixaVariaveis = faixaCols("CUSTOS VARIÁVEIS", "total_variaveis");

    // Linha 1: grupos (mesclados); linha 2: nomes das colunas.
    const rGrupos = mm.addRow(colunas.map((c) => c.grupo));
    const rNomes = mm.addRow(colunas.map((c) => c.titulo));
    let inicioGrupo = 1;
    for (let i = 2; i <= colunas.length + 1; i++) {
      if (
        i === colunas.length + 1 ||
        colunas[i - 1].grupo !== colunas[inicioGrupo - 1].grupo
      ) {
        if (i - 1 > inicioGrupo) mm.mergeCells(1, inicioGrupo, 1, i - 1);
        inicioGrupo = i;
      }
    }
    for (const r of [rGrupos, rNomes]) {
      r.font = { bold: true };
      r.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    }
    rNomes.height = 32;
    colunas.forEach((c, i) => {
      preencher(rGrupos.getCell(i + 1), CABECALHO);
      if (c.foco) {
        preencher(rNomes.getCell(i + 1), FOCO_CABECALHO);
        rNomes.getCell(i + 1).font = {
          bold: true,
          color: { argb: "FFFFFFFF" },
        };
      } else {
        preencher(rNomes.getCell(i + 1), CABECALHO);
      }
    });
    mm.views = [{ state: "frozen", xSplit: 1, ySplit: 2 }];

    let ultimaLinhaMes: number | null = null;
    let linhasDoAno: number[] = [];
    const escreverMes = (m: LinhaMensalInvestidor) => {
      const row = mm.addRow([]);
      const n = row.number;
      colunas.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.numFmt = c.fmt;
        if (c.foco) preencher(cell, FOCO_CELULA);
        if (c.tipo === "mes") cell.value = new Date(m.mes + "T00:00:00");
        else if (c.tipo === "valor") cell.value = c.valor!(m);
        else if (c.tipo === "total_fixos")
          cell.value = {
            formula: `SUM(${faixaFixos.replaceAll("{r}", String(n))})`,
            result: m.fixos,
          };
        else if (c.tipo === "total_variaveis")
          cell.value = {
            formula: `SUM(${faixaVariaveis.replaceAll("{r}", String(n))})`,
            result: m.variaveis,
          };
        else if (c.tipo === "custos")
          cell.value = {
            formula: `${L.totalFixos}${n}+${L.totalVariaveis}${n}`,
            result: m.custosTotais,
          };
        else if (c.tipo === "ebitda")
          cell.value = {
            formula: `${L.receita}${n}-${L.custos}${n}`,
            result: m.ebitda,
          };
        else if (c.tipo === "margem")
          cell.value = {
            formula: `IF(${L.receita}${n}=0,"",${L.ebitda}${n}/${L.receita}${n})`,
            result: m.receita > 0 ? m.ebitda / m.receita : "",
          };
        else if (c.tipo === "acum_ebitda")
          cell.value = {
            formula: ultimaLinhaMes
              ? `${L.acumEbitda}${ultimaLinhaMes}+${L.ebitda}${n}`
              : `${L.ebitda}${n}`,
            result: m.ebitdaAcumulado,
          };
        else if (c.tipo === "acum_caixa")
          cell.value = {
            formula: ultimaLinhaMes
              ? `${L.acumCaixa}${ultimaLinhaMes}+${L.ebitda}${n}+${L.aportes}${n}`
              : `${L.ebitda}${n}+${L.aportes}${n}`,
            result: m.caixaAcumulado,
          };
      });
      ultimaLinhaMes = n;
      linhasDoAno.push(n);
    };
    const fecharAno = (meses: LinhaMensalInvestidor[]) => {
      if (linhasDoAno.length === 0) return;
      const ano = meses[0].mes.slice(0, 4);
      const row = mm.addRow([]);
      const n = row.number;
      const primeiraN = linhasDoAno[0];
      const ultimaN = linhasDoAno[linhasDoAno.length - 1];
      const ultimo = meses[meses.length - 1];
      const soma = (k: keyof LinhaMensalInvestidor) =>
        meses.reduce((s, m) => s + Number(m[k]), 0);
      colunas.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        const col = letra(i + 1);
        cell.numFmt = c.fmt;
        preencher(cell, FECHAMENTO);
        if (c.tipo === "mes") {
          cell.value =
            meses.length === 12
              ? `Total ${ano}`
              : `Total ${ano} (${meses.length} ${meses.length === 1 ? "mês" : "meses"})`;
          cell.numFmt = "@";
        } else if (c.titulo === "Clientes ativos" || c.titulo === "MRR") {
          // Estoque: vale o do último mês do ano.
          cell.value = {
            formula: `${col}${ultimaN}`,
            result: c.titulo === "MRR" ? ultimo.mrr : ultimo.clientes,
          };
        } else if (c.tipo === "valor") {
          cell.value = {
            formula: `SUM(${col}${primeiraN}:${col}${ultimaN})`,
            result: meses.reduce((s, m) => s + c.valor!(m), 0),
          };
        } else if (c.tipo === "total_fixos")
          cell.value = {
            formula: `SUM(${faixaFixos.replaceAll("{r}", String(n))})`,
            result: soma("fixos"),
          };
        else if (c.tipo === "total_variaveis")
          cell.value = {
            formula: `SUM(${faixaVariaveis.replaceAll("{r}", String(n))})`,
            result: soma("variaveis"),
          };
        else if (c.tipo === "custos")
          cell.value = {
            formula: `${L.totalFixos}${n}+${L.totalVariaveis}${n}`,
            result: soma("custosTotais"),
          };
        else if (c.tipo === "ebitda")
          cell.value = {
            formula: `${L.receita}${n}-${L.custos}${n}`,
            result: soma("ebitda"),
          };
        else if (c.tipo === "margem") {
          const receitaAno = soma("receita");
          cell.value = {
            formula: `IF(${L.receita}${n}=0,"",${L.ebitda}${n}/${L.receita}${n})`,
            result: receitaAno > 0 ? soma("ebitda") / receitaAno : "",
          };
        } else if (c.tipo === "acum_ebitda")
          cell.value = {
            formula: `${col}${ultimaN}`,
            result: ultimo.ebitdaAcumulado,
          };
        else if (c.tipo === "acum_caixa")
          cell.value = {
            formula: `${col}${ultimaN}`,
            result: ultimo.caixaAcumulado,
          };
      });
      row.font = { bold: true };
      row.getCell(1).border = { top: { style: "thin" } };
      linhasDoAno = [];
    };

    let mesesAno: LinhaMensalInvestidor[] = [];
    for (const m of mensal) {
      if (
        mesesAno.length > 0 &&
        m.mes.slice(0, 4) !== mesesAno[0].mes.slice(0, 4)
      ) {
        fecharAno(mesesAno);
        mesesAno = [];
      }
      escreverMes(m);
      mesesAno.push(m);
    }
    fecharAno(mesesAno);

    // ─── Aba 4: Receita por produto ────────────────────────────────────────────────────────────
    const rp = workbook.addWorksheet("Receita por produto");
    const produtosComDados = (produtos ?? []).filter((p) =>
      (simRows ?? []).some(
        (r) => r.produto_id === p.id && mesesDoPeriodo.has(r.mes_referencia),
      ),
    );
    rp.columns = [
      { width: 12 },
      ...produtosComDados.flatMap(() => [{ width: 12 }, { width: 16 }]),
      { width: 12 },
      { width: 16 },
    ];
    const rpCab = rp.addRow([
      "Mês",
      ...produtosComDados.flatMap((p) => [
        `${p.nome} — clientes`,
        `${p.nome} — receita`,
      ]),
      "Total — clientes",
      "Total — receita",
    ]);
    rpCab.font = { bold: true };
    rpCab.alignment = { wrapText: true, vertical: "middle" };
    rpCab.height = 32;
    rpCab.eachCell((c) => preencher(c, CABECALHO));
    rp.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
    const simPorChave = new Map(
      (simRows ?? []).map((r) => [`${r.produto_id}__${r.mes_referencia}`, r]),
    );
    for (const m of mensal) {
      const valores = produtosComDados.flatMap((p) => {
        const r = simPorChave.get(`${p.id}__${m.mes}`);
        return [Number(r?.clientes_ativos ?? 0), Number(r?.receita_bruta ?? 0)];
      });
      const row = rp.addRow([
        new Date(m.mes + "T00:00:00"),
        ...valores,
        m.clientes,
        m.receita,
      ]);
      row.getCell(1).numFmt = "mmm/yyyy";
      for (let c = 2; c <= valores.length + 3; c++)
        row.getCell(c).numFmt = c % 2 === 0 ? "#,##0" : BRL;
    }

    // ─── Aba 5: Uso do recurso (plano de aplicação, por programa e frente) ───────────────────
    if (orcamento.length > 0) {
      const uso = workbook.addWorksheet("Uso do recurso", {
        views: [{ showGridLines: false }],
      });
      uso.columns = [
        { width: 38 },
        { width: 18 },
        { width: 12 },
        { width: 58 },
        { width: 58 },
      ];
      uso.addRow([
        `Detalhamento do plano de aplicação de recursos — ${resumo.aportes.programas.map((p) => p.nome).join(" & ")}`,
      ]).font = { bold: true, size: 14 };
      uso.addRow([
        "Análise por frente operacional, atividades cobertas e justificativa estratégica (Fomento & Investimento → Orçamento de cada programa)",
      ]).font = { color: { argb: "FF726E69" } };
      uso.addRow([]);
      const totalCapital = resumo.aportes.programas.reduce(
        (s, p) => s + p.valorTotal,
        0,
      );
      const rCap = uso.addRow(["CAPITAL TOTAL DISPONÍVEL", totalCapital, 1]);
      rCap.font = { bold: true, size: 12 };
      rCap.getCell(2).numFmt = BRL;
      rCap.getCell(3).numFmt = PCT;
      // Programas de investimento (rodada) agrupam por FRENTE (rubrica); fomento agrupa por categoria
      // do plano de contas (P&D, G&A…), que é como o edital é lido.
      for (const p of resumo.aportes.programas) {
        const linhasProg = orcamento.filter((l) => l.programa_id === p.id);
        if (linhasProg.length === 0) continue;
        const totalProg = linhasProg.reduce((s, l) => s + l.valor, 0);
        uso.addRow([]);
        const rProg = uso.addRow([
          `${p.tipo === "fomento" ? "Fomento não reembolsável" : "Aporte privado"} — ${p.nome}`,
          totalProg,
          totalCapital > 0 ? totalProg / totalCapital : null,
          p.tratamento,
        ]);
        rProg.font = { bold: true, color: { argb: "FFFFFFFF" } };
        rProg.eachCell((c) => preencher(c, FOCO_CABECALHO));
        rProg.getCell(2).numFmt = BRL;
        rProg.getCell(3).numFmt = PCT;
        rProg.getCell(4).alignment = { wrapText: true, vertical: "top" };
        const rCab = uso.addRow([
          "Frente de investimento",
          "Valor",
          "% do programa",
          "Atividades cobertas",
          "Justificativa estratégica / impacto",
        ]);
        rCab.font = { bold: true };
        rCab.eachCell((c) => preencher(c, CABECALHO));
        const porFrente = new Map<string, typeof linhasProg>();
        for (const l of linhasProg) {
          const chave =
            p.tipo === "fomento"
              ? LABEL_CATEGORIA_USO[l.categoria]
              : (l.rubrica ?? LABEL_CATEGORIA_USO[l.categoria]);
          porFrente.set(chave, [...(porFrente.get(chave) ?? []), l]);
        }
        for (const [frente, ls] of [...porFrente.entries()].sort(
          (a, b) =>
            b[1].reduce((s, l) => s + l.valor, 0) -
            a[1].reduce((s, l) => s + l.valor, 0),
        )) {
          const v = ls.reduce((s, l) => s + l.valor, 0);
          const atividades = [
            ...new Set(ls.map((l) => l.atividade).filter(Boolean)),
          ].join(" · ");
          const justificativas = [
            ...new Set(ls.map((l) => l.justificativa).filter(Boolean)),
          ].join(" ");
          const r = uso.addRow([
            frente,
            v,
            totalProg > 0 ? v / totalProg : null,
            atividades,
            justificativas,
          ]);
          r.getCell(1).font = { bold: true };
          r.getCell(2).numFmt = BRL;
          r.getCell(3).numFmt = PCT;
          for (const c of [4, 5])
            r.getCell(c).alignment = { wrapText: true, vertical: "top" };
          if (ls.length > 1) {
            for (const l of ls) {
              const rs = uso.addRow([
                `   ${l.rubrica ?? l.conta_nome ?? ""}`,
                l.valor,
                totalProg > 0 ? l.valor / totalProg : null,
                l.atividade,
                l.justificativa ?? "",
              ]);
              rs.font = { color: { argb: "FF726E69" } };
              rs.getCell(2).numFmt = BRL;
              rs.getCell(3).numFmt = PCT;
              for (const c of [4, 5])
                rs.getCell(c).alignment = { wrapText: true, vertical: "top" };
            }
          }
        }
        const rSub = uso.addRow([
          `SUBTOTAL — ${p.nome}`,
          totalProg,
          totalProg > 0 ? 1 : null,
          totalProg >= p.valorTotal
            ? "Capital 100% alocado"
            : `Alocado ${brlTxt(totalProg)} de ${brlTxt(p.valorTotal)}`,
        ]);
        rSub.font = { bold: true };
        rSub.eachCell((c) => preencher(c, FECHAMENTO));
        rSub.getCell(2).numFmt = BRL;
        rSub.getCell(3).numFmt = PCT;
      }
    }

    // ─── Aba 6: Premissas e notas ──────────────────────────────────────────────────────────────
    const notas = workbook.addWorksheet("Premissas e notas");
    notas.columns = [{ width: 30 }, { width: 110 }];
    const cabNotas = notas.addRow(["Item", "Descrição"]);
    cabNotas.font = { bold: true };
    cabNotas.eachCell((c) => preencher(c, CABECALHO));
    const nota = (item: string, texto: string) => {
      const r = notas.addRow([item, texto]);
      r.getCell(2).alignment = { wrapText: true, vertical: "top" };
      r.getCell(1).font = { bold: true };
    };
    nota("Cenário", `${cenario.nome} — período ${periodoTexto}`);
    nota(
      "Origem dos números",
      "Projeção do app TFO-Gestão (mesmos cálculos das telas de Vendas, Custos e Indicadores). Nada é digitado à mão nesta planilha.",
    );
    nota(
      "Receita total",
      "Mensalidades (MRR) + implementação, líquidas de descontos de combo, canal e condição especial de beta testers.",
    );
    nota(
      "MRR / ARR",
      "MRR = receita recorrente do mês (sem implementação). ARR = MRR × 12.",
    );
    nota(
      "Custos variáveis",
      "Acompanham clientes, receita e a meta de aquisição: operação (COGS: infraestrutura, APIs/LLM, suporte/CS, gateway, implementação), impostos sobre a receita (DAS do Simples), marketing, vendas (equipe comercial, comissões e parceiros) e outros de S&M (ferramentas).",
    );
    nota(
      "Custos fixos",
      "Estrutura que existe independente do volume: produto e tecnologia (P&D) e G&A (administrativo, jurídico, contábil, filiações).",
    );
    nota(
      "EBITDA",
      "Receita − custos variáveis − custos fixos. Aportes não entram no EBITDA: aparecem à parte, na coluna Caixa acumulado.",
    );
    nota(
      "Foco do investimento",
      `Colunas destacadas: ${focoTexto}. Nos variáveis, o que não é foco (nem imposto) está somado em "Outros variáveis"; os fixos saem sempre abertos em P&D e G&A.`,
    );
    nota(
      "Aportes",
      "Todos os programas vinculados ao cenário, nas datas previstas das parcelas. O fomento entra como se já estivesse aplicado (é subvenção, não se devolve).",
    );
    nota(
      "Retorno",
      "Calculado só sobre o investimento novo, ainda não aplicado. Fomento e parcelas já recebidas ficam fora da conta.",
    );
    nota(
      "Feiras e eventos",
      "Feira: custo provisionado em 12 parcelas fixas ao longo do ano da feira (como os eventos) e vendas no mês da feira. Eventos: custo do ano (quantidade × custo médio) provisionado em 12 parcelas fixas e clientes distribuídos no ano. Custo na linha de Marketing; vendas no canal direto, ao preço do plano/nível informado.",
    );
    nota(
      "Preço médio de venda",
      "Mensalidade de tabela de cada venda nova (planos pelo mix + níveis pela adesão), ponderada pelas vendas. Diferente do ticket médio (receita ÷ clientes), não carrega descontos nem implementação.",
    );
    nota(
      "TIR",
      "Taxa que zera o valor presente do fluxo mensal do período, anualizada. Com capital novo: sai no mês do aporte e volta como EBITDA. Sem capital novo: fluxo de EBITDA do projeto. Sem valor de saída.",
    );
    nota(
      "Uso do recurso",
      "Orçamento proposto de cada programa (tela Fomento & Investimento → Orçamento): a conta do plano de contas define a frente (marketing, vendas, produto, operação, estrutura).",
    );
    nota(
      "CAC",
      "Fully-loaded: mídia, ferramentas, equipe comercial própria e compartilhada, comissões e custo de parceiros ÷ novos clientes.",
    );
    nota(
      "Churn",
      "Planejado = taxa informada por fase, ponderada pelos clientes ativos. Efetivo = clientes que saíram ÷ clientes no início de cada mês.",
    );
    nota(
      "Referências de mercado",
      "Manual de Treinamento da Banca Avaliadora de Venture Capital — B2B SaaS (faixas por estágio: validação, PMF, tração, escala).",
    );
    nota(
      "Fórmulas",
      "Na aba Mês a mês, totais, EBITDA e acumulados são fórmulas: se alguém ajustar um custo na planilha, o resultado se recalcula.",
    );

    // Quadro das feiras mapeadas no plano de marketing — as que a empresa pretende participar.
    const feiras = acoes.filter((a) => a.tipo === "feira");
    if (feiras.length > 0) {
      notas.addRow([]);
      const rT = notas.addRow([
        "Feiras mapeadas",
        `${feiras.length} feira(s) no plano de marketing — custo provisionado em 12 parcelas no ano; vendas no mês da feira`,
      ]);
      rT.font = { bold: true };
      const nomeProd = new Map((produtos ?? []).map((p) => [p.id, p.nome]));
      const rC = notas.addRow([
        "Feira",
        "Quando · custo (estande + logística + material) · retorno previsto · custo por cliente · observações",
      ]);
      rC.font = { bold: true };
      rC.eachCell((c) => preencher(c, CABECALHO));
      for (const f of [...feiras].sort((a, b) =>
        (a.mes ?? "").localeCompare(b.mes ?? ""),
      )) {
        const total = custoTotalAcao(f, resumo.periodo.fim);
        const clientes = clientesTotaisAcao(f, resumo.periodo.fim);
        const comp = [
          f.parametros?.estande != null
            ? `estande ${brlTxt(Number(f.parametros.estande))}`
            : null,
          f.parametros?.logistica != null
            ? `logística ${brlTxt(Number(f.parametros.logistica))}`
            : null,
          f.parametros?.material != null
            ? `material ${brlTxt(Number(f.parametros.material))}`
            : null,
        ]
          .filter(Boolean)
          .join(" + ");
        const retorno = (f.retorno ?? [])
          .map(
            (x) =>
              `${x.clientes} ${nomeProd.get(x.produto_id) ?? ""}${x.plano_nome ? ` (${x.plano_nome})` : ""}`,
          )
          .join(" · ");
        nota(
          f.nome,
          `${f.mes ? formatarMesAno(f.mes) : "data a definir"} · ${brlTxt(total)}${comp ? ` (${comp})` : ""} · ${clientes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cliente(s): ${retorno || "—"}${clientes > 0 ? ` · ${brlTxt(total / clientes)} por cliente` : ""}${f.soma_na_meta ? " · soma à projeção" : " · explica a meta do canal direto"}${f.observacoes ? ` · ${f.observacoes}` : ""}`,
        );
      }
    }
  };

  const slug = cenario.nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (searchParams.get("formato") === "pdf") {
    const captura = criarCapturaPlanilha();
    montar(captura);
    const pdf = await planilhaParaPdf(
      captura.modelo(),
      `Plano financeiro — ${cenario.nome}`,
      `Período: ${periodoTexto} · foco do investimento: ${focoTexto} · gerado em ${new Date().toLocaleDateString("pt-BR")}`,
    );
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="plano-investidor-${slug}.pdf"`,
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  montar(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plano-investidor-${slug}.xlsx"`,
    },
  });
}

function valorCelula(i: IndicadorInvestidor): number | string {
  if (i.valor == null) return "—";
  return i.valor;
}

function formatoCelula(i: IndicadorInvestidor): string {
  if (typeof i.valor !== "number") return "@";
  if (i.formato === "brl") return BRL;
  if (i.formato === "pct") return PCT;
  if (i.formato === "x") return '0.0"x"';
  if (i.formato === "meses") return '0.0" meses"';
  return "#,##0";
}
