import { FASES, type FaseValue } from "@/lib/fases";
import { subgrupoDeCargo, type SubgrupoConta } from "@/lib/subgrupo-conta";

export type FaseInput = {
  fase: FaseValue;
  data_inicio: string | null;
  data_fim: string | null;
  taxa_crescimento_mensal: number | null;
  taxa_churn_mensal: number | null;
};

export type BetaInput = {
  quantidade: number;
  /** Informativo: quando o teste começa/termina — sempre antes do lançamento comercial. */
  data_inicio: string | null;
  data_fim: string | null;
  /** Desconto aplicado por um período a partir do lançamento comercial (recompensa por ter testado cedo). */
  condicao_especial_pct: number | null;
  /** Duração, em meses, da condição especial a partir do lançamento — depois disso paga o preço cheio normalmente. */
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

const subgrupoParaGrupo = (sub: SubgrupoConta): "cogs" | "sm" | "pd" | "ga" | "outros" => {
  if (sub === "suporte" || sub === "infraestrutura" || sub === "outros_cogs") return "cogs";
  if (sub === "marketing" || sub === "vendas" || sub === "outros_sm") return "sm";
  if (sub === "pd") return "pd";
  if (sub === "ga") return "ga";
  return "outros";
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
  subgrupo: SubgrupoConta;
  quantidade: number;
  valor_unitario: number;
};

export type AlocacaoInput = {
  fase: FaseValue;
  cargo: string;
  categoria: "pd" | "sm" | "ga";
  quantidade_funcionarios: number;
  horas_mes: number;
  custo_hora: number;
};

export type CustoVariavelInput = {
  fase: FaseValue;
  subgrupo: SubgrupoConta;
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
  cogs_suporte: number;
  cogs_infraestrutura: number;
  cogs_outros: number;
  sm_marketing: number;
  sm_vendas: number;
  sm_outros: number;
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
  // Quando duas fases têm limite no mesmo mês civil (ex: validação termina dia 1 e PMF começa
  // dia 2), a comparação abaixo trunca o início pro dia 1 do mês — as duas passam a "bater" com
  // esse mês. Preferimos sempre a que começou por último, já que ela rege a maior parte do mês.
  const dentro = fases
    .filter((f) => {
      if (!f.data_inicio || !f.data_fim) return false;
      const inicio = new Date(f.data_inicio + "T00:00:00");
      const fim = new Date(f.data_fim + "T00:00:00");
      return mes >= new Date(inicio.getFullYear(), inicio.getMonth(), 1) && mes <= fim;
    })
    .sort((a, b) => (a.data_inicio! < b.data_inicio! ? 1 : -1));
  if (dentro[0]) return dentro[0];

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

type Totais = { cogs: number; sm: number; pd: number; ga: number; suporte: number; infraestrutura: number; outros_cogs: number; marketing: number; vendas: number; outros_sm: number };

function novoTotais(): Totais {
  return { cogs: 0, sm: 0, pd: 0, ga: 0, suporte: 0, infraestrutura: 0, outros_cogs: 0, marketing: 0, vendas: 0, outros_sm: 0 };
}

function acumular(totais: Totais, subgrupo: SubgrupoConta, valor: number) {
  const grupo = subgrupoParaGrupo(subgrupo);
  if (grupo === "cogs") totais.cogs += valor;
  else if (grupo === "sm") totais.sm += valor;
  else if (grupo === "pd") totais.pd += valor;
  else if (grupo === "ga") totais.ga += valor;
  if (subgrupo === "suporte") totais.suporte += valor;
  else if (subgrupo === "infraestrutura") totais.infraestrutura += valor;
  else if (subgrupo === "outros_cogs") totais.outros_cogs += valor;
  else if (subgrupo === "marketing") totais.marketing += valor;
  else if (subgrupo === "vendas") totais.vendas += valor;
  else if (subgrupo === "outros_sm") totais.outros_sm += valor;
}

/** Soma o custo das contratações ativas (por data) num determinado mês, por categoria fina. */
function custoContratacoesNoMes(contratacoes: ContratacaoInput[], mes: Date): Totais {
  const totais = novoTotais();
  for (const c of contratacoes) {
    const inicio = c.data_inicio ? new Date(c.data_inicio + "T00:00:00") : null;
    const fim = c.data_fim ? new Date(c.data_fim + "T00:00:00") : null;
    const iniciouAntes = !inicio || new Date(inicio.getFullYear(), inicio.getMonth(), 1) <= mes;
    const aindaAtiva = !fim || fim >= mes;
    if (iniciouAntes && aindaAtiva) acumular(totais, subgrupoDeCargo(c.cargo, c.categoria), c.custo_mensal);
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
        cogs_suporte: 0,
        cogs_infraestrutura: 0,
        cogs_outros: 0,
        sm_marketing: 0,
        sm_vendas: 0,
        sm_outros: 0,
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

    // Meses desde o lançamento comercial do produto — usado pelo beta, por reajustes e por
    // módulos com gatilho por tempo.
    let mesesDesdeLancamentoProduto: number | null = null;
    if (input.dataLancamentoEstimada) {
      const lanc = new Date(input.dataLancamentoEstimada + "T00:00:00");
      mesesDesdeLancamentoProduto = (mes.getFullYear() - lanc.getFullYear()) * 12 + (mes.getMonth() - lanc.getMonth());
    }

    // Beta testers do produto: testam de graça antes do lançamento comercial (data_inicio/data_fim
    // são só informativas) e convertem todos juntos no mês exato do lançamento — com desconto por
    // um período (se configurado) ou preço cheio direto.
    let conversaoBeta = 0;
    if (mesesDesdeLancamentoProduto === 0) {
      // No mês do lançamento os beta testers convertem em clientes pagantes — deixam de ser "beta".
      betaAtivos = 0;
      for (const beta of input.betas) {
        conversaoBeta += beta.quantidade;
        if (beta.condicao_especial_pct && beta.condicao_especial_meses) {
          condicoesEspeciaisAtivas.push({
            quantidade: beta.quantidade,
            desconto: beta.condicao_especial_pct,
            mesFim: i + beta.condicao_especial_meses,
          });
        }
      }
    } else if (mesesDesdeLancamentoProduto != null && mesesDesdeLancamentoProduto < 0) {
      // Recalcula do zero a cada mês (não acumula sobre o mês anterior) — senão o mesmo lote de
      // beta testers seria contado de novo em cada mês que passa, inflando o total.
      betaAtivos = 0;
      for (const beta of input.betas) {
        if (beta.data_inicio && new Date(beta.data_inicio + "T00:00:00") <= mes) betaAtivos += beta.quantidade;
      }
    }

    // Cresce/perde em ponto flutuante (sem arredondar a cada mês): com base pequena, arredondar
    // o crescimento e o churn separadamente antes de somar faz eles se cancelarem (ex: base 5,
    // crescimento 23% ~1.15→1 e churn 10% ~0.5→1, net zero todo mês) e a base trava artificialmente
    // baixa por muitos meses. Só arredondamos pro valor exibido (abaixo, no push).
    const novosOrganicos = clientesAtivos * taxaCrescimento * fatorProRata;
    const novosClientes = novosOrganicos + conversaoBeta;
    const perdidos = clientesAtivos * taxaChurn;
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

    // Custo real das contratações (CLT + PJ) ativas neste mês, já separado por categoria fina.
    const totais = custoContratacoesNoMes(input.contratacoes, mes);

    const ltv = taxaChurn > 0 ? arpu / taxaChurn : null;

    // COGS e OPEX a partir do plano de custos da fase (equipe alocada + custos fixos/variáveis).
    for (const c of input.custosFixos.filter((c) => c.fase === fase.fase)) {
      acumular(totais, c.subgrupo, c.quantidade * c.valor_unitario);
    }

    for (const a of input.alocacoes.filter((a) => a.fase === fase.fase)) {
      const custo = a.quantidade_funcionarios * a.horas_mes * a.custo_hora;
      acumular(totais, subgrupoDeCargo(a.cargo, a.categoria), custo);
    }

    for (const c of input.custosVariaveis.filter((c) => c.fase === fase.fase)) {
      const valor =
        c.tipo_calculo === "valor_fixo"
          ? (c.valor_base ?? 0)
          : c.tipo_calculo === "valor_por_cliente"
            ? (c.valor_base ?? 0) + (c.valor_por_unidade ?? 0) * clientesAtivos
            : (c.percentual ?? 0) * receitaBruta;
      acumular(totais, c.subgrupo, valor);
    }

    // CAC all-in: todo o investimento em S&M da fase (equipe comercial contratada + equipe
    // alocada + custos fixos/variáveis categorizados como S&M) dividido pelos clientes novos.
    const cacAllIn = novosClientes > 0 ? totais.sm / novosClientes : null;

    resultados.push({
      mes_referencia: isoMonth(mes),
      novos_clientes: Math.round(novosClientes),
      clientes_ativos: Math.round(clientesAtivos),
      beta_testers_ativos: betaAtivos,
      mrr: receitaBruta,
      churn_pct: taxaChurn,
      cac_all_in: cacAllIn,
      ltv,
      receita_bruta: receitaBruta,
      receita_modulos: receitaModulos,
      cogs: totais.cogs,
      opex_sm: totais.sm,
      opex_pd: totais.pd,
      opex_ga: totais.ga,
      ebitda: receitaBruta - totais.cogs - totais.sm - totais.pd - totais.ga,
      cogs_suporte: totais.suporte,
      cogs_infraestrutura: totais.infraestrutura,
      cogs_outros: totais.outros_cogs,
      sm_marketing: totais.marketing,
      sm_vendas: totais.vendas,
      sm_outros: totais.outros_sm,
    });
  }

  return resultados;
}

export { FASES };
