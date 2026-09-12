import { custoEmpresaNoMes, faseDoProdutoNoMes, type CustoEmpresaInput } from "@/lib/custos-empresa";
import { horasAtendimentoPorProduto } from "@/lib/cogs";
import type { FaseValue } from "@/lib/fases";
import { type ParametrosModelo } from "@/lib/modelos-contratacao";
import { custoEquipeNoMes, type AlocacaoEquipe, type ModeloEquipe } from "@/lib/equipe-comercial";
import {
  calcularDemandaPorCargo,
  type DemandaProdutoMes,
  type CanalFunilInput,
  type FaseProdutoInput,
  type FunilPremissaInput,
  type SimulacaoMesInput,
  } from "@/lib/necessidade-contratacao";
import {
  calcularImpostoSimples,
  calcularTributosPosSimples,
  LIMITE_SIMPLES_ANUAL,
  parametrosTributariosDe,
} from "@/lib/impostos";
import { subgrupoDeConta } from "@/lib/subgrupo-conta";
import { custoAcaoPorMes, type AcaoMarketing } from "@/lib/acoes-marketing";
import { categoriaDeConta } from "@/lib/categoria-negocio";

export type Agregado = {
  mes_referencia: string;
  receita: number;
  ebitdaProdutos: number;
  clientes: number;
  custosEmpresa: number;
  ebitda: number;
  cogs: number;
  novosClientes: number;
  cacPonderado: number;
  churnPonderado: number;
  ltvPonderado: number;
  custoCLT: number;
  /** Impostos sobre a receita (DAS no Simples; ISS + PIS/COFINS/CBS/IBS líquidos de crédito depois). */
  impostoMensal: number;
  aliquotaEfetivaImposto: number | null;
  /** "simples" enquanto a empresa está no Simples; depois, lucro presumido. */
  regimeTributario: "simples" | "lucro_presumido";
  /** Crédito de CBS/IBS abatido dos impostos do mês (só fora do Simples). */
  creditoTributos: number;
  /** IRPJ + CSLL fora do Simples — abaixo do EBITDA (no Simples eles estão dentro do DAS). */
  irpjCsll: number;
  /** Compras de fornecedor que geram crédito de CBS/IBS: nuvem, LLM, software, gateway, marketing. */
  custosCreditaveis: number;
  /** Receita e custo de implementação — separados pra margem bruta só de assinatura. */
  receitaImplementacao: number;
  cogsImplementacao: number;
  // Quebra fina — produtos (via simulacao_mensal) + custos da empresa/alocações classificados
  // pelo mesmo critério de relatorios/mensal — usada nos drill-downs por indicador.
  smMarketing: number;
  smVendas: number;
  smOutros: number;
  opexPd: number;
  opexGa: number;
  // Filiação a associações: taxa recorrente que fica DENTRO de opexGa (conta 2.3.5.1). É custo de
  // estrutura, não de aquisição — por conceito não entra no CAC. Guardado à parte só pra poder
  // mostrar a linha separada sem alterar nenhum total.
  gaTaxasFiliacao: number;
  /** Feiras e eventos (acoes_marketing): fica DENTRO de smMarketing — guardado à parte só pra exibir. */
  smFeirasEventos: number;
  /** Clientes novos vindos de feiras/eventos (já dentro de novosClientes). */
  novosAcoes: number;
  /** Σ preço médio de venda × novos clientes, por produto — base do PMV ponderado pelas vendas. */
  pmvPonderado: number;
  /** Novos clientes dos produtos que têm preço médio de venda no mês (denominador do PMV). */
  novosComPmv: number;
  /** Fallback do PMV em mês sem venda nova: Σ preço médio × clientes ativos, e esses clientes. */
  pmvPonderadoBase: number;
  clientesComPmv: number;
  // Quebra por ORIGEM, pra tela de custos mostrar coluna a coluna de onde vem cada real:
  // alocações de equipe por cargo (Necessidade de Contratação) e custos da empresa por grupo.
  alocacaoSdr: number;
  alocacaoVendedor: number;
  alocacaoCoordenador: number;
  alocacaoSuporte: number;
  alocacaoOutros: number;
  empresaSm: number;
  empresaPd: number;
  empresaGa: number;
  /** Alocações em CLT/pacote fechado (custo fixo) vs. por demanda (variável). Só as que entram no
   * EBITDA — a alocação de Suporte só dimensiona (o custo vem das regras de COGS 1.1.3). */
  alocacaoFixa: number;
  alocacaoVariavel: number;
  /** Custos da empresa lançados em contas de COGS (1.1.x) — ex: modo Compartilhado do card CSP. */
  empresaCogs: number;
  /** Dentro de empresaSm, só pra exibir: o que foi lançado no card Marketing (2.1.1–2.1.3, 2.1.8,
   * 2.1.9) e o resto (Vendas: CRM, parcerias, comissões). */
  empresaMarketingLancado: number;
  empresaVendasLancado: number;
  /** Dentro de opexGa, só pra exibir: custos de Marca (2.4.x) — fora do S&M e do CAC. */
  empresaMarca: number;
  /** Equipe alocada que entra em S&M (SDR, vendedor, coordenador...). */
  alocacaoSm: number;
  /** A mesma equipe de S&M, atribuída a cada produto pela demanda que cobriu ("" = sem produto). */
  equipePorProduto: Record<string, number>;
  /** Demanda do mês sem ninguém alocado (esforço próprio, sem custo): reuniões de SDR e de vendedor. */
  demandaDescoberta: { sdr: number; vendedor: number };
  /**
   * De onde vem cada real do mês, por linha da DRE: chave "grupo|origem|rótulo|produto" → R$.
   * grupo = cogs | sm | pd | ga; origem = onde se edita (regra_cogs, implementacao, canais,
   * empresa, equipe, feiras, contratacoes, lancado). A soma de um grupo fecha com a linha da DRE.
   */
  composicao: Record<string, number>;
};

export type GrupoDre = "cogs" | "sm" | "pd" | "ga";

function compor(atual: Agregado, grupo: GrupoDre, origem: string, rotulo: string, valor: number, produto = "") {
  if (Math.abs(valor) < 0.005) return;
  const chave = `${grupo}|${origem}|${rotulo}|${produto}`;
  atual.composicao[chave] = (atual.composicao[chave] ?? 0) + valor;
}

export type ResumoCenario = {
  /** Horizonte simulado inteiro — começa no desenvolvimento de cada produto, antes do plano. */
  linhas: Agregado[];
  /** Só os meses do período do cenário (data_inicio → data_fim): é o que se apresenta. */
  linhasPeriodo: Agregado[];
  periodo: { inicio: string | null; fim: string | null };
  /** Capital novo (ainda não aplicado) sobre o qual o retorno é calculado — ver carregarAportes. */
  totalInvestido: number;
  aportes: AportesCenario;
};

/** Normaliza "AAAA-MM" ou "AAAA-MM-DD" para o "AAAA-MM-01" de mes_referencia. */
function mesIso(v: string | null | undefined): string | null {
  return v ? `${v.slice(0, 7)}-01` : null;
}

/** Recorta as linhas mensais a um intervalo de meses (limites inclusivos; nulo = sem limite). */
export function recortarPeriodo(linhas: Agregado[], inicio: string | null | undefined, fim: string | null | undefined): Agregado[] {
  const i = mesIso(inicio);
  const f = mesIso(fim);
  return linhas.filter((l) => (!i || l.mes_referencia >= i) && (!f || l.mes_referencia <= f));
}

export type ParcelaAporte = { mes: string; valor: number; recebida: boolean };

export type ProgramaAporte = {
  id: string;
  nome: string;
  tipo: string;
  status: string | null;
  valorTotal: number;
  valorRecebido: number;
  /** Parte ainda não aplicada — é essa que o retorno precisa devolver. */
  valorNaoAplicado: number;
  entraNoRetorno: boolean;
  tratamento: string;
  parcelas: ParcelaAporte[];
};

export type AportesCenario = {
  programas: ProgramaAporte[];
  /** Entrada de capital por mês (AAAA-MM-01) — todos os programas, inclusive fomento. */
  porMes: Map<string, number>;
  /** Soma do que entra no cálculo de retorno. */
  capitalNovo: number;
  /** Capital novo por mês de entrada (parcelas não recebidas dos programas que entram no retorno). */
  capitalNovoPorMes: Map<string, number>;
};

/**
 * Captação vinculada ao cenário, com uma regra só pra todas as telas e exportações:
 *  - TODOS os programas entram na linha de aportes (fomento, investimento, mútuo, empréstimo), nas
 *    datas das parcelas — ou, sem parcela cadastrada, inteiro na data do aporte/assinatura prevista.
 *    Um fomento em negociação aparece "como se estivesse aplicado", como se apresenta pro investidor.
 *  - O retorno é calculado só sobre o investimento NOVO, o que ainda não está aplicado: fomento fica
 *    fora (subvenção não se devolve), programa encerrado fica fora e parcela já recebida é descontada.
 */
export async function carregarAportes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cenarioId: string,
): Promise<AportesCenario> {
  const vazio: AportesCenario = { programas: [], porMes: new Map(), capitalNovo: 0, capitalNovoPorMes: new Map() };
  if (!cenarioId) return vazio;
  const { data: vinculos } = await supabase.from("cenario_programas").select("programa_id").eq("cenario_id", cenarioId);
  const ids = ((vinculos ?? []) as { programa_id: string }[]).map((v) => v.programa_id);
  if (ids.length === 0) return vazio;

  const [{ data: programasRaw }, { data: parcelasRaw }] = await Promise.all([
    supabase
      .from("programas_investimento")
      .select("id, nome, tipo, status, valor_total, valor_proposto, data_aporte, data_assinatura_prevista, created_at")
      .in("id", ids)
      .order("created_at"),
    supabase.from("parcelas_investimento").select("programa_id, valor, data_prevista, status").in("programa_id", ids),
  ]);

  const porMes = new Map<string, number>();
  const programas: ProgramaAporte[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (programasRaw ?? []) as any[]) {
    const valorTotal = Number(p.valor_total ?? p.valor_proposto ?? 0);
    const parcelasDoPrograma = ((parcelasRaw ?? []) as { programa_id: string; valor: number; data_prevista: string | null; status: string | null }[])
      .filter((x) => x.programa_id === p.id);
    let parcelas: ParcelaAporte[] = parcelasDoPrograma
      .filter((x) => x.data_prevista)
      .map((x) => ({ mes: `${x.data_prevista!.slice(0, 7)}-01`, valor: Number(x.valor), recebida: x.status === "recebida" }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
    if (parcelas.length === 0) {
      const data = p.data_aporte ?? p.data_assinatura_prevista;
      if (data && valorTotal > 0) parcelas = [{ mes: `${String(data).slice(0, 7)}-01`, valor: valorTotal, recebida: false }];
    }
    for (const parc of parcelas) porMes.set(parc.mes, (porMes.get(parc.mes) ?? 0) + parc.valor);

    const valorRecebido = parcelasDoPrograma.filter((x) => x.status === "recebida").reduce((s, x) => s + Number(x.valor), 0);
    let entraNoRetorno = false;
    let valorNaoAplicado = 0;
    let tratamento: string;
    if (p.tipo === "fomento") {
      tratamento = "Fomento (não reembolsável) — entra nos aportes como aplicado; fora do cálculo de retorno";
    } else if (p.status === "encerrado") {
      tratamento = "Programa encerrado — já aplicado; fora do cálculo de retorno";
    } else {
      valorNaoAplicado = Math.max(0, valorTotal - valorRecebido);
      entraNoRetorno = valorNaoAplicado > 0;
      tratamento = entraNoRetorno
        ? valorRecebido > 0
          ? `Investimento novo — retorno calculado sobre o que falta aplicar (já recebido fica fora)`
          : "Investimento novo — base do cálculo de retorno"
        : "Totalmente recebido — já aplicado; fora do cálculo de retorno";
    }
    programas.push({ id: p.id, nome: p.nome, tipo: p.tipo, status: p.status ?? null, valorTotal, valorRecebido, valorNaoAplicado, entraNoRetorno, tratamento, parcelas });
  }

  const capitalNovoPorMes = new Map<string, number>();
  for (const p of programas) {
    if (!p.entraNoRetorno) continue;
    const aReceber = p.parcelas.filter((x) => !x.recebida);
    // Sem parcela datada, o que falta aplicar entra no 1º mês do período (tratado em computeMetricas).
    for (const parc of aReceber) capitalNovoPorMes.set(parc.mes, (capitalNovoPorMes.get(parc.mes) ?? 0) + parc.valor);
  }

  return {
    programas,
    porMes,
    capitalNovo: programas.reduce((s, p) => s + (p.entraNoRetorno ? p.valorNaoAplicado : 0), 0),
    capitalNovoPorMes,
  };
}

export type Metricas = {
  receitaAcumulada: number;
  ebitdaAcumulado: number;
  custosAcumulados: number;
  margemOperacional: number | null;
  margemBruta: number | null;
  margemBrutaValor: number;
  /** Receita − impostos sobre a receita: é sobre ela que a margem bruta é calculada (padrão SaaS). */
  receitaLiquidaAcumulada: number;
  /** Margem bruta só de assinatura — sem receita e custo de implementação. */
  margemBrutaAssinatura: number | null;
  /** IRPJ/CSLL fora do Simples (abaixo do EBITDA) e o resultado depois deles. */
  irpjCsllAcumulado: number;
  resultadoAposIrAcumulado: number;
  impostosAcumulados: number;
  cogsAcumulado: number;
  smAcumulado: number;
  pdAcumulado: number;
  gaAcumulado: number;
  churnMedio: number | null;
  ltvMedio: number | null;
  clientesInicio: number;
  clientesFinal: number;
  cacMedio: number | null;
  breakEvenMes: string | null;
  breakEvenClientes: number | null;
  paybackMes: string | null;
  /** Meses entre a entrada do capital e o payback — é assim que o investidor lê ("paga em 26 meses"). */
  paybackMeses: number | null;
  /** Mês em que o capital novo entra (1ª parcela) — base do payback em meses. */
  mesCapital: string | null;
  investimentoRecuperado: number;
  roiPct: number | null;
  /** Preço médio de venda (mensalidade de tabela) ponderado pelas vendas do período. */
  precoMedioVenda: number | null;
  /** Ticket médio: receita ÷ clientes ativos, média do período (inclui implementação e descontos). */
  ticketMedio: number | null;
  /** TIR anualizada (%) — ver tirDoPeriodo. */
  tirAnualPct: number | null;
  /** "capital_novo" quando há investimento novo no fluxo; "projeto" quando é só o fluxo de EBITDA. */
  tirBase: "capital_novo" | "projeto";
};

/**
 * TIR mensal de um fluxo de caixa (índice 0 = primeiro mês). Procura a taxa que zera o valor
 * presente varrendo de −95% a +500% ao mês e refinando por bisseção na primeira troca de sinal.
 * Sem saída e entrada de caixa no fluxo (só positivos ou só negativos), não existe TIR → null.
 */
export function tirMensal(fluxos: number[]): number | null {
  if (!fluxos.some((f) => f < 0) || !fluxos.some((f) => f > 0)) return null;
  const vpl = (r: number) => fluxos.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
  const grade: number[] = [];
  for (let r = -0.95; r < 5; r += r < 0.2 ? 0.005 : 0.05) grade.push(r);
  for (let i = 1; i < grade.length; i++) {
    let a = grade[i - 1];
    let b = grade[i];
    let va = vpl(a);
    const vb = vpl(b);
    if (!Number.isFinite(va) || !Number.isFinite(vb) || va === 0) {
      if (va === 0) return a;
      continue;
    }
    if (va * vb > 0) continue;
    for (let k = 0; k < 80; k++) {
      const m = (a + b) / 2;
      const vm = vpl(m);
      if (va * vm <= 0) b = m;
      else {
        a = m;
        va = vm;
      }
    }
    return (a + b) / 2;
  }
  return null;
}

/**
 * Fluxo da TIR no período, mês a mês. Mesma base do "Capital coberto por caixa próprio": com capital
 * novo vinculado, ele sai (negativo) no mês em que entra na empresa e volta como EBITDA; sem capital
 * novo, é a TIR do projeto — os meses de EBITDA negativo são o investimento que a operação consome.
 * Não inclui valor de saída/perpetuidade (é uma leitura conservadora).
 */
export function fluxoTir(linhas: Agregado[], capitalNovoPorMes?: Map<string, number>): number[] {
  const temCapital = capitalNovoPorMes && [...capitalNovoPorMes.values()].some((v) => v > 0);
  const primeiro = linhas[0]?.mes_referencia ?? "";
  return linhas.map((l, i) => {
    let aporte = 0;
    if (temCapital) {
      for (const [mes, v] of capitalNovoPorMes!) {
        // Capital que entrou antes do período conta no 1º mês dele.
        if (mes === l.mes_referencia || (i === 0 && mes < primeiro)) aporte += v;
      }
    }
    return l.ebitda - l.irpjCsll - aporte;
  });
}

/** Todas as métricas calculadas só a partir das linhas já filtradas pro período selecionado —
 * break-even e payback recomeçam do zero no início do período, não carregam saldo de fora dele. */
export function computeMetricas(linhas: Agregado[], totalInvestido: number, capitalNovoPorMes?: Map<string, number>): Metricas {
  // DRE em cascata, igual ao modelo de referência: Receita (–) COGS (–) Impostos (=) Margem Bruta
  // (–) S&M (–) P&D (–) G&A (=) EBITDA. Os impostos entram no EBITDA agora — antes ficavam de fora,
  // só afetando a margem bruta, mas o modelo de referência deixa claro que eles pesam no resultado.
  const receitaAcumulada = linhas.reduce((s, l) => s + l.receita, 0);
  const cogsAcumulado = linhas.reduce((s, l) => s + l.cogs, 0);
  const impostosAcumulados = linhas.reduce((s, l) => s + l.impostoMensal, 0);
  // Margem bruta no padrão SaaS: lucro bruto ÷ RECEITA LÍQUIDA (receita − impostos sobre a receita).
  // Dividir pela receita bruta misturava imposto com eficiência de entrega e deixava a margem ~20
  // pontos abaixo do benchmark de 70–85% com que o investidor compara.
  const receitaLiquidaAcumulada = receitaAcumulada - impostosAcumulados;
  const margemBrutaValor = receitaAcumulada - cogsAcumulado - impostosAcumulados;
  const margemBruta = receitaLiquidaAcumulada > 0 ? (margemBrutaValor / receitaLiquidaAcumulada) * 100 : null;
  const receitaImpl = linhas.reduce((s, l) => s + l.receitaImplementacao, 0);
  const cogsImpl = linhas.reduce((s, l) => s + l.cogsImplementacao, 0);
  const receitaAssinatura = receitaAcumulada - receitaImpl;
  const impostosAssinatura = receitaAcumulada > 0 ? impostosAcumulados * (receitaAssinatura / receitaAcumulada) : 0;
  const liquidaAssinatura = receitaAssinatura - impostosAssinatura;
  const margemBrutaAssinatura =
    liquidaAssinatura > 0 ? ((liquidaAssinatura - (cogsAcumulado - cogsImpl)) / liquidaAssinatura) * 100 : null;
  const irpjCsllAcumulado = linhas.reduce((s, l) => s + l.irpjCsll, 0);
  const smAcumulado = linhas.reduce((s, l) => s + l.smMarketing + l.smVendas + l.smOutros, 0);
  const pdAcumulado = linhas.reduce((s, l) => s + l.opexPd, 0);
  const gaAcumulado = linhas.reduce((s, l) => s + l.opexGa, 0);
  const ebitdaAcumulado = margemBrutaValor - smAcumulado - pdAcumulado - gaAcumulado;
  const custosAcumulados = receitaAcumulada - ebitdaAcumulado;
  const margemOperacional = receitaAcumulada > 0 ? (ebitdaAcumulado / receitaAcumulada) * 100 : null;
  const clientesInicio = linhas[0]?.clientes ?? 0;
  const clientesFinal = linhas[linhas.length - 1]?.clientes ?? 0;

  let somaNovosClientes = 0;
  let somaChurnPonderado = 0;
  let somaLtvPonderado = 0;
  let somaClientesPeso = 0;
  let acumulado = 0;
  let breakEvenMes: string | null = null;
  let breakEvenClientes: number | null = null;
  let acumuladoPayback = 0;
  let paybackMes: string | null = null;
  // O capital entra no mês da 1ª parcela; sem data, no 1º mês do período.
  const mesesComCapital = capitalNovoPorMes ? [...capitalNovoPorMes.entries()].filter(([, v]) => v > 0).map(([m]) => m).sort() : [];
  const mesCapital = mesesComCapital[0] ?? (totalInvestido > 0 ? (linhas[0]?.mes_referencia ?? null) : null);

  for (const [i, l] of linhas.entries()) {
    acumulado += l.ebitda;
    if (breakEvenMes === null && acumulado >= 0 && i > 0) {
      breakEvenMes = l.mes_referencia;
      breakEvenClientes = l.clientes;
    }
    if (totalInvestido > 0) {
      // Caixa que devolve o capital: EBITDA menos IRPJ/CSLL (fora do Simples eles saem abaixo do EBITDA).
      acumuladoPayback += l.ebitda - l.irpjCsll;
      if (paybackMes === null && acumuladoPayback >= totalInvestido) paybackMes = l.mes_referencia;
    }
    somaNovosClientes += l.novosClientes;
    somaChurnPonderado += l.churnPonderado;
    somaLtvPonderado += l.ltvPonderado;
    somaClientesPeso += l.clientes;
  }

  return {
    receitaAcumulada,
    ebitdaAcumulado,
    custosAcumulados,
    margemOperacional,
    margemBruta,
    margemBrutaValor,
    receitaLiquidaAcumulada,
    margemBrutaAssinatura,
    irpjCsllAcumulado,
    resultadoAposIrAcumulado: ebitdaAcumulado - irpjCsllAcumulado,
    impostosAcumulados,
    cogsAcumulado,
    smAcumulado,
    pdAcumulado,
    gaAcumulado,
    churnMedio: somaClientesPeso > 0 ? (somaChurnPonderado / somaClientesPeso) * 100 : null,
    ltvMedio: somaClientesPeso > 0 ? somaLtvPonderado / somaClientesPeso : null,
    clientesInicio,
    clientesFinal,
    // CAC fully-loaded: todo o S&M do período (marketing + vendas + outros — mídia, ferramentas,
    // folha comercial própria e compartilhada, comissões, terceirizados) ÷ novos clientes do
    // período. Antes usava uma média ponderada só do CAC por produto, que não enxergava custo de
    // equipe comercial compartilhada (SDR/Coordenador via Modelos de Contratação).
    cacMedio: somaNovosClientes > 0 ? smAcumulado / somaNovosClientes : null,
    breakEvenMes,
    breakEvenClientes,
    paybackMes,
    paybackMeses:
      paybackMes && mesCapital
        ? Math.max(
            0,
            (Number(paybackMes.slice(0, 4)) - Number(mesCapital.slice(0, 4))) * 12 +
              (Number(paybackMes.slice(5, 7)) - Number(mesCapital.slice(5, 7))),
          )
        : null,
    mesCapital,
    investimentoRecuperado: acumuladoPayback,
    roiPct: totalInvestido > 0 ? (acumuladoPayback / totalInvestido) * 100 : null,
    ...precoETir(linhas, totalInvestido, capitalNovoPorMes),
  };
}

function precoETir(linhas: Agregado[], totalInvestido: number, capitalNovoPorMes?: Map<string, number>) {
  const novosComPmv = linhas.reduce((s, l) => s + (l.novosComPmv ?? 0), 0);
  const pmvPonderado = linhas.reduce((s, l) => s + (l.pmvPonderado ?? 0), 0);
  const clientesComPmv = linhas.reduce((s, l) => s + (l.clientesComPmv ?? 0), 0);
  const pmvBase = linhas.reduce((s, l) => s + (l.pmvPonderadoBase ?? 0), 0);
  const receita = linhas.reduce((s, l) => s + l.receita, 0);
  const clientesMes = linhas.reduce((s, l) => s + l.clientes, 0);
  // Capital novo sem data (programa sem parcela nem data prevista) entra no 1º mês do período.
  const capital =
    capitalNovoPorMes && capitalNovoPorMes.size > 0
      ? capitalNovoPorMes
      : totalInvestido > 0 && linhas[0]
        ? new Map([[linhas[0].mes_referencia, totalInvestido]])
        : undefined;
  const tir = tirMensal(fluxoTir(linhas, capital));
  return {
    precoMedioVenda: novosComPmv > 0 ? pmvPonderado / novosComPmv : clientesComPmv > 0 ? pmvBase / clientesComPmv : null,
    ticketMedio: clientesMes > 0 ? receita / clientesMes : null,
    tirAnualPct: tir != null ? (Math.pow(1 + tir, 12) - 1) * 100 : null,
    tirBase: (capital ? "capital_novo" : "projeto") as "capital_novo" | "projeto",
  };
}

export function ativaNoMes(mesIso: string, dataInicio: string | null, dataFim: string | null): boolean {
  const mes = new Date(mesIso + "T00:00:00");
  const inicio = dataInicio ? new Date(dataInicio + "T00:00:00") : null;
  const fim = dataFim ? new Date(dataFim + "T00:00:00") : null;
  const iniciouAntes = !inicio || new Date(inicio.getFullYear(), inicio.getMonth(), 1) <= mes;
  const aindaAtiva = !fim || fim >= mes;
  return iniciouAntes && aindaAtiva;
}

export async function agregarPorCenario(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cenarioId: string,
): Promise<ResumoCenario> {
  if (!cenarioId) {
    return {
      linhas: [],
      linhasPeriodo: [],
      periodo: { inicio: null, fim: null },
      totalInvestido: 0,
      aportes: { programas: [], porMes: new Map(), capitalNovo: 0, capitalNovoPorMes: new Map() },
    };
  }

  const [
    { data: simRows },
    { data: cenarioRow },
    { data: custosEmpresaRaw },
    { data: alocacoesRaw },
    { data: modelosRaw },
    { data: fasesRaw },
  ] = await Promise.all([
    supabase
      .from("simulacao_mensal")
      .select(
        "produto_id, mes_referencia, receita_bruta, receita_implementacao, ebitda, cogs, clientes_ativos, cac_all_in, novos_clientes, churn_pct, ltv, sm_marketing, sm_vendas, sm_outros, opex_pd, opex_ga, novos_direto, novos_representante, novos_associacao, preco_medio_venda, novos_acoes, cogs_infraestrutura, cogs_llm, cogs_suporte_reativo, cogs_cs_proativo, cogs_suporte, cogs_software, cogs_gateway, cogs_outros",
      )
      .eq("cenario_id", cenarioId)
      .order("mes_referencia"),
    supabase.from("cenarios").select("data_inicio, data_fim").eq("id", cenarioId).maybeSingle(),
    supabase.from("custos_empresa").select("*, plano_contas:plano_contas_id(codigo, tipo)").eq("cenario_id", cenarioId),
    supabase.from("alocacao_modelo_contratacao").select("*").eq("cenario_id", cenarioId),
    supabase.from("modelos_contratacao").select("*"),
    supabase.from("fases_produto").select("id, produto_id, fase, data_inicio, data_fim").eq("cenario_id", cenarioId),
  ]);

  const { data: acoesRaw } = await supabase.from("acoes_marketing").select("*").eq("cenario_id", cenarioId);
  // Custo de feiras e eventos por mês — entra na linha de Marketing (S&M) do cenário.
  const custoAcoesPorMes = new Map<string, number>();
  for (const a of (acoesRaw ?? []) as AcaoMarketing[]) {
    // Campanha sem data fim roda até o fim do cenário.
    const fimCenario = (cenarioRow as { data_fim?: string | null } | null)?.data_fim ?? null;
    for (const [mes, v] of custoAcaoPorMes(a, fimCenario)) custoAcoesPorMes.set(mes, (custoAcoesPorMes.get(mes) ?? 0) + v);
  }

  // Nome de cada produto e o custo da implementação por cliente novo (soma das etapas) — pra
  // separar, no detalhamento do COGS, a implementação dos outros custos lançados.
  const [{ data: produtosRaw }, { data: etapasRaw }] = await Promise.all([
    supabase.from("produtos").select("id, nome, tem_implementacao, preco_implementacao"),
    supabase.from("implementacao_etapas").select("produto_id, horas, valor_hora").eq("cenario_id", cenarioId),
  ]);
  const nomeProduto = new Map<string, string>(
    ((produtosRaw ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome]),
  );
  const custoImplPorCliente = new Map<string, number>();
  for (const p of (produtosRaw ?? []) as { id: string; tem_implementacao: boolean | null; preco_implementacao: number | null }[]) {
    if (!p.tem_implementacao || p.preco_implementacao == null) continue;
    const total = ((etapasRaw ?? []) as { produto_id: string; horas: number; valor_hora: number }[])
      .filter((e) => e.produto_id === p.id)
      .reduce((s, e) => s + Number(e.horas) * Number(e.valor_hora), 0);
    custoImplPorCliente.set(p.id, total);
  }

  const fasesPorProduto = new Map<string, { fase: FaseValue; data_inicio: string | null; data_fim: string | null }[]>();
  for (const f of (fasesRaw ?? []) as { produto_id: string; fase: FaseValue; data_inicio: string | null; data_fim: string | null }[]) {
    const atual = fasesPorProduto.get(f.produto_id) ?? [];
    atual.push(f);
    fasesPorProduto.set(f.produto_id, atual);
  }

  // Demanda real de SDR/Coordenador/Suporte por mês, pra alimentar o custo de modelos de
  // contratação variáveis (agência créditos/híbrido) com a demanda de verdade, não uma
  // quantidade fixa — modelos discretos (CLT/PJ/pacote fechado) continuam usando a quantidade
  // alocada, já que ali a decisão é "quantas unidades eu contratei", não "quanto eu precisei".
  const faseIds = (fasesRaw ?? []).map((f: { id: string }) => f.id);
  const { data: funisRaw } =
    faseIds.length > 0
      ? await supabase
          .from("premissas_funil")
          .select("fase_produto_id, capacidade_vendedor_mes, span_of_control, horas_suporte_por_cliente_mes, reunioes_por_oportunidade")
          .in("fase_produto_id", faseIds)
      : { data: [] };

  // Matriz produto × canal: a taxa de fechamento vive aqui, e a de qualificação vem do modelo de
  // contratação que executa o canal direto.
  const { data: canaisRaw } = await supabase
    .from("canais_aquisicao")
    .select("id, tipo_canal, modelo_contratacao_id, parametros, canal_produto(produto_id, percentual_mix, taxa_fechamento)")
    .eq("cenario_id", cenarioId);
  const faseById = new Map<string, { id: string; produto_id: string; fase: FaseValue }>(
    (fasesRaw ?? []).map((f: { id: string; produto_id: string; fase: FaseValue }) => [f.id, f]),
  );
  const fasesPorProdutoInput: FaseProdutoInput[] = (fasesRaw ?? []).map(
    (f: { produto_id: string; fase: FaseValue; data_inicio: string | null; data_fim: string | null }) => ({
      produtoId: f.produto_id,
      fase: f.fase,
      data_inicio: f.data_inicio,
      data_fim: f.data_fim,
    }),
  );
  const funisInput: FunilPremissaInput[] = (
    (funisRaw ?? []) as {
      fase_produto_id: string;
      capacidade_vendedor_mes: number | null;
      span_of_control: number | null;
      reunioes_por_oportunidade: number | null;
      horas_suporte_por_cliente_mes: number | null;
    }[]
  )
    .map((f) => {
      const fase = faseById.get(f.fase_produto_id);
      if (!fase) return null;
      return {
        produtoId: fase.produto_id,
        fase: fase.fase,
        capacidade_vendedor_mes: f.capacidade_vendedor_mes,
        span_of_control: f.span_of_control,
        reunioes_por_oportunidade: f.reunioes_por_oportunidade,
        horas_suporte_por_cliente_mes: f.horas_suporte_por_cliente_mes,
      };
    })
    .filter((f): f is FunilPremissaInput => f !== null);
  const simulacaoInput: SimulacaoMesInput[] = ((simRows ?? []) as { produto_id: string; mes_referencia: string; novos_clientes: number; clientes_ativos: number; novos_direto?: number | null; novos_representante?: number | null; novos_associacao?: number | null }[]).map((s) => ({
    produtoId: s.produto_id,
    mes_referencia: s.mes_referencia,
    novos_clientes: Number(s.novos_clientes),
    clientes_ativos: Number(s.clientes_ativos),
    novos_direto: s.novos_direto != null ? Number(s.novos_direto) : undefined,
    novos_representante: s.novos_representante != null ? Number(s.novos_representante) : undefined,
    novos_associacao: s.novos_associacao != null ? Number(s.novos_associacao) : undefined,
  }));
  const qualificacaoPorModelo = new Map(
    ((modelosRaw ?? []) as { id: string; parametros: ParametrosModelo }[]).map((m) => [
      m.id,
      m.parametros?.taxa_qualificacao ?? null,
    ]),
  );
  // O canal é do cenário e carrega uma linha por produto — cada linha vira uma célula da matriz.
  const canaisInput: CanalFunilInput[] = (
    (canaisRaw ?? []) as {
      id: string;
      tipo_canal: "direto" | "representante" | "associacao";
      modelo_contratacao_id: string | null;
      canal_produto: { produto_id: string; percentual_mix: number; taxa_fechamento: number | null }[] | null;
    }[]
  ).flatMap((c) =>
    (c.canal_produto ?? []).map((cp) => ({
      produtoId: cp.produto_id,
      tipo_canal: c.tipo_canal,
      percentual_mix: Number(cp.percentual_mix),
      taxa_fechamento: cp.taxa_fechamento,
      taxa_qualificacao: c.modelo_contratacao_id ? (qualificacaoPorModelo.get(c.modelo_contratacao_id) ?? null) : null,
    })),
  );

  const { data: cogsRaw } = await supabase.from("cogs_premissas").select("produto_id, parametros").eq("cenario_id", cenarioId);
  const demandaPorCargo = calcularDemandaPorCargo({
    fasesPorProduto: fasesPorProdutoInput,
    funis: funisInput,
    canais: canaisInput,
    simulacao: simulacaoInput,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    horasSuportePorProduto: horasAtendimentoPorProduto((cogsRaw ?? []) as any),
  });

  // Canais de parceiro que cobram mensalidade por parceiro mantido.
  const canaisComCusto = (
    (canaisRaw ?? []) as { id: string; tipo_canal: string; parametros: { custo_mensal_parceiro?: number } | null }[]
  )
    .filter((c) => c.tipo_canal !== "direto" && Number(c.parametros?.custo_mensal_parceiro ?? 0) > 0)
    .map((c) => ({ id: c.id, custoMensalPorParceiro: Number(c.parametros!.custo_mensal_parceiro) }));

  const { data: parceirosFaseRaw } =
    canaisComCusto.length > 0
      ? await supabase
          .from("canal_parceiros_fase")
          .select("canal_id, fase, quantidade_parceiros")
          .in(
            "canal_id",
            canaisComCusto.map((c) => c.id),
          )
      : { data: [] };

  // O parceiro entra quando a fase começa e continua custando dali em diante. Como o canal é da
  // empresa e as fases são de produto, usamos a data mais cedo em que qualquer produto entrou
  // naquela fase — é quando a empresa como um todo chegou lá.
  const inicioMaisCedoPorFase = new Map<string, string>();
  for (const f of (fasesRaw ?? []) as { fase: FaseValue; data_inicio: string | null }[]) {
    if (!f.data_inicio) continue;
    const atual = inicioMaisCedoPorFase.get(f.fase);
    if (!atual || f.data_inicio < atual) inicioMaisCedoPorFase.set(f.fase, f.data_inicio);
  }

  function parceirosAtivosNoMes(canalId: string, mesIso: string): number {
    return (
      (parceirosFaseRaw ?? []) as { canal_id: string; fase: string; quantidade_parceiros: number }[]
    ).reduce((acc, pf) => {
      if (pf.canal_id !== canalId) return acc;
      const inicio = inicioMaisCedoPorFase.get(pf.fase);
      if (!inicio || inicio.slice(0, 7) > mesIso.slice(0, 7)) return acc;
      return acc + Number(pf.quantidade_parceiros);
    }, 0);
  }
  // Receita média por cliente de cada produto no mês — base da comissão % do vendedor.
  const arpuPorMes = new Map<string, Record<string, number>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (simRows ?? []) as any[]) {
    const clientes = Number(row.clientes_ativos ?? 0);
    if (clientes <= 0) continue;
    const m = arpuPorMes.get(row.mes_referencia) ?? {};
    m[row.produto_id] = Number(row.receita_bruta ?? 0) / clientes;
    arpuPorMes.set(row.mes_referencia, m);
  }

  const porMes = new Map<string, Agregado>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (simRows ?? []) as any[]) {
    const atual =
      porMes.get(row.mes_referencia) ??
      ({
        mes_referencia: row.mes_referencia,
        receita: 0,
        ebitdaProdutos: 0,
        clientes: 0,
        custosEmpresa: 0,
        ebitda: 0,
        cogs: 0,
        novosClientes: 0,
        cacPonderado: 0,
        churnPonderado: 0,
        ltvPonderado: 0,
        custoCLT: 0,
        impostoMensal: 0,
        aliquotaEfetivaImposto: null,
        regimeTributario: "simples",
        creditoTributos: 0,
        irpjCsll: 0,
        custosCreditaveis: 0,
        receitaImplementacao: 0,
        cogsImplementacao: 0,
        smMarketing: 0,
        smVendas: 0,
        smOutros: 0,
        opexPd: 0,
        opexGa: 0,
        gaTaxasFiliacao: 0,
        smFeirasEventos: 0,
        novosAcoes: 0,
        pmvPonderado: 0,
        novosComPmv: 0,
        pmvPonderadoBase: 0,
        clientesComPmv: 0,
        alocacaoSdr: 0,
        alocacaoVendedor: 0,
        alocacaoCoordenador: 0,
        alocacaoSuporte: 0,
        alocacaoOutros: 0,
        empresaSm: 0,
        empresaPd: 0,
        empresaGa: 0,
        alocacaoFixa: 0,
        alocacaoVariavel: 0,
        empresaCogs: 0,
        empresaMarketingLancado: 0,
        empresaVendasLancado: 0,
        empresaMarca: 0,
        alocacaoSm: 0,
        equipePorProduto: {},
        demandaDescoberta: { sdr: 0, vendedor: 0 },
        composicao: {},
      } satisfies Agregado);
    atual.receita += Number(row.receita_bruta);
    atual.ebitdaProdutos += Number(row.ebitda);
    atual.clientes += Number(row.clientes_ativos);
    atual.cogs += Number(row.cogs ?? 0);
    atual.smMarketing += Number(row.sm_marketing ?? 0);
    atual.smVendas += Number(row.sm_vendas ?? 0);
    atual.smOutros += Number(row.sm_outros ?? 0);
    atual.opexPd += Number(row.opex_pd ?? 0);
    atual.opexGa += Number(row.opex_ga ?? 0);
    porMes.set(row.mes_referencia, atual);

    // Composição do que veio do produto — as mesmas colunas que o motor gravou, separadas por regra.
    const produto = nomeProduto.get(row.produto_id) ?? "Produto";
    const n = (k: string) => Number(row[k] ?? 0);
    const implementacao = n("novos_clientes") * (custoImplPorCliente.get(row.produto_id) ?? 0);
    atual.receitaImplementacao += n("receita_implementacao");
    atual.cogsImplementacao += implementacao;
    atual.custosCreditaveis += n("cogs_infraestrutura") + n("cogs_llm") + n("cogs_software") + n("cogs_gateway") + n("sm_marketing");
    compor(atual, "cogs", "regra_cogs", "Infraestrutura e cloud (1.1.1)", n("cogs_infraestrutura"), produto);
    compor(atual, "cogs", "regra_cogs", "APIs / LLM (1.1.2)", n("cogs_llm"), produto);
    compor(atual, "cogs", "regra_cogs", "Suporte reativo — horas × custo/hora (1.1.3)", n("cogs_suporte_reativo"), produto);
    compor(atual, "cogs", "regra_cogs", "CS proativo — horas × custo/hora (1.1.3)", n("cogs_cs_proativo"), produto);
    compor(atual, "cogs", "lancado", "Suporte lançado no plano da fase (1.1.3)", n("cogs_suporte") - n("cogs_suporte_reativo") - n("cogs_cs_proativo"), produto);
    compor(atual, "cogs", "regra_cogs", "Software de atendimento (1.1.4)", n("cogs_software"), produto);
    compor(atual, "cogs", "regra_cogs", "Gateway de pagamento (1.1.5)", n("cogs_gateway"), produto);
    compor(atual, "cogs", "implementacao", "Implementação — etapas × clientes novos (1.1.6)", implementacao, produto);
    compor(atual, "cogs", "lancado", "Outros COGS lançados no plano da fase", n("cogs_outros") - n("cogs_llm") - n("cogs_software") - n("cogs_gateway") - implementacao, produto);
    compor(atual, "sm", "canais", "Mídia do self-service e marketing do produto", n("sm_marketing"), produto);
    compor(atual, "sm", "canais", "Parceiros: fechamento, comissão e crédito (e equipe do produto)", n("sm_vendas"), produto);
    compor(atual, "sm", "lancado", "Outros S&M do produto", n("sm_outros"), produto);
    compor(atual, "pd", "contratacoes", "Equipe e custos de P&D do produto", n("opex_pd"), produto);
    compor(atual, "ga", "contratacoes", "Equipe e custos de G&A do produto", n("opex_ga"), produto);

    const novos = Number(row.novos_clientes ?? 0);
    atual.novosClientes += novos;
    // cacPonderado fica só como referência histórica (CAC por produto, sem custo compartilhado) —
    // o CAC consolidado de verdade usa smMarketing+smVendas+smOutros ÷ novosClientes, calculado em
    // computeMetricas, porque só assim entra o custo de equipe comercial compartilhada (SDR etc.).
    if (row.cac_all_in != null && novos > 0) atual.cacPonderado += Number(row.cac_all_in) * novos;
    // Churn e LTV ponderados pelos clientes ativos do produto naquele mês — dá a média
    // consolidada certa em vez de simplesmente somar taxas de produtos diferentes.
    const clientesRow = Number(row.clientes_ativos ?? 0);
    atual.novosAcoes += Number(row.novos_acoes ?? 0);
    if (row.preco_medio_venda != null) {
      const pmv = Number(row.preco_medio_venda);
      atual.pmvPonderado += pmv * novos;
      atual.novosComPmv += novos;
      atual.pmvPonderadoBase += pmv * clientesRow;
      atual.clientesComPmv += clientesRow;
    }
    if (row.churn_pct != null) atual.churnPonderado += Number(row.churn_pct) * clientesRow;
    if (row.ltv != null) atual.ltvPonderado += Number(row.ltv) * clientesRow;
  }

  // Custos compartilhados da empresa (não ligados a um produto) — entram uma vez no EBITDA
  // consolidado, sem ratear entre produtos.
  const modeloById = new Map(((modelosRaw ?? []) as { id: string; nome?: string; cargo: string; categoria: "pd" | "sm" | "ga"; tipo_modelo: string; parametros: ParametrosModelo }[]).map((m) => [m.id, m]));
  for (const atual of porMes.values()) {
    const mesDate = new Date(atual.mes_referencia + "T00:00:00");

    let custosEmpresa = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (custosEmpresaRaw ?? []) as any[]) {
      const produtoRefId = c.parametros?.produto_referencia_id as string | undefined;
      const faseReferencia = produtoRefId ? faseDoProdutoNoMes(fasesPorProduto.get(produtoRefId) ?? [], mesDate) : null;
      const valor = custoEmpresaNoMes(c as CustoEmpresaInput, mesDate, atual.receita, atual.clientes, faseReferencia);
      custosEmpresa += valor;
      if (valor !== 0 && c.plano_contas) {
        const sub = subgrupoDeConta(c.plano_contas.codigo, c.plano_contas.tipo);
        const rotulo = `${c.item} (${c.plano_contas.codigo})`;
        if (sub === "marketing") atual.smMarketing += valor;
        else if (sub === "vendas") atual.smVendas += valor;
        else if (sub === "outros_sm") atual.smOutros += valor;
        else if (sub === "pd") atual.opexPd += valor;
        else if (sub === "ga") atual.opexGa += valor;
        else if (sub === "suporte" || sub === "infraestrutura" || sub === "outros_cogs") {
          // Custo da empresa em conta de COGS (ex: infra compartilhada lançada no card CSP, modo
          // Compartilhado) — antes ficava fora do EBITDA; é custo de entregar o serviço.
          atual.cogs += valor;
          atual.empresaCogs += valor;
          compor(atual, "cogs", "empresa", rotulo, valor);
        }
        if (sub === "marketing" || sub === "vendas" || sub === "outros_sm") {
          atual.empresaSm += valor;
          if (categoriaDeConta({ codigo: c.plano_contas.codigo }) === "marketing") atual.empresaMarketingLancado += valor;
          else atual.empresaVendasLancado += valor;
          compor(atual, "sm", "empresa", rotulo, valor);
        } else if (sub === "pd") {
          atual.empresaPd += valor;
          compor(atual, "pd", "empresa", rotulo, valor);
        } else if (sub === "ga") {
          atual.empresaGa += valor;
          if (String(c.plano_contas.codigo).startsWith("2.4")) atual.empresaMarca += valor;
          compor(atual, "ga", "empresa", rotulo, valor);
        }
        // Financeiro (3.x), capital e ativos ficam fora da DRE operacional — e fora das colunas.
      }
    }
    // Feiras e eventos: custo de marketing da empresa (não de um produto), no mês em que é pago.
    const custoAcoes = custoAcoesPorMes.get(atual.mes_referencia) ?? 0;
    if (custoAcoes > 0) {
      custosEmpresa += custoAcoes;
      atual.smMarketing += custoAcoes;
      atual.empresaSm += custoAcoes;
      atual.smFeirasEventos += custoAcoes;
      compor(atual, "sm", "feiras", "Feiras, eventos e campanhas (2.1.8 / 2.1.1)", custoAcoes);
    }

    // Mensalidade de manter cada parceiro (ex: associação): taxa de filiação, conta 2.3.5.1
    // "G&A — Associações e Filiações de Classe". É custo de estrutura, não de aquisição: escala com
    // o número de parceiros filiados, não com o que eles vendem. Por isso vai pra G&A e fica FORA
    // do CAC — que só soma marketing + vendas + outros_sm.
    for (const canal of canaisComCusto) {
      const ativos = parceirosAtivosNoMes(canal.id, atual.mes_referencia);
      if (ativos <= 0) continue;
      const custo = ativos * canal.custoMensalPorParceiro;
      custosEmpresa += custo;
      atual.opexGa += custo;
      atual.empresaGa += custo;
      atual.gaTaxasFiliacao += custo;
      compor(atual, "ga", "canais", "Filiação de associações parceiras (2.3.5.1)", custo);
    }

    // Equipe alocada em Necessidade de Contratação — uma regra só (lib/equipe-comercial): cada
    // alocação cobre a demanda dos produtos dela, na unidade que o modelo cobra, e o vendedor só
    // recebe por venda das vendas que passaram por reunião.
    const demandaMes: Record<string, DemandaProdutoMes> = {};
    for (const [pid, porMesProduto] of Object.entries(demandaPorCargo.porProduto)) {
      const d = porMesProduto[atual.mes_referencia];
      if (d) demandaMes[pid] = d;
    }
    const equipe = custoEquipeNoMes({
      mes: atual.mes_referencia,
      alocacoes: (alocacoesRaw ?? []) as AlocacaoEquipe[],
      modelos: modeloById as Map<string, ModeloEquipe>,
      demanda: demandaMes,
      arpuPorProduto: arpuPorMes.get(atual.mes_referencia) ?? {},
    });
    atual.demandaDescoberta = { sdr: equipe.descoberto.sdr, vendedor: equipe.descoberto.vendedor };
    for (const item of equipe.itens) {
      const custoModelo = item.custo;
      const tipo = item.tipo;
      custosEmpresa += custoModelo;
      // Folha CLT (pra Fator R do Simples) — só enxerga CLT contratado via Modelos de Contratação
      // (SDR/Coordenador/Suporte); CLT lançado direto em Equipe Alocada/Contratações por produto
      // não entra aqui ainda, então o Fator R pode ficar subestimado se você tiver CLT só lá.
      if (tipo === "clt") atual.custoCLT += custoModelo;
      const chaveCargo = item.chave;
      if (chaveCargo === "sdr") atual.alocacaoSdr += custoModelo;
      else if (chaveCargo === "vendedor") atual.alocacaoVendedor += custoModelo;
      else if (chaveCargo === "coordenador") atual.alocacaoCoordenador += custoModelo;
      else if (chaveCargo === "suporte") atual.alocacaoSuporte += custoModelo;
      else atual.alocacaoOutros += custoModelo;
      const sub = item.sub;
      // Alocação de Suporte só dimensiona equipe: o custo de suporte vem das regras de COGS (1.1.3).
      // Ela não entra no EBITDA — e por isso também não entra nas colunas de equipe.
      if (sub !== "suporte") {
        if (tipo === "clt" || tipo === "empresa_fixo_escopo") atual.alocacaoFixa += custoModelo;
        else atual.alocacaoVariavel += custoModelo;
      }
      const rotuloEquipe = item.rotulo;
      if (sub === "marketing") atual.smMarketing += custoModelo;
      else if (sub === "vendas") atual.smVendas += custoModelo;
      else if (sub === "outros_sm") atual.smOutros += custoModelo;
      else if (sub === "pd") atual.opexPd += custoModelo;
      else if (sub === "ga") atual.opexGa += custoModelo;
      if (sub === "marketing" || sub === "vendas" || sub === "outros_sm") {
        atual.alocacaoSm += custoModelo;
        for (const [pid, v] of Object.entries(item.porProduto)) {
          atual.equipePorProduto[pid] = (atual.equipePorProduto[pid] ?? 0) + v;
          compor(atual, "sm", "equipe", rotuloEquipe, v, pid ? (nomeProduto.get(pid) ?? "") : "");
        }
      }
      else if (sub === "pd") compor(atual, "pd", "equipe", rotuloEquipe, custoModelo);
      else if (sub === "ga") compor(atual, "ga", "equipe", rotuloEquipe, custoModelo);
    }

    atual.custosEmpresa = custosEmpresa;
  }

  // O desconto de combo NÃO é aplicado aqui: ele é lançado dentro da simulação de cada produto
  // (ver ComboInput em simulacao.ts), pra que a margem bruta por produto já venha líquida. Somar
  // de novo aqui contaria o desconto duas vezes.

  const linhas = [...porMes.values()].sort((a, b) => (a.mes_referencia < b.mes_referencia ? -1 : 1));

  // Tributação depois do Simples — alíquotas editáveis em Configurações (estimativa; validar com o contador).
  const { data: tributosRaw } = await supabase.from("parametros_tributarios").select("*").maybeSingle();
  const parametrosTributarios = parametrosTributariosDe(tributosRaw as Record<string, unknown> | null);
  let acumuladoAno = 0;
  let foraDoSimples = false;
  let saiNoProximoMes = false;

  // Simples Nacional: RBT12 e Folha+Pró-labore 12m são sempre a JANELA DOS 12 MESES ANTERIORES ao
  // mês corrente (não incluem o próprio mês — é assim que a Receita Federal calcula o DAS). Sem
  // 12 meses de histórico ainda, anualizamos a média disponível como estimativa.
  for (let i = 0; i < linhas.length; i++) {
    const janela = linhas.slice(Math.max(0, i - 12), i);
    const rbt12 =
      janela.length >= 12
        ? janela.reduce((s, l) => s + l.receita, 0)
        : janela.length > 0
          ? (janela.reduce((s, l) => s + l.receita, 0) / janela.length) * 12
          : linhas[i].receita * 12;
    const folha12 =
      janela.length >= 12
        ? janela.reduce((s, l) => s + l.custoCLT, 0)
        : janela.length > 0
          ? (janela.reduce((s, l) => s + l.custoCLT, 0) / janela.length) * 12
          : linhas[i].custoCLT * 12;
    const fatorR = rbt12 > 0 ? folha12 / rbt12 : 0;
    const l = linhas[i];
    const mesDoAno = l.mes_referencia.slice(5, 7);
    if (mesDoAno === "01") acumuladoAno = 0;
    if (saiNoProximoMes) foraDoSimples = true;
    // Compras da empresa que geram crédito: COGS compartilhado, marketing lançado, feiras e eventos.
    l.custosCreditaveis += l.empresaCogs + l.empresaMarketingLancado + l.smFeirasEventos;
    if (!foraDoSimples) {
      const resultado = calcularImpostoSimples(l.receita, rbt12, fatorR);
      l.impostoMensal = resultado.impostoMensal;
      l.aliquotaEfetivaImposto = resultado.aliquotaEfetiva;
      l.regimeTributario = "simples";
    } else {
      const r = calcularTributosPosSimples(l.receita, l.custosCreditaveis, Number(l.mes_referencia.slice(0, 4)), parametrosTributarios);
      l.impostoMensal = r.deducoes;
      l.aliquotaEfetivaImposto = r.aliquotaEfetiva;
      l.creditoTributos = r.credito;
      l.irpjCsll = r.irpjCsll;
      l.regimeTributario = "lucro_presumido";
    }
    // LC 123, art. 30: passou de R$ 4,8 mi no ano, sai em janeiro seguinte; passou de 20% acima
    // (R$ 5,76 mi), sai já no mês seguinte. Depois de sair, não volta.
    acumuladoAno += l.receita;
    if (!foraDoSimples && acumuladoAno > LIMITE_SIMPLES_ANUAL * 1.2) saiNoProximoMes = true;
    if (!foraDoSimples && mesDoAno === "12" && acumuladoAno > LIMITE_SIMPLES_ANUAL) saiNoProximoMes = true;
  }

  // EBITDA em cascata, só depois de ter os impostos do mês: Receita (–) COGS (–) Impostos
  // (=) Margem Bruta (–) S&M (–) P&D (–) G&A (=) EBITDA.
  for (const l of linhas) {
    l.ebitda = l.receita - l.cogs - l.impostoMensal - l.smMarketing - l.smVendas - l.smOutros - l.opexPd - l.opexGa;
  }

  // O retorno é calculado só sobre o investimento NOVO (o que ainda não está aplicado) — a regra
  // inteira mora em carregarAportes, que também alimenta a linha de aportes das telas.
  const aportes = await carregarAportes(supabase, cenarioId);
  const periodo = {
    inicio: (cenarioRow as { data_inicio?: string | null } | null)?.data_inicio ?? null,
    fim: (cenarioRow as { data_fim?: string | null } | null)?.data_fim ?? null,
  };

  return {
    linhas,
    linhasPeriodo: recortarPeriodo(linhas, periodo.inicio, periodo.fim),
    periodo,
    totalInvestido: aportes.capitalNovo,
    aportes,
  };
}
