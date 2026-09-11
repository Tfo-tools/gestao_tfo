import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { agregarPorCenario, computeMetricas, recortarPeriodo } from "@/lib/relatorios-cenario";
import { calcularRetornoPrograma, agregarRetornoProgramas } from "@/lib/retorno-investidor";
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
const LEITURA_COR: Record<string, string> = { alto: "FFE8F2EC", bom: "FFF6F5F2", atencao: "FFFAECE7" };
const LEITURA_TEXTO: Record<string, string> = { alto: "Alto potencial", bom: "Dentro da referência", atencao: "Atenção" };
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

function preencher(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Planilha pro investidor: indicadores de decisão na 1ª aba, resumo anual (EBITDA consolidado por
 * ano), DRE mês a mês com custos fixos e variáveis e as colunas de foco do investimento destacadas. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ cenarioId: string }> }) {
  const { cenarioId } = await params;
  const { searchParams } = new URL(request.url);
  const supabase = await createClient();

  const focosValidos = new Set(FOCOS_INVESTIMENTO.map((f) => f.key));
  const focoPedido = searchParams.getAll("foco").filter((f): f is FocoInvestimento => focosValidos.has(f as FocoInvestimento));
  // Sem foco na URL (link direto), vale o padrão; com o formulário, vale o que foi marcado.
  const focos = new Set<FocoInvestimento>(
    searchParams.has("inicio") || focoPedido.length > 0 ? focoPedido : FOCOS_INVESTIMENTO.filter((f) => f.padrao).map((f) => f.key),
  );

  const [{ data: cenario }, resumo, { data: simRows }, { data: produtos }, { data: alocacoes }] = await Promise.all([
    supabase.from("cenarios").select("id, nome, data_inicio, data_fim").eq("id", cenarioId).single(),
    agregarPorCenario(supabase, cenarioId),
    supabase
      .from("simulacao_mensal")
      .select("produto_id, mes_referencia, mrr, clientes_perdidos, clientes_ativos, receita_bruta")
      .eq("cenario_id", cenarioId),
    supabase.from("produtos").select("id, nome").or(`cenario_id.is.null,cenario_id.eq.${cenarioId}`).order("nome"),
    supabase.from("alocacao_investimento").select("categoria, percentual, observacoes").eq("cenario_id", cenarioId).order("created_at"),
  ]);
  if (!cenario) return new NextResponse("Cenário não encontrado", { status: 404 });

  const inicio = searchParams.get("inicio") || resumo.periodo.inicio;
  const fim = searchParams.get("fim") || resumo.periodo.fim;
  const linhas = recortarPeriodo(resumo.linhas, inicio, fim);
  const metricas = computeMetricas(linhas, resumo.totalInvestido);

  const mrrPorMes = new Map<string, number>();
  const perdidosPorMes = new Map<string, number>();
  for (const r of simRows ?? []) {
    mrrPorMes.set(r.mes_referencia, (mrrPorMes.get(r.mes_referencia) ?? 0) + Number(r.mrr ?? 0));
    perdidosPorMes.set(r.mes_referencia, (perdidosPorMes.get(r.mes_referencia) ?? 0) + Number(r.clientes_perdidos ?? 0));
  }
  const mensal = linhasMensaisInvestidor(linhas, { mrrPorMes, perdidosPorMes, aportesPorMes: resumo.aportes.porMes });
  const anual = resumoAnualInvestidor(mensal);
  const mesesDoPeriodo = new Set(mensal.map((m) => m.mes));
  const aportesTotal = mensal.reduce((s, m) => s + m.aportes, 0);

  // Retorno do investidor por equity (MOIC/TIR) — só quando houver valuation cadastrado.
  const idsNaoFomento = resumo.aportes.programas.filter((p) => p.tipo !== "fomento").map((p) => p.id);
  let retornoEquity: { moic: number | null; tirPct: number | null } | null = null;
  if (idsNaoFomento.length > 0) {
    const [{ data: progs }, { data: reav }] = await Promise.all([
      supabase.from("programas_investimento").select("id, valor_total, valuation_post_money, data_aporte").in("id", idsNaoFomento),
      supabase.from("reavaliacoes_valuation").select("programa_id, data_referencia, novo_valuation, fator_diluicao").in("programa_id", idsNaoFomento),
    ]);
    const agregado = agregarRetornoProgramas(
      (progs ?? []).map((p) => ({
        valorInvestido: Number(p.valor_total ?? 0),
        retorno: calcularRetornoPrograma({
          valor_investido: Number(p.valor_total ?? 0),
          valuation_post_money: p.valuation_post_money != null ? Number(p.valuation_post_money) : null,
          data_aporte: p.data_aporte,
          reavaliacoes: (reav ?? []).filter((r) => r.programa_id === p.id),
        }),
      })),
    );
    if (agregado.temValuation) retornoEquity = { moic: agregado.moic, tirPct: agregado.tirPct };
  }

  const indicadores = indicadoresInvestidor({ mensal, anual, metricas, capitalNovo: resumo.totalInvestido, aportesTotal, retornoEquity });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TFO-Gestão";
  workbook.created = new Date();
  // As fórmulas já vão com o valor calculado; isso só garante o recálculo se alguém editar a planilha.
  workbook.calcProperties.fullCalcOnLoad = true;

  const periodoTexto = mensal.length > 0 ? `${formatarMesAno(mensal[0].mes)} a ${formatarMesAno(mensal[mensal.length - 1].mes)}` : "sem projeção no período";
  const focoTexto = [...focos].map((f) => LABEL_FOCO[f]).join(", ") || "nenhum (custos consolidados)";

  // ─── Aba 1: Indicadores ────────────────────────────────────────────────────────────────────
  const ind = workbook.addWorksheet("Indicadores", { views: [{ showGridLines: false }] });
  ind.columns = [{ width: 30 }, { width: 46 }, { width: 20 }, { width: 62 }, { width: 46 }, { width: 20 }];
  ind.addRow([`Plano financeiro — ${cenario.nome}`]).font = { bold: true, size: 14 };
  ind.addRow([`Período: ${periodoTexto} · gerado em ${new Date().toLocaleDateString("pt-BR")}`]).font = { color: { argb: "FF726E69" } };
  ind.addRow([`Foco do investimento (colunas destacadas nas abas seguintes): ${focoTexto}`]).font = { color: { argb: "FF726E69" } };
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

  titulo("Captação vinculada ao cenário");
  cabecalho(["Programa", "Tipo", "Valor total", "Tratamento na planilha", "Parcelas previstas", ""]);
  if (resumo.aportes.programas.length === 0) ind.addRow(["Nenhum programa vinculado a este cenário."]);
  for (const p of resumo.aportes.programas) {
    // Parcela fora do período (ex: fomento recebido antes do início do cenário) aparece marcada —
    // não entra na linha de aportes do período, mas o investidor precisa saber que ela existe.
    const inicioPeriodo = mensal[0]?.mes ?? "";
    const descreverParcela = (x: (typeof p.parcelas)[number]) =>
      `${formatarMesAno(x.mes)}: R$ ${Math.round(x.valor).toLocaleString("pt-BR")}${
        mesesDoPeriodo.has(x.mes) ? "" : x.mes < inicioPeriodo ? " (antes do período)" : " (depois do período)"
      }${x.recebida ? " — recebida" : ""}`;
    const r = ind.addRow([p.nome, p.tipo, p.valorTotal, p.tratamento, p.parcelas.map(descreverParcela).join(" · ") || "—"]);
    r.getCell(3).numFmt = BRL;
    r.getCell(4).alignment = { wrapText: true, vertical: "top" };
    r.getCell(5).alignment = { wrapText: true, vertical: "top" };
    if (p.entraNoRetorno) r.getCell(1).font = { bold: true };
  }
  const rCap = ind.addRow(["Capital novo (base do retorno)", "", resumo.totalInvestido, "Só o investimento ainda não aplicado. Fomento entra nos aportes, fora do retorno."]);
  rCap.font = { bold: true };
  rCap.getCell(3).numFmt = BRL;
  ind.addRow([]);

  titulo("Indicadores para decisão");
  cabecalho(["Grupo", "Indicador", "Valor", "Como é calculado", "Referência de mercado", "Leitura"]);
  let grupoAnterior = "";
  for (const i of indicadores) {
    const r = ind.addRow([i.grupo === grupoAnterior ? "" : i.grupo, i.nome, valorCelula(i), i.calculo, i.referencia, i.leitura ? LEITURA_TEXTO[i.leitura] : ""]);
    grupoAnterior = i.grupo;
    r.getCell(1).font = { bold: true };
    r.getCell(3).numFmt = formatoCelula(i);
    r.getCell(3).alignment = { horizontal: "right" };
    for (const c of [2, 4, 5]) r.getCell(c).alignment = { wrapText: true, vertical: "top" };
    if (i.leitura) preencher(r.getCell(6), LEITURA_COR[i.leitura]);
  }
  ind.addRow([]);

  titulo("EBITDA consolidado por ano");
  cabecalho(["Ano", "Receita", "EBITDA", "Margem EBITDA", "Aportes", "Caixa acumulado ao fim"]);
  for (const a of anual) {
    const r = ind.addRow([a.meses === 12 ? a.ano : `${a.ano} (${a.meses} ${a.meses === 1 ? "mês" : "meses"})`, a.receita, a.ebitda, a.margemEbitda, a.aportes, a.caixaFinal]);
    for (const c of [2, 3, 5, 6]) r.getCell(c).numFmt = BRL;
    r.getCell(4).numFmt = PCT;
  }
  const totalEbitda = anual.reduce((s, a) => s + a.ebitda, 0);
  const totalReceita = anual.reduce((s, a) => s + a.receita, 0);
  const rTot = ind.addRow(["Total do período", totalReceita, totalEbitda, totalReceita > 0 ? totalEbitda / totalReceita : null, aportesTotal, mensal[mensal.length - 1]?.caixaAcumulado ?? 0]);
  rTot.font = { bold: true };
  rTot.eachCell((c) => preencher(c, FECHAMENTO));
  for (const c of [2, 3, 5, 6]) rTot.getCell(c).numFmt = BRL;
  rTot.getCell(4).numFmt = PCT;

  if ((alocacoes ?? []).length > 0) {
    ind.addRow([]);
    titulo("Uso do recurso (destinação do investimento)");
    cabecalho(["Categoria", "Observações", "% do capital novo", "Valor estimado", "", ""]);
    for (const a of alocacoes ?? []) {
      const pct = Number(a.percentual) / 100;
      const r = ind.addRow([a.categoria, a.observacoes ?? "", pct, pct * resumo.totalInvestido]);
      r.getCell(3).numFmt = PCT;
      r.getCell(4).numFmt = BRL;
    }
  }

  // ─── Aba 2: Resumo anual (anos em colunas) ─────────────────────────────────────────────────
  const res = workbook.addWorksheet("Resumo anual");
  res.columns = [{ width: 36 }, ...anual.map(() => ({ width: 16 })), { width: 18 }];
  const cabAnos = res.addRow(["", ...anual.map((a) => (a.meses === 12 ? a.ano : `${a.ano} (${a.meses}m)`)), "Total"]);
  cabAnos.font = { bold: true };
  cabAnos.eachCell((c) => preencher(c, CABECALHO));
  res.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  const focosVariaveis = FOCOS_INVESTIMENTO.filter((f) => f.secao === "variavel" && focos.has(f.key)).map((f) => f.key);
  const CATEGORIAS_FIXAS = FOCOS_INVESTIMENTO.filter((f) => f.secao === "fixo").map((f) => f.key);
  const valorCategoria = (x: Record<FocoInvestimento, number>, k: FocoInvestimento) => x[k];
  type Anual = (typeof anual)[number];
  // Resto do grupo; resíduo de ponto flutuante (ex: −0,0000001) vira zero pra não poluir a planilha.
  const outrosVariaveis = (a: Pick<Anual, "variaveis" | "impostos"> & Record<FocoInvestimento, number>) => {
    const v = a.variaveis - a.impostos - focosVariaveis.reduce((s, k) => s + valorCategoria(a, k), 0);
    return Math.abs(v) < 0.005 ? 0 : v;
  };

  const linhaRes = (
    rotulo: string,
    valor: (a: Anual) => number | null,
    opcoes: { fmt?: string; total?: "soma" | "ultimo" | null; negrito?: boolean; foco?: boolean; recuo?: boolean } = {},
  ) => {
    const valores = anual.map(valor);
    const total =
      opcoes.total === "soma" ? valores.reduce<number>((s, v) => s + (v ?? 0), 0) : opcoes.total === "ultimo" ? (valores[valores.length - 1] ?? null) : null;
    const r = res.addRow([`${opcoes.recuo ? "   " : ""}${rotulo}`, ...valores, total]);
    for (let c = 2; c <= anual.length + 2; c++) r.getCell(c).numFmt = opcoes.fmt ?? BRL;
    if (opcoes.negrito) r.font = { bold: true };
    if (opcoes.foco) r.eachCell((c) => preencher(c, FOCO_CELULA));
    return r;
  };
  const secaoRes = (texto: string) => {
    const r = res.addRow([texto]);
    r.font = { bold: true, color: { argb: "FF726E69" } };
  };

  secaoRes("CLIENTES E RECEITA");
  linhaRes("Clientes ativos ao fim do ano", (a) => a.clientesFinal, { fmt: "#,##0", total: "ultimo" });
  linhaRes("Novos clientes", (a) => a.novos, { fmt: "#,##0", total: "soma" });
  linhaRes("Clientes perdidos", (a) => a.perdidos, { fmt: "#,##0", total: "soma" });
  linhaRes("MRR ao fim do ano", (a) => a.mrrFinal, { total: "ultimo" });
  linhaRes("ARR ao fim do ano", (a) => a.arrFinal, { total: "ultimo", negrito: true });
  linhaRes("Crescimento do ARR no ano", (a) => a.crescimentoArr, { fmt: PCT });
  linhaRes("Receita total", (a) => a.receita, { total: "soma", negrito: true });
  secaoRes("CUSTOS FIXOS");
  for (const k of CATEGORIAS_FIXAS) linhaRes(LABEL_FOCO[k], (a) => a[k], { total: "soma", foco: focos.has(k), recuo: true });
  linhaRes("Total custos fixos", (a) => a.fixos, { total: "soma", negrito: true });
  secaoRes("CUSTOS VARIÁVEIS");
  for (const k of focosVariaveis) linhaRes(LABEL_FOCO[k], (a) => a[k], { total: "soma", foco: true, recuo: true });
  linhaRes("Impostos sobre a receita (DAS)", (a) => a.impostos, { total: "soma", recuo: true });
  linhaRes("Outros variáveis", (a) => outrosVariaveis(a), { total: "soma", recuo: true });
  linhaRes("Total custos variáveis", (a) => a.variaveis, { total: "soma", negrito: true });
  secaoRes("RESULTADO");
  const rEbitda = linhaRes("EBITDA consolidado do ano", (a) => a.ebitda, { total: "soma", negrito: true });
  rEbitda.eachCell((c) => preencher(c, FECHAMENTO));
  linhaRes("Margem EBITDA", (a) => a.margemEbitda, { fmt: PCT });
  linhaRes("Margem bruta", (a) => a.margemBruta, { fmt: PCT });
  linhaRes("Regra dos 40 (crescimento ARR + margem EBITDA)", (a) => a.regra40, { fmt: PCT });
  linhaRes("Burn multiple (queima ÷ ARR novo)", (a) => a.burnMultiple, { fmt: '0.0"x"' });
  secaoRes("CAIXA");
  linhaRes("Aportes (todos os programas)", (a) => a.aportes, { total: "soma" });
  linhaRes("Caixa acumulado ao fim do ano (aportes + EBITDA)", (a) => a.caixaFinal, { total: "ultimo", negrito: true });

  // ─── Aba 3: Mês a mês ──────────────────────────────────────────────────────────────────────
  const mm = workbook.addWorksheet("Mês a mês");
  type ColMes = { titulo: string; grupo: string; largura: number; fmt: string; foco?: boolean; valor?: (m: LinhaMensalInvestidor) => number; tipo: "valor" | "total_fixos" | "total_variaveis" | "custos" | "ebitda" | "margem" | "acum_ebitda" | "acum_caixa" | "mes" };
  const colunas: ColMes[] = [
    { titulo: "Mês", grupo: "", largura: 12, fmt: "mmm/yyyy", tipo: "mes" },
    { titulo: "Clientes ativos", grupo: "CLIENTES E RECEITA", largura: 13, fmt: "#,##0", valor: (m) => m.clientes, tipo: "valor" },
    { titulo: "Novos clientes", grupo: "CLIENTES E RECEITA", largura: 12, fmt: "#,##0", valor: (m) => m.novos, tipo: "valor" },
    { titulo: "Clientes perdidos", grupo: "CLIENTES E RECEITA", largura: 13, fmt: "#,##0", valor: (m) => m.perdidos, tipo: "valor" },
    { titulo: "MRR", grupo: "CLIENTES E RECEITA", largura: 14, fmt: BRL, valor: (m) => m.mrr, tipo: "valor" },
    { titulo: "Receita total", grupo: "CLIENTES E RECEITA", largura: 15, fmt: BRL, valor: (m) => m.receita, tipo: "valor" },
    // Fixos são só duas categorias: saem sempre abertas (destacadas quando forem o foco).
    ...CATEGORIAS_FIXAS.map((k) => ({ titulo: LABEL_FOCO[k], grupo: "CUSTOS FIXOS", largura: 18, fmt: BRL, foco: focos.has(k), valor: (m: LinhaMensalInvestidor) => m[k], tipo: "valor" as const })),
    { titulo: "Total fixos", grupo: "CUSTOS FIXOS", largura: 14, fmt: BRL, tipo: "total_fixos" },
    ...focosVariaveis.map((k) => ({ titulo: LABEL_FOCO[k], grupo: "CUSTOS VARIÁVEIS", largura: 18, fmt: BRL, foco: true, valor: (m: LinhaMensalInvestidor) => m[k], tipo: "valor" as const })),
    { titulo: "Impostos (DAS)", grupo: "CUSTOS VARIÁVEIS", largura: 14, fmt: BRL, valor: (m) => m.impostos, tipo: "valor" },
    { titulo: "Outros variáveis", grupo: "CUSTOS VARIÁVEIS", largura: 15, fmt: BRL, valor: (m) => outrosVariaveis(m), tipo: "valor" },
    { titulo: "Total variáveis", grupo: "CUSTOS VARIÁVEIS", largura: 15, fmt: BRL, tipo: "total_variaveis" },
    { titulo: "Custos totais", grupo: "RESULTADO", largura: 15, fmt: BRL, tipo: "custos" },
    { titulo: "EBITDA", grupo: "RESULTADO", largura: 15, fmt: BRL, tipo: "ebitda" },
    { titulo: "Margem EBITDA", grupo: "RESULTADO", largura: 12, fmt: PCT, tipo: "margem" },
    { titulo: "EBITDA acumulado", grupo: "RESULTADO", largura: 16, fmt: BRL, tipo: "acum_ebitda" },
    { titulo: "Aportes", grupo: "CAIXA", largura: 14, fmt: BRL, valor: (m) => m.aportes, tipo: "valor" },
    { titulo: "Caixa acumulado (aportes + EBITDA)", grupo: "CAIXA", largura: 20, fmt: BRL, tipo: "acum_caixa" },
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
    const cols = colunas.map((c, i) => ({ c, i: i + 1 })).filter(({ c }) => c.grupo === grupo && c.tipo !== excetoTipo);
    return `${letra(cols[0].i)}{r}:${letra(cols[cols.length - 1].i)}{r}`;
  };
  const faixaFixos = faixaCols("CUSTOS FIXOS", "total_fixos");
  const faixaVariaveis = faixaCols("CUSTOS VARIÁVEIS", "total_variaveis");

  // Linha 1: grupos (mesclados); linha 2: nomes das colunas.
  const rGrupos = mm.addRow(colunas.map((c) => c.grupo));
  const rNomes = mm.addRow(colunas.map((c) => c.titulo));
  let inicioGrupo = 1;
  for (let i = 2; i <= colunas.length + 1; i++) {
    if (i === colunas.length + 1 || colunas[i - 1].grupo !== colunas[inicioGrupo - 1].grupo) {
      if (i - 1 > inicioGrupo) mm.mergeCells(1, inicioGrupo, 1, i - 1);
      inicioGrupo = i;
    }
  }
  for (const r of [rGrupos, rNomes]) {
    r.font = { bold: true };
    r.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
  rNomes.height = 32;
  colunas.forEach((c, i) => {
    preencher(rGrupos.getCell(i + 1), CABECALHO);
    if (c.foco) {
      preencher(rNomes.getCell(i + 1), FOCO_CABECALHO);
      rNomes.getCell(i + 1).font = { bold: true, color: { argb: "FFFFFFFF" } };
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
      else if (c.tipo === "total_fixos") cell.value = { formula: `SUM(${faixaFixos.replaceAll("{r}", String(n))})`, result: m.fixos };
      else if (c.tipo === "total_variaveis") cell.value = { formula: `SUM(${faixaVariaveis.replaceAll("{r}", String(n))})`, result: m.variaveis };
      else if (c.tipo === "custos") cell.value = { formula: `${L.totalFixos}${n}+${L.totalVariaveis}${n}`, result: m.custosTotais };
      else if (c.tipo === "ebitda") cell.value = { formula: `${L.receita}${n}-${L.custos}${n}`, result: m.ebitda };
      else if (c.tipo === "margem") cell.value = { formula: `IF(${L.receita}${n}=0,"",${L.ebitda}${n}/${L.receita}${n})`, result: m.receita > 0 ? m.ebitda / m.receita : "" };
      else if (c.tipo === "acum_ebitda")
        cell.value = { formula: ultimaLinhaMes ? `${L.acumEbitda}${ultimaLinhaMes}+${L.ebitda}${n}` : `${L.ebitda}${n}`, result: m.ebitdaAcumulado };
      else if (c.tipo === "acum_caixa")
        cell.value = {
          formula: ultimaLinhaMes ? `${L.acumCaixa}${ultimaLinhaMes}+${L.ebitda}${n}+${L.aportes}${n}` : `${L.ebitda}${n}+${L.aportes}${n}`,
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
    const soma = (k: keyof LinhaMensalInvestidor) => meses.reduce((s, m) => s + Number(m[k]), 0);
    colunas.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const col = letra(i + 1);
      cell.numFmt = c.fmt;
      preencher(cell, FECHAMENTO);
      if (c.tipo === "mes") {
        cell.value = meses.length === 12 ? `Total ${ano}` : `Total ${ano} (${meses.length} ${meses.length === 1 ? "mês" : "meses"})`;
        cell.numFmt = "@";
      } else if (c.titulo === "Clientes ativos" || c.titulo === "MRR") {
        // Estoque: vale o do último mês do ano.
        cell.value = { formula: `${col}${ultimaN}`, result: c.titulo === "MRR" ? ultimo.mrr : ultimo.clientes };
      } else if (c.tipo === "valor") {
        cell.value = { formula: `SUM(${col}${primeiraN}:${col}${ultimaN})`, result: meses.reduce((s, m) => s + c.valor!(m), 0) };
      } else if (c.tipo === "total_fixos") cell.value = { formula: `SUM(${faixaFixos.replaceAll("{r}", String(n))})`, result: soma("fixos") };
      else if (c.tipo === "total_variaveis") cell.value = { formula: `SUM(${faixaVariaveis.replaceAll("{r}", String(n))})`, result: soma("variaveis") };
      else if (c.tipo === "custos") cell.value = { formula: `${L.totalFixos}${n}+${L.totalVariaveis}${n}`, result: soma("custosTotais") };
      else if (c.tipo === "ebitda") cell.value = { formula: `${L.receita}${n}-${L.custos}${n}`, result: soma("ebitda") };
      else if (c.tipo === "margem") {
        const receitaAno = soma("receita");
        cell.value = { formula: `IF(${L.receita}${n}=0,"",${L.ebitda}${n}/${L.receita}${n})`, result: receitaAno > 0 ? soma("ebitda") / receitaAno : "" };
      } else if (c.tipo === "acum_ebitda") cell.value = { formula: `${col}${ultimaN}`, result: ultimo.ebitdaAcumulado };
      else if (c.tipo === "acum_caixa") cell.value = { formula: `${col}${ultimaN}`, result: ultimo.caixaAcumulado };
    });
    row.font = { bold: true };
    row.getCell(1).border = { top: { style: "thin" } };
    linhasDoAno = [];
  };

  let mesesAno: LinhaMensalInvestidor[] = [];
  for (const m of mensal) {
    if (mesesAno.length > 0 && m.mes.slice(0, 4) !== mesesAno[0].mes.slice(0, 4)) {
      fecharAno(mesesAno);
      mesesAno = [];
    }
    escreverMes(m);
    mesesAno.push(m);
  }
  fecharAno(mesesAno);

  // ─── Aba 4: Receita por produto ────────────────────────────────────────────────────────────
  const rp = workbook.addWorksheet("Receita por produto");
  const produtosComDados = (produtos ?? []).filter((p) => (simRows ?? []).some((r) => r.produto_id === p.id && mesesDoPeriodo.has(r.mes_referencia)));
  rp.columns = [{ width: 12 }, ...produtosComDados.flatMap(() => [{ width: 12 }, { width: 16 }]), { width: 12 }, { width: 16 }];
  const rpCab = rp.addRow(["Mês", ...produtosComDados.flatMap((p) => [`${p.nome} — clientes`, `${p.nome} — receita`]), "Total — clientes", "Total — receita"]);
  rpCab.font = { bold: true };
  rpCab.alignment = { wrapText: true, vertical: "middle" };
  rpCab.height = 32;
  rpCab.eachCell((c) => preencher(c, CABECALHO));
  rp.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  const simPorChave = new Map((simRows ?? []).map((r) => [`${r.produto_id}__${r.mes_referencia}`, r]));
  for (const m of mensal) {
    const valores = produtosComDados.flatMap((p) => {
      const r = simPorChave.get(`${p.id}__${m.mes}`);
      return [Number(r?.clientes_ativos ?? 0), Number(r?.receita_bruta ?? 0)];
    });
    const row = rp.addRow([new Date(m.mes + "T00:00:00"), ...valores, m.clientes, m.receita]);
    row.getCell(1).numFmt = "mmm/yyyy";
    for (let c = 2; c <= valores.length + 3; c++) row.getCell(c).numFmt = c % 2 === 0 ? "#,##0" : BRL;
  }

  // ─── Aba 5: Premissas e notas ──────────────────────────────────────────────────────────────
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
  nota("Origem dos números", "Projeção do app TFO-Gestão (mesmos cálculos das telas de Vendas, Custos e Indicadores). Nada é digitado à mão nesta planilha.");
  nota("Receita total", "Mensalidades (MRR) + implementação, líquidas de descontos de combo, canal e condição especial de beta testers.");
  nota("MRR / ARR", "MRR = receita recorrente do mês (sem implementação). ARR = MRR × 12.");
  nota("Custos variáveis", "Acompanham clientes, receita e a meta de aquisição: operação (COGS: infraestrutura, APIs/LLM, suporte/CS, gateway, implementação), impostos sobre a receita (DAS do Simples), marketing, vendas (equipe comercial, comissões e parceiros) e outros de S&M (ferramentas).");
  nota("Custos fixos", "Estrutura que existe independente do volume: produto e tecnologia (P&D) e G&A (administrativo, jurídico, contábil, filiações).");
  nota("EBITDA", "Receita − custos variáveis − custos fixos. Aportes não entram no EBITDA: aparecem à parte, na coluna Caixa acumulado.");
  nota("Foco do investimento", `Colunas destacadas: ${focoTexto}. Nos variáveis, o que não é foco (nem imposto) está somado em "Outros variáveis"; os fixos saem sempre abertos em P&D e G&A.`);
  nota("Aportes", "Todos os programas vinculados ao cenário, nas datas previstas das parcelas. O fomento entra como se já estivesse aplicado (é subvenção, não se devolve).");
  nota("Retorno", "Calculado só sobre o investimento novo, ainda não aplicado. Fomento e parcelas já recebidas ficam fora da conta.");
  nota("CAC", "Fully-loaded: mídia, ferramentas, equipe comercial própria e compartilhada, comissões e custo de parceiros ÷ novos clientes.");
  nota("Churn", "Planejado = taxa informada por fase, ponderada pelos clientes ativos. Efetivo = clientes que saíram ÷ clientes no início de cada mês.");
  nota("Referências de mercado", "Manual de Treinamento da Banca Avaliadora de Venture Capital — B2B SaaS (faixas por estágio: validação, PMF, tração, escala).");
  nota("Fórmulas", "Na aba Mês a mês, totais, EBITDA e acumulados são fórmulas: se alguém ajustar um custo na planilha, o resultado se recalcula.");

  const buffer = await workbook.xlsx.writeBuffer();
  const slug = cenario.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
