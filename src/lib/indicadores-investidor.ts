import type { Agregado, Metricas } from "@/lib/relatorios-cenario";

/**
 * Indicadores da planilha pro investidor, calculados a partir das mesmas linhas mensais que as
 * telas usam (agregarPorCenario) — nenhum número aqui diverge do que aparece no app.
 *
 * Classificação de custos (fecha exatamente com o EBITDA do app):
 *  - Variáveis = gasto que acompanha clientes, receita e a meta de aquisição: operação (COGS),
 *    impostos sobre a receita (DAS), marketing, vendas e outros de S&M.
 *  - Fixos = estrutura que existe independente do volume: produto/tecnologia (P&D) e G&A.
 *  EBITDA = Receita − Variáveis − Fixos.
 *
 * Referências de mercado: Manual de Treinamento da Banca Avaliadora de VC (B2B SaaS), em FONTES.
 */

export type FocoInvestimento = "marketing" | "vendas" | "operacao" | "produto" | "estrutura";

export const FOCOS_INVESTIMENTO: { key: FocoInvestimento; label: string; padrao: boolean; secao: "fixo" | "variavel" }[] = [
  { key: "marketing", label: "Marketing", padrao: true, secao: "variavel" },
  { key: "vendas", label: "Vendas", padrao: true, secao: "variavel" },
  { key: "operacao", label: "Operação e suporte (COGS)", padrao: false, secao: "variavel" },
  { key: "produto", label: "Produto e tecnologia (P&D)", padrao: false, secao: "fixo" },
  { key: "estrutura", label: "Estrutura (G&A)", padrao: false, secao: "fixo" },
];

export type LinhaMensalInvestidor = {
  mes: string;
  clientes: number;
  novos: number;
  /** Dos novos, quantos vieram de feiras e eventos. */
  novosAcoes: number;
  perdidos: number;
  mrr: number;
  receita: number;
  /** Receita de serviços de implantação (cobrança única) — o resto da receita é software. */
  receitaImplantacao: number;
  /** Custo de entregar a implantação (horas das etapas × clientes novos). */
  custoImplantacao: number;
  impostos: number;
  operacao: number;
  marketing: number;
  /** Dentro de marketing: custo de feiras e eventos. */
  feirasEventos: number;
  vendas: number;
  outrosSm: number;
  produto: number;
  estrutura: number;
  variaveis: number;
  fixos: number;
  custosTotais: number;
  ebitda: number;
  /** IRPJ/CSLL do lucro presumido, fora do Simples — abaixo do EBITDA. */
  irpjCsll: number;
  ebitdaAcumulado: number;
  aportes: number;
  /** Aportes acumulados + EBITDA acumulado desde o início do período. */
  caixaAcumulado: number;
};

export type LinhaAnualInvestidor = Omit<LinhaMensalInvestidor, "mes" | "clientes" | "mrr" | "ebitdaAcumulado" | "caixaAcumulado"> & {
  ano: string;
  meses: number;
  clientesFinal: number;
  mrrFinal: number;
  arrFinal: number;
  margemBruta: number | null;
  /** DRE segregada: software (recorrente) e serviços de implantação, cada um com a sua margem. */
  receitaSoftware: number;
  margemBrutaSoftware: number | null;
  margemImplantacao: number | null;
  margemEbitda: number | null;
  caixaFinal: number;
  /** ARR de dezembro (ou do último mês) vs. o do ano anterior. */
  crescimentoArr: number | null;
  regra40: number | null;
  burnMultiple: number | null;
};

export type LeituraBenchmark = "alto" | "bom" | "atencao" | null;

export type IndicadorInvestidor = {
  grupo: string;
  nome: string;
  valor: number | string | null;
  formato: "brl" | "pct" | "num" | "x" | "meses" | "texto";
  calculo: string;
  referencia: string;
  leitura: LeituraBenchmark;
};

export function linhasMensaisInvestidor(
  linhas: Agregado[],
  extras: { mrrPorMes: Map<string, number>; perdidosPorMes: Map<string, number>; aportesPorMes: Map<string, number> },
): LinhaMensalInvestidor[] {
  let ebitdaAcumulado = 0;
  let caixaAcumulado = 0;
  return linhas.map((l) => {
    const marketing = l.smMarketing;
    const vendas = l.smVendas;
    const outrosSm = l.smOutros;
    const operacao = l.cogs;
    const impostos = l.impostoMensal;
    const produto = l.opexPd;
    const estrutura = l.opexGa;
    const variaveis = operacao + impostos + marketing + vendas + outrosSm;
    const fixos = produto + estrutura;
    const aportes = extras.aportesPorMes.get(l.mes_referencia) ?? 0;
    ebitdaAcumulado += l.ebitda;
    caixaAcumulado += l.ebitda + aportes;
    return {
      mes: l.mes_referencia,
      clientes: l.clientes,
      novos: l.novosClientes,
      novosAcoes: l.novosAcoes ?? 0,
      perdidos: extras.perdidosPorMes.get(l.mes_referencia) ?? 0,
      mrr: extras.mrrPorMes.get(l.mes_referencia) ?? 0,
      receita: l.receita,
      receitaImplantacao: l.receitaImplementacao ?? 0,
      custoImplantacao: l.cogsImplementacao ?? 0,
      impostos,
      operacao,
      marketing,
      feirasEventos: l.smFeirasEventos ?? 0,
      vendas,
      outrosSm,
      produto,
      estrutura,
      variaveis,
      fixos,
      custosTotais: variaveis + fixos,
      ebitda: l.ebitda,
      irpjCsll: l.irpjCsll ?? 0,
      ebitdaAcumulado,
      aportes,
      caixaAcumulado,
    };
  });
}

const SOMAVEIS = ["novos", "irpjCsll", "novosAcoes", "perdidos", "receita", "receitaImplantacao", "custoImplantacao", "impostos", "operacao", "marketing", "feirasEventos", "vendas", "outrosSm", "produto", "estrutura", "variaveis", "fixos", "custosTotais", "ebitda", "aportes"] as const;

export function resumoAnualInvestidor(mensal: LinhaMensalInvestidor[]): LinhaAnualInvestidor[] {
  const porAno = new Map<string, LinhaMensalInvestidor[]>();
  for (const m of mensal) {
    const ano = m.mes.slice(0, 4);
    (porAno.get(ano) ?? porAno.set(ano, []).get(ano)!).push(m);
  }
  const anos: LinhaAnualInvestidor[] = [];
  for (const [ano, meses] of porAno) {
    const soma = Object.fromEntries(SOMAVEIS.map((k) => [k, meses.reduce((s, m) => s + m[k], 0)])) as Record<(typeof SOMAVEIS)[number], number>;
    const ultimo = meses[meses.length - 1];
    const anterior = anos[anos.length - 1];
    const arrFinal = ultimo.mrr * 12;
    const crescimentoArr = anterior && anterior.arrFinal > 0 ? arrFinal / anterior.arrFinal - 1 : null;
    const margemEbitda = soma.receita > 0 ? soma.ebitda / soma.receita : null;
    // Burn multiple = caixa queimado ÷ ARR novo líquido. Só faz sentido em ano com queima e com ARR crescendo.
    const queima = Math.max(0, -soma.ebitda);
    const arrNovo = arrFinal - (anterior?.arrFinal ?? 0);
    anos.push({
      ano,
      meses: meses.length,
      ...soma,
      clientesFinal: ultimo.clientes,
      mrrFinal: ultimo.mrr,
      arrFinal,
      margemBruta: soma.receita - soma.impostos > 0 ? (soma.receita - soma.operacao - soma.impostos) / (soma.receita - soma.impostos) : null,
      // Software = receita − implantação; seu COGS = operação − custo da implantação. Os impostos
      // sobre a receita são rateados na proporção de cada linha.
      ...(() => {
        const receitaSoftware = soma.receita - soma.receitaImplantacao;
        const impostosSoftware = soma.receita > 0 ? soma.impostos * (receitaSoftware / soma.receita) : 0;
        const liquidaSoftware = receitaSoftware - impostosSoftware;
        const cogsSoftware = soma.operacao - soma.custoImplantacao;
        const impostosImpl = soma.impostos - impostosSoftware;
        const liquidaImpl = soma.receitaImplantacao - impostosImpl;
        return {
          receitaSoftware,
          margemBrutaSoftware: liquidaSoftware > 0 ? (liquidaSoftware - cogsSoftware) / liquidaSoftware : null,
          margemImplantacao: liquidaImpl > 0 ? (liquidaImpl - soma.custoImplantacao) / liquidaImpl : null,
        };
      })(),
      margemEbitda,
      caixaFinal: ultimo.caixaAcumulado,
      crescimentoArr,
      regra40: crescimentoArr != null && margemEbitda != null ? crescimentoArr + margemEbitda : null,
      burnMultiple: queima > 0 && arrNovo > 0 ? queima / arrNovo : null,
    });
  }
  return anos;
}

/** Crescimento médio mensal composto entre dois valores separados por n meses. */
function cmgr(inicial: number, final: number, meses: number): number | null {
  if (inicial <= 0 || final <= 0 || meses <= 0) return null;
  return Math.pow(final / inicial, 1 / meses) - 1;
}

function faixa(valor: number | null, alto: (v: number) => boolean, bom: (v: number) => boolean): LeituraBenchmark {
  if (valor == null || !Number.isFinite(valor)) return null;
  if (alto(valor)) return "alto";
  if (bom(valor)) return "bom";
  return "atencao";
}

export function formatarMesAno(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

export function indicadoresInvestidor(input: {
  mensal: LinhaMensalInvestidor[];
  anual: LinhaAnualInvestidor[];
  metricas: Metricas;
  capitalNovo: number;
  aportesTotal: number;
  retornoEquity?: { moic: number | null; tirPct: number | null } | null;
  /** Retorno projetado da rodada (valor de saída × fatia) — ver simularRetornoInvestidor. */
  retornoSimulado?: {
    moic: number | null;
    roiPct: number | null;
    tirAnualPct: number | null;
    valorEmpresaNaSaida: number;
    valorParticipacao: number;
    equityPct: number;
    multiplo: number;
    base: "arr" | "ebitda";
    anos: number | null;
  } | null;
}): IndicadorInvestidor[] {
  const { mensal, anual, metricas, capitalNovo, aportesTotal } = input;
  if (mensal.length === 0) return [];
  const primeiro = mensal[0];
  const ultimo = mensal[mensal.length - 1];

  const receita = mensal.reduce((s, m) => s + m.receita, 0);
  const somaMrr = mensal.reduce((s, m) => s + m.mrr, 0);
  const clientesMes = mensal.reduce((s, m) => s + m.clientes, 0);
  const novos = mensal.reduce((s, m) => s + m.novos, 0);
  const perdidos = mensal.reduce((s, m) => s + m.perdidos, 0);
  const sm = mensal.reduce((s, m) => s + m.marketing + m.vendas + m.outrosSm, 0);

  // Crescimento: dos 12 primeiros meses com receita recorrente (o que a banca olha na validação) e
  // do período inteiro.
  const idxPrimeiraReceita = mensal.findIndex((m) => m.mrr > 0);
  const base12 = idxPrimeiraReceita >= 0 ? mensal[idxPrimeiraReceita] : null;
  const alvo12 = idxPrimeiraReceita >= 0 ? mensal[Math.min(mensal.length - 1, idxPrimeiraReceita + 12)] : null;
  const cmgr12 = base12 && alvo12 ? cmgr(base12.mrr, alvo12.mrr, mensal.indexOf(alvo12) - idxPrimeiraReceita) : null;
  const cmgrPeriodo = base12 ? cmgr(base12.mrr, ultimo.mrr, mensal.length - 1 - idxPrimeiraReceita) : null;

  const arpa = clientesMes > 0 ? somaMrr / clientesMes : null;
  const margemBrutaPct = metricas.margemBruta != null ? metricas.margemBruta / 100 : null;
  const cac = novos > 0 ? sm / novos : null;
  const ltv = metricas.ltvMedio;
  const ltvCac = ltv != null && cac != null && cac > 0 ? ltv / cac : null;
  const lucroBrutoPorCliente = arpa != null && margemBrutaPct != null ? arpa * margemBrutaPct : null;
  const cacPayback = cac != null && lucroBrutoPorCliente != null && lucroBrutoPorCliente > 0 ? cac / lucroBrutoPorCliente : null;
  // Com a implantação: o que falta do CAC depois da entrada, em meses de lucro bruto. Zero quando a
  // entrada já cobre a aquisição inteira.
  const faltaDepoisDaEntrada = cac != null && metricas.ticketEntrada != null ? Math.max(0, cac - metricas.ticketEntrada) : null;
  const cacPaybackComEntrada =
    faltaDepoisDaEntrada != null && lucroBrutoPorCliente != null && lucroBrutoPorCliente > 0
      ? faltaDepoisDaEntrada === 0
        ? 0
        : faltaDepoisDaEntrada / lucroBrutoPorCliente
      : null;

  // Churn efetivo: clientes que saíram ÷ clientes que havia no começo de cada mês.
  const baseInicioMes = mensal.reduce((s, m) => s + Math.max(0, m.clientes - m.novos + m.perdidos), 0);
  const churnEfetivo = baseInicioMes > 0 ? perdidos / baseInicioMes : null;
  const churnPlanejado = metricas.churnMedio != null ? metricas.churnMedio / 100 : null;

  const piorMes = mensal.reduce((pior, m) => (m.ebitda < pior.ebitda ? m : pior), mensal[0]);
  const vale = mensal.reduce((pior, m) => (m.ebitdaAcumulado < pior.ebitdaAcumulado ? m : pior), mensal[0]);
  const primeiroCaixaNegativo = mensal.find((m) => m.caixaAcumulado < 0) ?? null;

  const queimaTotal = mensal.reduce((s, m) => s + Math.max(0, -m.ebitda), 0);
  const arrNovoLiquido = ultimo.mrr * 12 - primeiro.mrr * 12;
  const burnMultiple = queimaTotal > 0 && arrNovoLiquido > 0 ? queimaTotal / arrNovoLiquido : null;

  const anosCompletos = anual.filter((a) => a.meses === 12 && a.regra40 != null);
  const anoRegra40 = anosCompletos[anosCompletos.length - 1] ?? null;

  const lista: IndicadorInvestidor[] = [
    // Tamanho e crescimento
    { grupo: "Receita e crescimento", nome: "Receita total no período", valor: receita, formato: "brl", calculo: "Soma da receita bruta mensal (mensalidades + implementação, líquida de descontos).", referencia: "—", leitura: null },
    { grupo: "Receita e crescimento", nome: `MRR em ${formatarMesAno(ultimo.mes)}`, valor: ultimo.mrr, formato: "brl", calculo: "Receita recorrente do último mês — não inclui implementação/setup.", referencia: "—", leitura: null },
    { grupo: "Receita e crescimento", nome: `ARR em ${formatarMesAno(ultimo.mes)}`, valor: ultimo.mrr * 12, formato: "brl", calculo: "MRR × 12. É a base de valuation em rodadas de VC.", referencia: "PMF: R$ 500 mil–1,5 mi · Tração: R$ 2–10 mi · Escala: R$ 20 mi+", leitura: null },
    { grupo: "Receita e crescimento", nome: "Clientes ativos (início → fim)", valor: `${Math.round(primeiro.clientes).toLocaleString("pt-BR")} → ${Math.round(ultimo.clientes).toLocaleString("pt-BR")}`, formato: "texto", calculo: "Clientes pagantes no primeiro e no último mês do período.", referencia: "—", leitura: null },
    { grupo: "Receita e crescimento", nome: "Crescimento mensal do MRR — 12 primeiros meses de receita", valor: cmgr12, formato: "pct", calculo: "Crescimento médio composto do MRR entre o 1º mês com receita recorrente e 12 meses depois.", referencia: "Bom 10–15% a.m. · Alto > 20% a.m. · Atenção < 5% a.m.", leitura: faixa(cmgr12, (v) => v > 0.2, (v) => v >= 0.05) },
    { grupo: "Receita e crescimento", nome: "Crescimento mensal do MRR — período todo", valor: cmgrPeriodo, formato: "pct", calculo: "Crescimento médio composto do MRR do 1º mês com receita até o fim do período.", referencia: "Desacelera com a maturidade — compare com o ARR ano a ano (aba Resumo anual).", leitura: null },
    // Eficiência
    {
      grupo: "Margens e unit economics",
      nome: "Margem bruta de software (SaaS puro)",
      valor: metricas.margemBrutaAssinatura != null ? metricas.margemBrutaAssinatura / 100 : null,
      formato: "pct",
      calculo: "Só a receita recorrente (assinaturas), líquida de impostos, menos o COGS sem a implantação (infra, APIs/LLM, suporte/CS, gateway). É a margem que prova a escalabilidade do software — a implantação é serviço profissional e tem margem própria, abaixo.",
      referencia: "SaaS B2B: > 80% é referência de escalabilidade",
      leitura: faixa(metricas.margemBrutaAssinatura != null ? metricas.margemBrutaAssinatura / 100 : null, (v) => v > 0.8, (v) => v >= 0.7),
    },
    { grupo: "Margens e unit economics", nome: "Margem bruta (blended, com implantação)", valor: margemBrutaPct, formato: "pct", calculo: "(Receita líquida − COGS) ÷ Receita líquida, onde receita líquida = receita − impostos sobre a receita (DAS no Simples; ISS/PIS/COFINS/CBS/IBS depois). É a base do benchmark de SaaS. COGS inclui infraestrutura, APIs/LLM, suporte/CS, gateway e implementação.", referencia: "Bom 70–75% · Alto > 80%", leitura: faixa(margemBrutaPct, (v) => v > 0.8, (v) => v >= 0.7) },
    { grupo: "Margens e unit economics", nome: "P&D em % da receita", valor: receita > 0 ? mensal.reduce((s, m) => s + m.produto, 0) / receita : null, formato: "pct", calculo: "Custos de produto e tecnologia (P&D) do período ÷ receita do período.", referencia: "SaaS em crescimento: 15–25% · Atenção < 8% (produto sem time pra evoluir)", leitura: faixa(receita > 0 ? mensal.reduce((s, m) => s + m.produto, 0) / receita : null, (v) => v >= 0.15, (v) => v >= 0.08) },
    { grupo: "Margens e unit economics", nome: "S&M em % da receita", valor: receita > 0 ? sm / receita : null, formato: "pct", calculo: "Marketing + vendas + outros S&M do período ÷ receita do período.", referencia: "Tração: 30–50% · Atenção < 10% (meta de clientes sem verba pra sustentar)", leitura: faixa(receita > 0 ? sm / receita : null, (v) => v >= 0.2 && v <= 0.6, (v) => v >= 0.1) },
    { grupo: "Margens e unit economics", nome: "Margem EBITDA do período", valor: metricas.margemOperacional != null ? metricas.margemOperacional / 100 : null, formato: "pct", calculo: "EBITDA acumulado ÷ receita acumulada.", referencia: "—", leitura: null },
    { grupo: "Margens e unit economics", nome: "Preço médio de venda (PMV)", valor: metricas.precoMedioVenda, formato: "brl", calculo: "Mensalidade de tabela de cada venda nova (planos pelo mix + níveis/módulos pela adesão), ponderada pelas vendas do período. Sem descontos e sem implementação.", referencia: "Compare com o ticket médio (abaixo): a diferença são descontos, beta testers e combos.", leitura: null },
    { grupo: "Margens e unit economics", nome: "Ticket médio mensal por cliente (ARPA)", valor: arpa, formato: "brl", calculo: "MRR ÷ clientes ativos, média do período. Sem implantação: serviço profissional é receita única.", referencia: "Define o perfil do cliente (SMB, mid-market, enterprise).", leitura: null },
    { grupo: "Margens e unit economics", nome: "Ticket de entrada (mês 1)", valor: metricas.ticketEntrada, formato: "brl", calculo: "Implantação que o cliente novo quita no ato (pelo mix de formas de pagamento) + 1ª mensalidade. É o caixa que ele gera no mês em que entra — fora do MRR/ARR, que só medem recorrência.", referencia: "Compare com o CAC: entrada acima do CAC significa aquisição paga na venda.", leitura: null },
    { grupo: "Margens e unit economics", nome: "Implantação contratada por cliente", valor: metricas.implantacaoContratada, formato: "brl", calculo: "Valor cheio da implantação por cliente novo, já com o desconto da forma escolhida (à vista, 3×, 5×…). Receita de serviços profissionais, reconhecida na venda.", referencia: "Fora do MRR e do ARR, por ser cobrança única.", leitura: null },
    { grupo: "Margens e unit economics", nome: "CAC (all-in)", valor: cac, formato: "brl", calculo: "(Marketing + Vendas + Outros S&M — mídia, ferramentas, equipe comercial, comissões, parceiros) ÷ novos clientes do período.", referencia: "Precisa incluir salários, comissões e ferramentas (CAC mascarado é red flag).", leitura: null },
    { grupo: "Margens e unit economics", nome: "LTV", valor: ltv, formato: "brl", calculo: "ARPU × margem bruta ÷ churn mensal, ponderado pelos clientes ativos de cada mês.", referencia: "—", leitura: null },
    { grupo: "Margens e unit economics", nome: "LTV : CAC", valor: ltvCac, formato: "x", calculo: "LTV ÷ CAC.", referencia: "Mínimo 3x · Tração > 3,5x", leitura: faixa(ltvCac, (v) => v > 3.5, (v) => v >= 3) },
    { grupo: "Margens e unit economics", nome: "Payback do CAC com a entrada", valor: cacPaybackComEntrada, formato: cacPaybackComEntrada === 0 ? "texto" : "meses", calculo: "Mesma conta, descontando antes o ticket de entrada (implantação no ato + 1ª mensalidade). Zero = a aquisição se paga já na venda.", referencia: "É o argumento mais forte quando há implantação relevante.", leitura: null },
    { grupo: "Margens e unit economics", nome: "Payback do CAC", valor: cacPayback, formato: "meses", calculo: "CAC ÷ (ARPA × margem bruta) — meses de lucro bruto pra pagar a aquisição de um cliente. Não considera a implantação.", referencia: "Bom 12–18 meses · Alto < 9 meses · Atenção > 24 meses", leitura: faixa(cacPayback, (v) => v < 9, (v) => v <= 24) },
    { grupo: "Margens e unit economics", nome: "Churn mensal planejado", valor: churnPlanejado, formato: "pct", calculo: "Taxa de churn de cada fase, ponderada pelos clientes ativos do mês.", referencia: "Bom 3–5% a.m. (SMB) · Alto < 2% a.m. · Atenção > 7% a.m.", leitura: faixa(churnPlanejado, (v) => v < 0.02, (v) => v <= 0.07) },
    { grupo: "Margens e unit economics", nome: "Churn mensal efetivo (logos)", valor: churnEfetivo, formato: "pct", calculo: "Clientes que saíram ÷ clientes no início de cada mês, no período.", referencia: "Bom 3–5% a.m. (SMB) · Alto < 2% a.m. · Atenção > 7% a.m.", leitura: faixa(churnEfetivo, (v) => v < 0.02, (v) => v <= 0.07) },
    // Caixa
    { grupo: "Caixa e captação", nome: "Break-even (EBITDA acumulado ≥ 0)", valor: metricas.breakEvenMes ? formatarMesAno(metricas.breakEvenMes) : "não atingido no período", formato: "texto", calculo: "Primeiro mês em que o EBITDA acumulado desde o início do período deixa de ser negativo.", referencia: "—", leitura: null },
    { grupo: "Caixa e captação", nome: "Maior queima mensal", valor: piorMes.ebitda < 0 ? -piorMes.ebitda : 0, formato: "brl", calculo: `Pior EBITDA mensal do período (${formatarMesAno(piorMes.mes)}).`, referencia: "—", leitura: null },
    { grupo: "Caixa e captação", nome: "Necessidade máxima de caixa", valor: vale.ebitdaAcumulado < 0 ? -vale.ebitdaAcumulado : 0, formato: "brl", calculo: `Ponto mais baixo do EBITDA acumulado (${formatarMesAno(vale.mes)}) — quanto capital a operação consome até virar.`, referencia: "Compare com o total captado abaixo.", leitura: null },
    { grupo: "Caixa e captação", nome: "Aportes no período (todos os programas)", valor: aportesTotal, formato: "brl", calculo: "Parcelas previstas de fomento + investimento + outros programas vinculados ao cenário.", referencia: "—", leitura: null },
    { grupo: "Caixa e captação", nome: "Runway com os aportes", valor: primeiroCaixaNegativo ? `caixa fica negativo em ${formatarMesAno(primeiroCaixaNegativo.mes)}` : "cobre o período inteiro", formato: "texto", calculo: "Aportes acumulados + EBITDA acumulado, mês a mês (coluna Caixa acumulado na aba Mês a mês).", referencia: "Operar sem novos aportes até o próximo marco.", leitura: primeiroCaixaNegativo ? "atencao" : "bom" },
    { grupo: "Caixa e captação", nome: "Burn multiple do período", valor: burnMultiple, formato: "x", calculo: "Caixa queimado (meses de EBITDA negativo) ÷ ARR novo líquido no período.", referencia: "Tração 1,2–1,8x · Escala < 1,0x · Atenção > 2,5x", leitura: faixa(burnMultiple, (v) => v < 1.2, (v) => v <= 2.5) },
    { grupo: "Caixa e captação", nome: anoRegra40 ? `Regra dos 40 (${anoRegra40.ano})` : "Regra dos 40", valor: anoRegra40?.regra40 ?? null, formato: "pct", calculo: "Crescimento do ARR no ano + margem EBITDA do ano (último ano completo do período).", referencia: "≥ 40% (estágios de tração e escala)", leitura: faixa(anoRegra40?.regra40 ?? null, (v) => v >= 0.4, () => false) },
    // Retorno
    { grupo: "Retorno do investimento novo", nome: "Capital novo considerado", valor: capitalNovo, formato: "brl", calculo: "Investimento ainda não aplicado. Fomento e parcelas já recebidas ficam fora.", referencia: "—", leitura: null },
    { grupo: "Retorno do investimento novo", nome: "Capital recuperado pelo EBITDA", valor: capitalNovo > 0 ? metricas.investimentoRecuperado / capitalNovo : null, formato: "pct", calculo: "EBITDA acumulado do período ÷ capital novo.", referencia: "—", leitura: null },
    { grupo: "Retorno do investimento novo", nome: "Payback do capital (meses)", valor: capitalNovo > 0 ? metricas.paybackMeses : null, formato: "meses", calculo: "Meses entre a entrada do capital e o mês em que o caixa acumulado (EBITDA − IRPJ/CSLL) cobre o aporte.", referencia: "Pré-seed/seed: até 36 meses é comum.", leitura: null },
    { grupo: "Retorno do investimento novo", nome: "Mês de recuperação do capital novo", valor: capitalNovo > 0 ? (metricas.paybackMes ? formatarMesAno(metricas.paybackMes) : "não recuperado no período") : "sem capital novo vinculado", formato: "texto", calculo: "Primeiro mês em que o EBITDA acumulado ≥ capital novo.", referencia: "—", leitura: null },
  ];
  lista.push({
    grupo: "Retorno do investimento novo",
    nome: metricas.tirBase === "capital_novo" ? "TIR do capital novo (a.a.)" : "TIR do projeto (a.a.)",
    valor: metricas.tirAnualPct != null ? metricas.tirAnualPct / 100 : "não se aplica no período",
    formato: metricas.tirAnualPct != null ? "pct" : "texto",
    calculo:
      metricas.tirBase === "capital_novo"
        ? "Taxa que zera o valor presente do fluxo mensal: capital novo sai no mês do aporte e volta como EBITDA. Anualizada. Sem valor de saída (conservadora)."
        : "Taxa que zera o valor presente do fluxo de EBITDA mensal (meses negativos = investimento que a operação consome). Anualizada. Sem valor de saída.",
    referencia: "Compare com a taxa mínima de atratividade do investidor.",
    leitura: null,
  });
  const sim = input.retornoSimulado;
  if (sim) {
    const baseTexto = sim.base === "arr" ? "ARR (MRR × 12)" : "EBITDA dos últimos 12 meses";
    lista.push(
      {
        grupo: "Retorno do investimento novo",
        nome: "Valor da empresa na saída (projetado)",
        valor: sim.valorEmpresaNaSaida,
        formato: "brl",
        calculo: `${sim.multiplo.toLocaleString("pt-BR")}× ${baseTexto} do último mês do período. Múltiplo e base são premissas — ajuste na simulação da rodada, em Relatórios.`,
        referencia: "SaaS B2B: 3–8× ARR conforme crescimento e retenção; 8–15× EBITDA em negócios maduros.",
        leitura: null,
      },
      {
        grupo: "Retorno do investimento novo",
        nome: "Participação do investidor na saída",
        valor: sim.valorParticipacao,
        formato: "brl",
        calculo: `Valor da empresa na saída × ${sim.equityPct.toFixed(1).replace(".", ",")}% (capital ÷ valuation pós-money).`,
        referencia: "Compare com a taxa mínima de atratividade do investidor.",
        leitura: null,
      },
      {
        grupo: "Retorno do investimento novo",
        nome: "MOIC projetado da rodada",
        valor: sim.moic,
        formato: "x",
        calculo: "Participação na saída ÷ capital aportado — quantas vezes o investidor recebe de volta.",
        referencia: "Venture: 3x+ no horizonte da rodada.",
        leitura: null,
      },
      {
        grupo: "Retorno do investimento novo",
        nome: "TIR do investidor (a.a., com saída)",
        valor: sim.tirAnualPct != null ? sim.tirAnualPct / 100 : "informe capital e prazo",
        formato: sim.tirAnualPct != null ? "pct" : "texto",
        calculo: `MOIC elevado a 1 ÷ ${sim.anos != null ? sim.anos.toFixed(1).replace(".", ",") : "?"} anos, menos 1. É o retorno de quem entra na rodada — diferente da TIR do projeto, que credita todo o caixa da empresa ao aporte.`,
        referencia: "Taxa mínima de atratividade de venture: 30–50% a.a.",
        leitura: null,
      },
    );
  }
  if (input.retornoEquity?.moic != null) {
    lista.push({ grupo: "Retorno do investimento novo", nome: "MOIC do investidor (equity)", valor: input.retornoEquity.moic, formato: "x", calculo: "Valor da participação na última reavaliação ÷ valor investido (cadastro de valuation em Fomento).", referencia: "—", leitura: null });
  }
  if (input.retornoEquity?.tirPct != null) {
    lista.push({ grupo: "Retorno do investimento novo", nome: "TIR do investidor (equity)", valor: input.retornoEquity.tirPct / 100, formato: "pct", calculo: "Rentabilidade anualizada entre o aporte e a última reavaliação.", referencia: "—", leitura: null });
  }
  return lista;
}
