import { FASES, type FaseValue } from "@/lib/fases";

export type FaseInput = {
  fase: FaseValue;
  data_inicio: string | null;
  data_fim: string | null;
  taxa_crescimento_mensal: number | null;
  taxa_churn_mensal: number | null;
  investimento_ms_mensal: number | null;
};

export type BetaInput = {
  fase: FaseValue;
  quantidade: number;
  duracao_dias: number | null;
  bonificacao_meses: number | null;
};

export type FunilInput = {
  fase: FaseValue;
  taxa_conversao: number | null;
  capacidade_vendedor_mes: number | null;
  span_of_control: number | null;
};

export type ContratacaoInput = {
  cargo: "sdr" | "vendedor" | "coordenador";
  data_inicio: string | null;
  data_fim: string | null;
  custo_mensal: number;
};

export type PlanoInput = {
  tipo_cobranca: "mensal" | "semestral" | "anual";
  preco: number;
  mix_percentual: number | null;
};

export type CustoFixoInput = {
  fase: FaseValue;
  grupo: "cogs" | "sm" | "pd" | "ga" | "outros";
  quantidade: number;
  valor_unitario: number;
};

export type AlocacaoInput = {
  fase: FaseValue;
  categoria: "pd" | "sm" | "ga";
  quantidade_funcionarios: number;
  horas_mes: number;
  custo_hora: number;
};

export type CustoVariavelInput = {
  fase: FaseValue;
  tipo_calculo: "percentual_receita" | "valor_por_cliente" | "valor_fixo";
  valor_base: number | null;
  percentual: number | null;
  valor_por_unidade: number | null;
};

export type SimulacaoInput = {
  dataInicioProduto: string | null;
  dataLancamentoEstimada: string | null;
  fases: FaseInput[];
  betas: BetaInput[];
  funis: FunilInput[];
  contratacoes: ContratacaoInput[];
  alocacoes: AlocacaoInput[];
  planos: PlanoInput[];
  custosFixos: CustoFixoInput[];
  custosVariaveis: CustoVariavelInput[];
  meses?: number;
};

export type MesResultado = {
  mes_referencia: string;
  novos_clientes: number;
  clientes_ativos: number;
  beta_testers_ativos: number;
  mrr: number;
  churn_pct: number | null;
  cac_all_in: number | null;
  ltv: number | null;
  receita_bruta: number;
  cogs: number;
  opex_sm: number;
  opex_pd: number;
  opex_ga: number;
  ebitda: number;
};

function addMonths(dateStr: string, n: number): Date {
  const d = new Date(dateStr + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function isoMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function faseParaMes(fases: FaseInput[], mes: Date): FaseInput | null {
  const dentro = fases.find((f) => {
    if (!f.data_inicio || !f.data_fim) return false;
    const inicio = new Date(f.data_inicio + "T00:00:00");
    const fim = new Date(f.data_fim + "T00:00:00");
    return mes >= new Date(inicio.getFullYear(), inicio.getMonth(), 1) && mes <= fim;
  });
  if (dentro) return dentro;

  // Fora de qualquer intervalo definido: usa a última fase cujo início já passou.
  const passadas = fases
    .filter((f) => f.data_inicio && new Date(f.data_inicio + "T00:00:00") <= mes)
    .sort((a, b) => (a.data_inicio! < b.data_inicio! ? 1 : -1));
  return passadas[0] ?? null;
}

/** ARPU mensal equivalente, ponderado pelo mix percentual de cada plano. */
function calcularArpu(planos: PlanoInput[]): number {
  const comMix = planos.filter((p) => p.mix_percentual != null);
  if (comMix.length === 0) return 0;

  const somaMix = comMix.reduce((acc, p) => acc + Number(p.mix_percentual), 0);
  if (somaMix <= 0) return 0;

  return comMix.reduce((acc, p) => {
    const mensal = p.tipo_cobranca === "mensal" ? p.preco : p.tipo_cobranca === "semestral" ? p.preco / 6 : p.preco / 12;
    return acc + mensal * (Number(p.mix_percentual) / somaMix);
  }, 0);
}

/** Soma o custo de todas as contratações ativas (por data) num determinado mês. */
function custoContratacoesNoMes(contratacoes: ContratacaoInput[], mes: Date): number {
  return contratacoes.reduce((acc, c) => {
    const inicio = c.data_inicio ? new Date(c.data_inicio + "T00:00:00") : null;
    const fim = c.data_fim ? new Date(c.data_fim + "T00:00:00") : null;
    const iniciouAntes = !inicio || new Date(inicio.getFullYear(), inicio.getMonth(), 1) <= mes;
    const aindaAtiva = !fim || fim >= mes;
    return iniciouAntes && aindaAtiva ? acc + c.custo_mensal : acc;
  }, 0);
}

export function calcularSimulacao(input: SimulacaoInput): MesResultado[] {
  const dataBase = input.dataInicioProduto ?? input.fases.find((f) => f.data_inicio)?.data_inicio;
  if (!dataBase) return [];

  const totalMeses = input.meses ?? 60;
  const arpu = calcularArpu(input.planos);

  let clientesAtivos = 0;
  let betaAtivos = 0;
  const resultados: MesResultado[] = [];

  for (let i = 0; i < totalMeses; i++) {
    const mes = addMonths(dataBase, i);
    const fase = faseParaMes(input.fases, mes);

    if (!fase) {
      resultados.push({
        mes_referencia: isoMonth(mes),
        novos_clientes: 0,
        clientes_ativos: 0,
        beta_testers_ativos: 0,
        mrr: 0,
        churn_pct: null,
        cac_all_in: null,
        ltv: null,
        receita_bruta: 0,
        cogs: 0,
        opex_sm: 0,
        opex_pd: 0,
        opex_ga: 0,
        ebitda: 0,
      });
      continue;
    }

    const taxaCrescimento = fase.taxa_crescimento_mensal ?? 0;
    const taxaChurn = fase.taxa_churn_mensal ?? 0;

    // Pró-rata no mês exato do lançamento comercial (meio do mês civil).
    let fatorProRata = 1;
    if (input.dataLancamentoEstimada) {
      const lanc = new Date(input.dataLancamentoEstimada + "T00:00:00");
      if (lanc.getFullYear() === mes.getFullYear() && lanc.getMonth() === mes.getMonth()) {
        const totalDias = daysInMonth(mes);
        fatorProRata = (totalDias - lanc.getDate() + 1) / totalDias;
      }
    }

    // Beta testers: entram no início da fase, convertem em pagantes após teste + bonificação.
    const betaConfig = input.betas.find((b) => b.fase === fase.fase);
    let conversaoBeta = 0;
    if (betaConfig && fase.data_inicio) {
      const inicioFase = new Date(fase.data_inicio + "T00:00:00");
      const mesesAteFase = (mes.getFullYear() - inicioFase.getFullYear()) * 12 + (mes.getMonth() - inicioFase.getMonth());
      const mesesTeste = Math.ceil((betaConfig.duracao_dias ?? 0) / 30);
      const mesConversao = mesesTeste + (betaConfig.bonificacao_meses ?? 0);
      if (mesesAteFase === 0) betaAtivos += betaConfig.quantidade;
      if (mesesAteFase === mesConversao && betaAtivos > 0) {
        conversaoBeta = betaConfig.quantidade;
        betaAtivos = Math.max(0, betaAtivos - betaConfig.quantidade);
      }
    }

    const novosOrganicos = Math.round(clientesAtivos * taxaCrescimento * fatorProRata);
    const novosClientes = novosOrganicos + conversaoBeta;
    const perdidos = Math.round(clientesAtivos * taxaChurn);
    clientesAtivos = Math.max(0, clientesAtivos + novosClientes - perdidos);

    const receitaBruta = arpu * clientesAtivos * fatorProRata;

    // Custo real da equipe comercial contratada (CLT + PJ) ativa neste mês.
    const custoEquipeVendas = custoContratacoesNoMes(input.contratacoes, mes);
    const cacAllIn =
      novosClientes > 0 ? (custoEquipeVendas + (fase.investimento_ms_mensal ?? 0)) / novosClientes : null;

    const ltv = taxaChurn > 0 ? arpu / taxaChurn : null;

    // COGS e OPEX a partir do plano de custos da fase.
    let cogs = 0;
    let opexSm = fase.investimento_ms_mensal ?? 0;
    let opexPd = 0;
    let opexGa = 0;

    for (const c of input.custosFixos.filter((c) => c.fase === fase.fase)) {
      const valor = c.quantidade * c.valor_unitario;
      if (c.grupo === "cogs") cogs += valor;
      else if (c.grupo === "sm") opexSm += valor;
      else if (c.grupo === "pd") opexPd += valor;
      else if (c.grupo === "ga") opexGa += valor;
    }
    opexSm += custoEquipeVendas;

    for (const a of input.alocacoes.filter((a) => a.fase === fase.fase)) {
      const custo = a.quantidade_funcionarios * a.horas_mes * a.custo_hora;
      if (a.categoria === "pd") opexPd += custo;
      else if (a.categoria === "sm") opexSm += custo;
      else opexGa += custo;
    }

    for (const c of input.custosVariaveis.filter((c) => c.fase === fase.fase)) {
      if (c.tipo_calculo === "valor_fixo") cogs += c.valor_base ?? 0;
      else if (c.tipo_calculo === "valor_por_cliente")
        cogs += (c.valor_base ?? 0) + (c.valor_por_unidade ?? 0) * clientesAtivos;
      else if (c.tipo_calculo === "percentual_receita") cogs += (c.percentual ?? 0) * receitaBruta;
    }

    resultados.push({
      mes_referencia: isoMonth(mes),
      novos_clientes: novosClientes,
      clientes_ativos: clientesAtivos,
      beta_testers_ativos: betaAtivos,
      mrr: receitaBruta,
      churn_pct: taxaChurn,
      cac_all_in: cacAllIn,
      ltv,
      receita_bruta: receitaBruta,
      cogs,
      opex_sm: opexSm,
      opex_pd: opexPd,
      opex_ga: opexGa,
      ebitda: receitaBruta - cogs - opexSm - opexPd - opexGa,
    });
  }

  return resultados;
}

export { FASES };
