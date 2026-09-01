import { FASES, type FaseValue } from "@/lib/fases";

export type FaseInput = {
  fase: FaseValue;
  data_inicio: string | null;
  data_fim: string | null;
  taxa_crescimento_mensal: number | null;
  taxa_churn_mensal: number | null;
};

export type BetaInput = {
  fase: FaseValue;
  quantidade: number;
  duracao_dias: number | null;
  bonificacao_meses: number | null;
  /** Desconto aplicado por um período após a conversão (recompensa por ter testado cedo). */
  condicao_especial_pct: number | null;
  /** Duração, em meses, da condição especial após a conversão — depois disso paga o preço cheio normalmente. */
  condicao_especial_meses: number | null;
};

export type FunilInput = {
  fase: FaseValue;
  taxa_conversao: number | null;
  capacidade_vendedor_mes: number | null;
  span_of_control: number | null;
};

export type ContratacaoInput = {
  cargo: string;
  categoria: "pd" | "sm" | "ga";
  data_inicio: string | null;
  data_fim: string | null;
  custo_mensal: number;
};

export type PlanoInput = {
  tipo_cobranca: "mensal" | "semestral" | "anual";
  preco: number;
  mix_percentual: number | null;
  /** % de reajuste aplicado anualmente, a partir de 1 ano do lançamento do produto (produtos simples). */
  reajuste_anual_pct: number | null;
  /** Preço específico por fase — sobrepõe `preco` a partir da fase em que for definido (produtos complexos). */
  precos_por_fase: Partial<Record<FaseValue, number>>;
};

export type BetaModuloInput = {
  quantidade: number;
  /** Desconto aplicado por um período a partir do lançamento oficial do módulo (opcional). */
  condicao_especial_pct: number | null;
  condicao_especial_meses: number | null;
};

export type ModuloInput = {
  nome: string;
  preco: number;
  /** Gatilho por fase do ciclo de vida — usado quando `meses_apos_lancamento` não é definido. */
  fase_lancamento: FaseValue | null;
  /** Gatilho por tempo: quantos meses após o lançamento comercial do produto o módulo entra (ex: melhorias do Fashion Mind, 12/24 meses). Tem prioridade sobre `fase_lancamento`. */
  meses_apos_lancamento: number | null;
  adesao_inicial_pct: number;
  crescimento_adesao_mensal_pct: number;
  /** Beta testers do módulo — sempre testam ANTES do lançamento oficial, sem pagar; convertem no mês do lançamento. */
  betaTesters: BetaModuloInput[];
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
  grupo: "cogs" | "sm" | "pd" | "ga" | "outros";
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
  modulos: ModuloInput[];
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
  receita_modulos: number;
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

const FASE_ORDEM: FaseValue[] = FASES.map((f) => f.value);

/** Preço efetivo do plano na fase/mês atual: aplica override por fase e reajuste anual. */
function precoEfetivo(plano: PlanoInput, fase: FaseValue, mes: Date, dataLancamento: string | null): number {
  let preco = plano.preco;

  const idxAtual = FASE_ORDEM.indexOf(fase);
  const entradasFase = (Object.entries(plano.precos_por_fase) as [FaseValue, number][])
    .filter(([f]) => FASE_ORDEM.indexOf(f) <= idxAtual)
    .sort((a, b) => FASE_ORDEM.indexOf(b[0]) - FASE_ORDEM.indexOf(a[0]));
  if (entradasFase.length > 0) preco = entradasFase[0][1];

  if (plano.reajuste_anual_pct && dataLancamento) {
    const lanc = new Date(dataLancamento + "T00:00:00");
    const mesesDesdeLancamento = (mes.getFullYear() - lanc.getFullYear()) * 12 + (mes.getMonth() - lanc.getMonth());
    const anos = Math.floor(mesesDesdeLancamento / 12);
    if (anos >= 1) preco *= Math.pow(1 + plano.reajuste_anual_pct, anos);
  }

  return preco;
}

/** ARPU mensal equivalente, ponderado pelo mix percentual de cada plano, na fase/mês atual. */
function calcularArpu(planos: PlanoInput[], fase: FaseValue, mes: Date, dataLancamento: string | null): number {
  const comMix = planos.filter((p) => p.mix_percentual != null);
  if (comMix.length === 0) return 0;

  const somaMix = comMix.reduce((acc, p) => acc + Number(p.mix_percentual), 0);
  if (somaMix <= 0) return 0;

  return comMix.reduce((acc, p) => {
    const precoBase = precoEfetivo(p, fase, mes, dataLancamento);
    const mensal = p.tipo_cobranca === "mensal" ? precoBase : p.tipo_cobranca === "semestral" ? precoBase / 6 : precoBase / 12;
    return acc + mensal * (Number(p.mix_percentual) / somaMix);
  }, 0);
}

/** Soma o custo das contratações ativas (por data) num determinado mês, por categoria (P&D/S&M/G&A). */
function custoContratacoesNoMes(contratacoes: ContratacaoInput[], mes: Date): { sm: number; pd: number; ga: number } {
  const totais = { sm: 0, pd: 0, ga: 0 };
  for (const c of contratacoes) {
    const inicio = c.data_inicio ? new Date(c.data_inicio + "T00:00:00") : null;
    const fim = c.data_fim ? new Date(c.data_fim + "T00:00:00") : null;
    const iniciouAntes = !inicio || new Date(inicio.getFullYear(), inicio.getMonth(), 1) <= mes;
    const aindaAtiva = !fim || fim >= mes;
    if (iniciouAntes && aindaAtiva) totais[c.categoria] += c.custo_mensal;
  }
  return totais;
}

export function calcularSimulacao(input: SimulacaoInput): MesResultado[] {
  const dataBase = input.dataInicioProduto ?? input.fases.find((f) => f.data_inicio)?.data_inicio;
  if (!dataBase) return [];

  const totalMeses = input.meses ?? 60;

  let clientesAtivos = 0;
  let betaAtivos = 0;
  const adocaoModulos = new Map<number, number>();
  // Beta testers de módulo: convertem no mês do lançamento oficial. Enquanto durar a condição
  // especial (se houver), pagam com desconto; depois disso somam-se aos "permanentes" (preço cheio).
  const moduloJaLancado = new Set<number>();
  const betaModuloPermanentes = new Map<number, number>();
  let betaModuloComDesconto: { moduloIdx: number; quantidade: number; desconto: number; mesFim: number }[] = [];
  // Clientes que converteram do beta e ainda estão dentro da janela de condição especial
  // (desconto por tempo limitado) — cada entrada é um lote independente, escopado à fase/beta
  // que a originou, sem acumular com outras condições de outras fases ou módulos.
  let condicoesEspeciaisAtivas: { quantidade: number; desconto: number; mesFim: number }[] = [];
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
        receita_modulos: 0,
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

        if (betaConfig.condicao_especial_pct && betaConfig.condicao_especial_meses) {
          condicoesEspeciaisAtivas.push({
            quantidade: betaConfig.quantidade,
            desconto: betaConfig.condicao_especial_pct,
            mesFim: i + betaConfig.condicao_especial_meses,
          });
        }
      }
    }

    const novosOrganicos = Math.round(clientesAtivos * taxaCrescimento * fatorProRata);
    const novosClientes = novosOrganicos + conversaoBeta;
    const perdidos = Math.round(clientesAtivos * taxaChurn);
    clientesAtivos = Math.max(0, clientesAtivos + novosClientes - perdidos);

    const arpu = calcularArpu(input.planos, fase.fase, mes, input.dataLancamentoEstimada);

    // Remove condições especiais já vencidas e desconta, do faturamento normal, os clientes
    // ainda dentro da janela (pagam preço cheio menos o desconto combinado, só nesse período).
    condicoesEspeciaisAtivas = condicoesEspeciaisAtivas.filter((c) => c.mesFim > i);
    const descontoCondicaoEspecial = condicoesEspeciaisAtivas.reduce(
      (acc, c) => acc + c.quantidade * arpu * c.desconto,
      0,
    );

    const receitaPlanos = (arpu * clientesAtivos - descontoCondicaoEspecial) * fatorProRata;

    // Meses desde o lançamento comercial do produto — usado por reajustes e por módulos com gatilho por tempo.
    let mesesDesdeLancamentoProduto: number | null = null;
    if (input.dataLancamentoEstimada) {
      const lanc = new Date(input.dataLancamentoEstimada + "T00:00:00");
      mesesDesdeLancamentoProduto = (mes.getFullYear() - lanc.getFullYear()) * 12 + (mes.getMonth() - lanc.getMonth());
    }

    // Receita de módulos add-on: ativa por fase do ciclo de vida OU por tempo desde o lançamento
    // (ex: melhorias do Fashion Mind, 12/24 meses após o MVP), com adesão inicial sobre a base
    // de clientes e crescimento mensal composto até 100%.
    const faseIdxAtual = FASE_ORDEM.indexOf(fase.fase);
    let receitaModulos = 0;
    // Remove condições especiais de beta de módulo já vencidas, somando o lote ao grupo
    // permanente (preço cheio dali em diante).
    betaModuloComDesconto = betaModuloComDesconto.filter((c) => {
      if (c.mesFim > i) return true;
      betaModuloPermanentes.set(c.moduloIdx, (betaModuloPermanentes.get(c.moduloIdx) ?? 0) + c.quantidade);
      return false;
    });

    input.modulos.forEach((modulo, mi) => {
      const lancado =
        modulo.meses_apos_lancamento != null
          ? mesesDesdeLancamentoProduto != null && mesesDesdeLancamentoProduto >= modulo.meses_apos_lancamento
          : modulo.fase_lancamento != null && faseIdxAtual >= FASE_ORDEM.indexOf(modulo.fase_lancamento);
      if (!lancado) return;

      // No mês exato do lançamento oficial, os beta testers desse módulo convertem: com desconto
      // por um período (se configurado) ou direto pro preço cheio.
      if (!moduloJaLancado.has(mi)) {
        moduloJaLancado.add(mi);
        for (const beta of modulo.betaTesters) {
          if (beta.condicao_especial_pct && beta.condicao_especial_meses) {
            betaModuloComDesconto.push({
              moduloIdx: mi,
              quantidade: beta.quantidade,
              desconto: beta.condicao_especial_pct,
              mesFim: i + beta.condicao_especial_meses,
            });
          } else {
            betaModuloPermanentes.set(mi, (betaModuloPermanentes.get(mi) ?? 0) + beta.quantidade);
          }
        }
      }

      let adocaoPct = adocaoModulos.get(mi);
      adocaoPct = adocaoPct === undefined ? modulo.adesao_inicial_pct : Math.min(1, adocaoPct * (1 + modulo.crescimento_adesao_mensal_pct));
      adocaoModulos.set(mi, adocaoPct);

      receitaModulos += adocaoPct * clientesAtivos * modulo.preco;
      receitaModulos += (betaModuloPermanentes.get(mi) ?? 0) * modulo.preco;
      receitaModulos += betaModuloComDesconto
        .filter((c) => c.moduloIdx === mi)
        .reduce((acc, c) => acc + c.quantidade * modulo.preco * (1 - c.desconto), 0);
    });
    receitaModulos *= fatorProRata;

    const receitaBruta = receitaPlanos + receitaModulos;

    // Custo real das contratações (CLT + PJ) ativas neste mês, já separado por categoria.
    const custoContratacoes = custoContratacoesNoMes(input.contratacoes, mes);

    const ltv = taxaChurn > 0 ? arpu / taxaChurn : null;

    // COGS e OPEX a partir do plano de custos da fase (equipe alocada + custos fixos/variáveis).
    let cogs = 0;
    let opexSm = custoContratacoes.sm;
    let opexPd = custoContratacoes.pd;
    let opexGa = custoContratacoes.ga;

    for (const c of input.custosFixos.filter((c) => c.fase === fase.fase)) {
      const valor = c.quantidade * c.valor_unitario;
      if (c.grupo === "cogs") cogs += valor;
      else if (c.grupo === "sm") opexSm += valor;
      else if (c.grupo === "pd") opexPd += valor;
      else if (c.grupo === "ga") opexGa += valor;
    }

    for (const a of input.alocacoes.filter((a) => a.fase === fase.fase)) {
      const custo = a.quantidade_funcionarios * a.horas_mes * a.custo_hora;
      if (a.categoria === "pd") opexPd += custo;
      else if (a.categoria === "sm") opexSm += custo;
      else opexGa += custo;
    }

    for (const c of input.custosVariaveis.filter((c) => c.fase === fase.fase)) {
      const valor =
        c.tipo_calculo === "valor_fixo"
          ? (c.valor_base ?? 0)
          : c.tipo_calculo === "valor_por_cliente"
            ? (c.valor_base ?? 0) + (c.valor_por_unidade ?? 0) * clientesAtivos
            : (c.percentual ?? 0) * receitaBruta;
      if (c.grupo === "sm") opexSm += valor;
      else if (c.grupo === "pd") opexPd += valor;
      else if (c.grupo === "ga") opexGa += valor;
      else cogs += valor;
    }

    // CAC all-in: todo o investimento em S&M da fase (equipe comercial contratada + equipe
    // alocada + custos fixos/variáveis categorizados como S&M) dividido pelos clientes novos.
    const cacAllIn = novosClientes > 0 ? opexSm / novosClientes : null;

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
      receita_modulos: receitaModulos,
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
