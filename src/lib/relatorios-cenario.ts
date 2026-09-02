import { custoEmpresaNoMes, faseDoProdutoNoMes, type CustoEmpresaInput } from "@/lib/custos-empresa";
import type { FaseValue } from "@/lib/fases";
import { custoMensalModelo, type ParametrosModelo, type TipoModelo } from "@/lib/modelos-contratacao";
import { calcularDemandaPorCargo, type FaseProdutoInput, type FunilPremissaInput, type SimulacaoMesInput } from "@/lib/necessidade-contratacao";
import { calcularImpostoSimples } from "@/lib/impostos";
import { subgrupoDeConta, subgrupoDeCargo } from "@/lib/subgrupo-conta";

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
  impostoMensal: number;
  aliquotaEfetivaImposto: number | null;
  // Quebra fina — produtos (via simulacao_mensal) + custos da empresa/alocações classificados
  // pelo mesmo critério de relatorios/mensal — usada nos drill-downs por indicador.
  smMarketing: number;
  smVendas: number;
  smOutros: number;
};

export type ResumoCenario = {
  linhas: Agregado[];
  totalInvestido: number;
};

export type Metricas = {
  receitaAcumulada: number;
  ebitdaAcumulado: number;
  custosAcumulados: number;
  margemOperacional: number | null;
  margemBruta: number | null;
  impostosAcumulados: number;
  churnMedio: number | null;
  ltvMedio: number | null;
  clientesInicio: number;
  clientesFinal: number;
  cacMedio: number | null;
  breakEvenMes: string | null;
  breakEvenClientes: number | null;
  paybackMes: string | null;
};

/** Todas as métricas calculadas só a partir das linhas já filtradas pro período selecionado —
 * break-even e payback recomeçam do zero no início do período, não carregam saldo de fora dele. */
export function computeMetricas(linhas: Agregado[], totalInvestido: number): Metricas {
  const receitaAcumulada = linhas.reduce((s, l) => s + l.receita, 0);
  const ebitdaAcumulado = linhas.reduce((s, l) => s + l.ebitda, 0);
  const custosAcumulados = receitaAcumulada - ebitdaAcumulado;
  const margemOperacional = receitaAcumulada > 0 ? (ebitdaAcumulado / receitaAcumulada) * 100 : null;
  // Margem bruta: receita (–) COGS direto dos produtos (–) deduções e impostos sobre a receita.
  // Diferente da margem operacional, que desconta TODOS os custos (inclusive S&M, P&D, G&A e os
  // custos compartilhados da empresa). Imposto = DAS do Simples Nacional (Anexo III ou V conforme
  // o Fator R), calculado mês a mês em agregarPorCenario com o RBT12 real da linha do tempo.
  const cogsAcumulado = linhas.reduce((s, l) => s + l.cogs, 0);
  const impostosAcumulados = linhas.reduce((s, l) => s + l.impostoMensal, 0);
  const margemBruta = receitaAcumulada > 0 ? ((receitaAcumulada - cogsAcumulado - impostosAcumulados) / receitaAcumulada) * 100 : null;
  const clientesInicio = linhas[0]?.clientes ?? 0;
  const clientesFinal = linhas[linhas.length - 1]?.clientes ?? 0;

  let somaCacPonderado = 0;
  let somaNovosClientes = 0;
  let somaChurnPonderado = 0;
  let somaLtvPonderado = 0;
  let somaClientesPeso = 0;
  let acumulado = 0;
  let breakEvenMes: string | null = null;
  let breakEvenClientes: number | null = null;
  let acumuladoPayback = 0;
  let paybackMes: string | null = null;

  for (const [i, l] of linhas.entries()) {
    acumulado += l.ebitda;
    if (breakEvenMes === null && acumulado >= 0 && i > 0) {
      breakEvenMes = l.mes_referencia;
      breakEvenClientes = l.clientes;
    }
    if (totalInvestido > 0 && paybackMes === null) {
      acumuladoPayback += l.ebitda;
      if (acumuladoPayback >= totalInvestido) paybackMes = l.mes_referencia;
    }
    somaCacPonderado += l.cacPonderado;
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
    impostosAcumulados,
    churnMedio: somaClientesPeso > 0 ? (somaChurnPonderado / somaClientesPeso) * 100 : null,
    ltvMedio: somaClientesPeso > 0 ? somaLtvPonderado / somaClientesPeso : null,
    clientesInicio,
    clientesFinal,
    cacMedio: somaNovosClientes > 0 ? somaCacPonderado / somaNovosClientes : null,
    breakEvenMes,
    breakEvenClientes,
    paybackMes,
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
  if (!cenarioId) return { linhas: [], totalInvestido: 0 };

  const [{ data: simRows }, { data: vinculos }, { data: custosEmpresaRaw }, { data: alocacoesRaw }, { data: modelosRaw }, { data: fasesRaw }] =
    await Promise.all([
      supabase
        .from("simulacao_mensal")
        .select(
          "produto_id, mes_referencia, receita_bruta, ebitda, cogs, clientes_ativos, cac_all_in, novos_clientes, churn_pct, ltv, sm_marketing, sm_vendas, sm_outros",
        )
        .eq("cenario_id", cenarioId)
        .order("mes_referencia"),
      supabase.from("cenario_programas").select("programa_id").eq("cenario_id", cenarioId),
      supabase.from("custos_empresa").select("*, plano_contas:plano_contas_id(codigo, tipo)").eq("cenario_id", cenarioId),
      supabase.from("alocacao_modelo_contratacao").select("*").eq("cenario_id", cenarioId),
      supabase.from("modelos_contratacao").select("*"),
      supabase.from("fases_produto").select("id, produto_id, fase, data_inicio, data_fim").eq("cenario_id", cenarioId),
    ]);

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
          .select("fase_produto_id, taxa_conversao, capacidade_vendedor_mes, span_of_control, horas_suporte_por_cliente_mes")
          .in("fase_produto_id", faseIds)
      : { data: [] };
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
      taxa_conversao: number | null;
      capacidade_vendedor_mes: number | null;
      span_of_control: number | null;
      horas_suporte_por_cliente_mes: number | null;
    }[]
  )
    .map((f) => {
      const fase = faseById.get(f.fase_produto_id);
      if (!fase) return null;
      return {
        produtoId: fase.produto_id,
        fase: fase.fase,
        taxa_conversao: f.taxa_conversao,
        capacidade_vendedor_mes: f.capacidade_vendedor_mes,
        span_of_control: f.span_of_control,
        horas_suporte_por_cliente_mes: f.horas_suporte_por_cliente_mes,
      };
    })
    .filter((f): f is FunilPremissaInput => f !== null);
  const simulacaoInput: SimulacaoMesInput[] = ((simRows ?? []) as { produto_id: string; mes_referencia: string; novos_clientes: number; clientes_ativos: number }[]).map((s) => ({
    produtoId: s.produto_id,
    mes_referencia: s.mes_referencia,
    novos_clientes: Number(s.novos_clientes),
    clientes_ativos: Number(s.clientes_ativos),
  }));
  const demandaPorCargo = calcularDemandaPorCargo({ fasesPorProduto: fasesPorProdutoInput, funis: funisInput, simulacao: simulacaoInput });
  const demandaPorCargoMes: Record<"sdr" | "coordenador" | "suporte", Map<string, number>> = {
    sdr: new Map(demandaPorCargo.sdr.map((d) => [d.mes_referencia, d.demanda])),
    coordenador: new Map(demandaPorCargo.coordenador.map((d) => [d.mes_referencia, d.demanda])),
    suporte: new Map(demandaPorCargo.suporte.map((d) => [d.mes_referencia, d.demanda])),
  };
  function demandaCargoNoMes(cargo: string, mes: string): number {
    const chave = cargo.trim().toLowerCase();
    if (chave === "sdr") return demandaPorCargoMes.sdr.get(mes) ?? 0;
    if (chave === "coordenador") return demandaPorCargoMes.coordenador.get(mes) ?? 0;
    if (chave === "suporte") return demandaPorCargoMes.suporte.get(mes) ?? 0;
    return 0;
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
        smMarketing: 0,
        smVendas: 0,
        smOutros: 0,
      } satisfies Agregado);
    atual.receita += Number(row.receita_bruta);
    atual.ebitdaProdutos += Number(row.ebitda);
    atual.clientes += Number(row.clientes_ativos);
    atual.cogs += Number(row.cogs ?? 0);
    atual.smMarketing += Number(row.sm_marketing ?? 0);
    atual.smVendas += Number(row.sm_vendas ?? 0);
    atual.smOutros += Number(row.sm_outros ?? 0);
    porMes.set(row.mes_referencia, atual);

    const novos = Number(row.novos_clientes ?? 0);
    if (row.cac_all_in != null && novos > 0) {
      atual.cacPonderado += Number(row.cac_all_in) * novos;
      atual.novosClientes += novos;
    }
    // Churn e LTV ponderados pelos clientes ativos do produto naquele mês — dá a média
    // consolidada certa em vez de simplesmente somar taxas de produtos diferentes.
    const clientesRow = Number(row.clientes_ativos ?? 0);
    if (row.churn_pct != null) atual.churnPonderado += Number(row.churn_pct) * clientesRow;
    if (row.ltv != null) atual.ltvPonderado += Number(row.ltv) * clientesRow;
  }

  // Custos compartilhados da empresa (não ligados a um produto) — entram uma vez no EBITDA
  // consolidado, sem ratear entre produtos.
  const modeloById = new Map(((modelosRaw ?? []) as { id: string; cargo: string; categoria: "pd" | "sm" | "ga"; tipo_modelo: string; parametros: ParametrosModelo }[]).map((m) => [m.id, m]));
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
        if (sub === "marketing") atual.smMarketing += valor;
        else if (sub === "vendas") atual.smVendas += valor;
        else if (sub === "outros_sm") atual.smOutros += valor;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (alocacoesRaw ?? []) as any[]) {
      if (!ativaNoMes(atual.mes_referencia, a.data_inicio, a.data_fim)) continue;
      const modelo = modeloById.get(a.modelo_id);
      if (!modelo) continue;
      const tipo = modelo.tipo_modelo as TipoModelo;
      const quantidade = Number(a.quantidade);
      // CLT e pacote fechado (empresa_fixo_escopo) são decisões discretas — você contratou N
      // unidades, o custo é esse independente da demanda real flutuar. PJ e os modelos pay-per-use
      // (créditos/híbrido) são cobrados pela demanda real do mês (PJ só entra pelas horas usadas).
      const demandaEquivalente =
        tipo === "clt" || tipo === "empresa_fixo_escopo"
          ? quantidade * (modelo.parametros.capacidade_unidade_mes ?? 1)
          : demandaCargoNoMes(a.cargo, atual.mes_referencia);
      const custoModelo = custoMensalModelo(tipo, modelo.parametros, demandaEquivalente).custoMensal;
      custosEmpresa += custoModelo;
      // Folha CLT (pra Fator R do Simples) — só enxerga CLT contratado via Modelos de Contratação
      // (SDR/Coordenador/Suporte); CLT lançado direto em Equipe Alocada/Contratações por produto
      // não entra aqui ainda, então o Fator R pode ficar subestimado se você tiver CLT só lá.
      if (tipo === "clt") atual.custoCLT += custoModelo;
      const sub = subgrupoDeCargo(modelo.cargo, modelo.categoria);
      if (sub === "marketing") atual.smMarketing += custoModelo;
      else if (sub === "vendas") atual.smVendas += custoModelo;
      else if (sub === "outros_sm") atual.smOutros += custoModelo;
    }

    atual.custosEmpresa = custosEmpresa;
    atual.ebitda = atual.ebitdaProdutos - custosEmpresa;
  }

  const linhas = [...porMes.values()].sort((a, b) => (a.mes_referencia < b.mes_referencia ? -1 : 1));

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
    const resultado = calcularImpostoSimples(linhas[i].receita, rbt12, fatorR);
    linhas[i].impostoMensal = resultado.impostoMensal;
    linhas[i].aliquotaEfetivaImposto = resultado.aliquotaEfetiva;
  }

  const programaIds = ((vinculos ?? []) as { programa_id: string }[]).map((v) => v.programa_id);
  let totalInvestido = 0;
  if (programaIds.length > 0) {
    const { data: programas } = await supabase
      .from("programas_investimento")
      .select("valor_total")
      .in("id", programaIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    totalInvestido = ((programas ?? []) as any[]).reduce((s, p) => s + Number(p.valor_total ?? 0), 0);
  }

  return { linhas, totalInvestido };
}
