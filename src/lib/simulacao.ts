import {
  calcularCogsMes,
  type CogsPremissas,
  type PerfilCustoHora,
} from "@/lib/cogs";
import { FASES, type FaseValue } from "@/lib/fases";
import { subgrupoDeCargo, type SubgrupoConta } from "@/lib/subgrupo-conta";

export type TrimestreFaseInput = {
  /** 0 = primeiros 3 meses da fase, 1 = meses 4–6, ... */
  indice: number;
  taxa_crescimento_mensal: number | null;
  taxa_churn_mensal: number | null;
};

export type FaseInput = {
  fase: FaseValue;
  data_inicio: string | null;
  data_fim: string | null;
  taxa_crescimento_mensal: number | null;
  taxa_churn_mensal: number | null;
  /** Taxas por bloco de 3 meses dentro da fase. Sem bloco pro mês, vale a taxa da fase acima. */
  trimestres?: TrimestreFaseInput[];
};

/**
 * Taxas do mês: procura o trimestre da fase em que o mês cai (contado do início da fase);
 * se não houver bloco cadastrado pra ele, usa o último bloco anterior definido — assim uma fase
 * aberta (maturidade) continua com a última taxa informada; sem nenhum bloco, vale a taxa da fase.
 */
export function taxasDoMes(
  fase: FaseInput,
  mes: Date,
): { crescimento: number; churn: number } {
  const padrao = {
    crescimento: fase.taxa_crescimento_mensal ?? 0,
    churn: fase.taxa_churn_mensal ?? 0,
  };
  const blocos = fase.trimestres ?? [];
  if (blocos.length === 0 || !fase.data_inicio) return padrao;
  const inicio = new Date(fase.data_inicio + "T00:00:00");
  const mesesNaFase =
    (mes.getFullYear() - inicio.getFullYear()) * 12 +
    (mes.getMonth() - inicio.getMonth());
  const indice = Math.max(0, Math.floor(mesesNaFase / 3));
  const candidato = [...blocos]
    .filter((b) => b.indice <= indice)
    .sort((a, b) => b.indice - a.indice)[0];
  if (!candidato) return padrao;
  return {
    crescimento: candidato.taxa_crescimento_mensal ?? padrao.crescimento,
    churn: candidato.taxa_churn_mensal ?? padrao.churn,
  };
}

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

const subgrupoParaGrupo = (
  sub: SubgrupoConta,
): "cogs" | "sm" | "pd" | "ga" | "outros" => {
  if (sub === "suporte" || sub === "infraestrutura" || sub === "outros_cogs")
    return "cogs";
  if (sub === "marketing" || sub === "vendas" || sub === "outros_sm")
    return "sm";
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
  /** Gatilho por fase do ciclo de vida — usado quando nem `data_disponibilidade` nem `meses_apos_lancamento` são definidos. */
  fase_lancamento: FaseValue | null;
  /** Gatilho por tempo: quantos meses após o lançamento comercial do produto o módulo entra (ex: melhorias do Fashion Mind, 12/24 meses). Usado quando `data_disponibilidade` não é definida; tem prioridade sobre `fase_lancamento`. */
  meses_apos_lancamento: number | null;
  /** Gatilho por data exata (mês) em que o módulo passa a estar disponível — tem prioridade sobre os outros dois quando definido. */
  data_disponibilidade: string | null;
  adesao_inicial_pct: number;
  crescimento_adesao_mensal_pct: number;
  /** Teto da curva de adesão — a % pra onde ela converge (em vez de sempre ir a 100%). Null = 100%. */
  percentual_permanencia_estimado: number | null;
  /** Reajuste único: preço × (1 + pct) a partir de `reajuste_apos_meses` meses depois do lançamento do módulo. */
  reajuste_pct: number | null;
  reajuste_apos_meses: number | null;
  /** Beta testers do módulo — sempre testam ANTES do lançamento oficial, sem pagar; convertem no mês do lançamento. */
  betaTesters: BetaModuloInput[];
};

export type ComboInput = {
  /** % da base de clientes (dos produtos do combo) que compra no formato combo. */
  percentual_clientes_combo: number;
  desconto_pct: number;
  /** Combo só é vendável a partir do lançamento do último produto que o compõe. */
  ativo_a_partir_de: string | null;
};

export type FormaPagamentoImplementacao = {
  /** Número de parcelas mensais (1 = à vista). */
  parcelas: number;
  /** Fatia dos clientes novos que paga assim (0 a 1; normalizada pela soma das formas). */
  pct: number;
  /** Desconto sobre o preço pra quem escolhe esta forma (0 a 1), ex: à vista com 10% off. */
  desconto?: number | null;
};

export type ImplementacaoInput = {
  /** Cobrança única na primeira contratação do produto — módulo adicionado depois não cobra de novo. */
  preco_venda: number;
  /** Em quantas parcelas mensais a cobrança é diluída (1 = à vista). Vale quando não há formas. */
  parcelas: number;
  /** Mix de formas de pagamento (ex: 30% à vista, 30% em 3×, 20% em 5×, 20% em 10×). */
  formas?: FormaPagamentoImplementacao[] | null;
  /** Custo direto de entregar a implementação (soma das etapas) — entra em COGS. */
  custo_total: number;
};

export type CanalParceiroFaseInput = {
  fase: FaseValue;
  /** Quantos parceiros NOVOS entram nessa fase (não é acumulado) — cada leva começa sua própria
   * curva de intensidade a partir do início da fase. */
  quantidade_parceiros: number;
};

export type CanalInput = {
  tipo_canal: "direto" | "self_service" | "representante" | "associacao";
  /** % sobre a receita mensal dos clientes desse canal, pago todo mês enquanto forem clientes. */
  comissao_pct: number | null;
  /** Pago uma vez, por cada novo cliente que entra por esse canal. */
  valor_fixo_fechamento: number | null;
  /** Desconto aplicado ao preço pago pelos clientes desse canal. */
  desconto_cliente_pct: number | null;
  /** Duração do desconto em meses — null/associação = permanente (nunca expira). */
  desconto_cliente_meses: number | null;
  /** Crédito único, no fechamento — reduz receita (destino cliente) ou soma custo (destino parceiro). */
  credito_uso_valor: number | null;
  credito_uso_destino: "cliente" | "parceiro" | null;
  /** Clientes desse canal ficam de fora do custo "único por cliente" (implementação/onboarding). */
  isencao_implementacao: boolean;
  /** Desconto na implementação pra cliente vindo deste canal. A isenção é o caso de 100%. */
  desconto_implementacao_pct: number | null;
  /** Custo de ENTREGAR a implantação pra cliente deste canal, quando as etapas diferem do padrão
   *  (ex.: consultor parceiro já implanta a metodologia → menos horas). null = custo_total. */
  custo_implementacao_por_cliente: number | null;
  /** Média de clientes/mês que um parceiro novo traz logo no início da parceria. */
  media_clientes_parceiro_inicial: number | null;
  /** Queda mensal (%) sobre a intensidade atual, até chegar no piso mínimo. */
  queda_intensidade_mensal_pct: number | null;
  /** Piso mínimo de clientes/mês por parceiro — a intensidade nunca cai abaixo disso. */
  media_clientes_parceiro_minima: number | null;
  /**
   * Fatia da produção deste canal que vai para ESTE produto (0 a 1), vinda do "% das vendas" da
   * matriz do canal, normalizado entre os produtos dele. Sem isso, os mesmos parceiros gerariam
   * o volume inteiro para cada produto do portfólio — multiplicando os clientes.
   */
  peso_no_canal: number;
  /** Self-service: quanto custa de mídia levar uma pessoa a iniciar o teste grátis. */
  custo_por_trial: number | null;
  /** Self-service: quantos testes iniciados viram cliente pagante. */
  taxa_conversao_trial: number | null;
  parceirosPorFase: CanalParceiroFaseInput[];
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
  tipo_calculo:
    | "percentual_receita"
    | "valor_por_cliente"
    | "valor_fixo"
    | "unico_por_cliente";
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
  canais: CanalInput[];
  /**
   * true em produto de NÍVEIS (Basic → Starter → Premium), onde o cliente está em um plano só e
   * `preco` é o valor total daquele nível. false em módulos add-on clássicos, que se somam ao
   * plano base — aí somar os preços é o comportamento certo.
   */
  modulosExclusivos: boolean;
  /** Fim do período do cenário — a projeção para aqui em vez de rodar 60 meses fixos por produto. */
  dataFimCenario: string | null;
  /** Combos em que este produto entra — o desconto é lançado aqui, no próprio produto, pra que a
   * margem bruta de cada um fique medível. */
  combos: ComboInput[];
  implementacao: ImplementacaoInput | null;
  /** Regras de escala do COGS por conta (1.1.x). Sem isso, COGS vem só dos custos lançados à mão. */
  cogs?: CogsPremissas | null;
  /** Custo/hora por perfil (cargo × contratação × senioridade) — pra suporte e CS proativo. */
  custoHoraPorPerfil?: (perfil: Partial<PerfilCustoHora>) => number;
  custosFixos: CustoFixoInput[];
  custosVariaveis: CustoVariavelInput[];
  meses?: number;
  /**
   * Cenário espelhado que começa depois do produto: no mês `mes` (início do cenário) a base de
   * clientes passa a ser `clientes_ativos` — o saldo do cenário de origem naquele ponto, editável.
   * Os meses anteriores continuam sendo simulados (módulos, canais e betas seguem o calendário),
   * só o estoque de clientes é substituído. Sem isso, vale a base que a própria simulação acumulou.
   */
  pontoPartida?: { mes: string; clientes_ativos: number } | null;
  /** Vendas fechadas em feiras e eventos (já distribuídas por mês) — entram no canal direto. */
  vendasAcoes?: VendaAcaoInput[];
};

export type VendaAcaoInput = {
  mes: string;
  clientes: number;
  /** Plano/nível fechado. A receita desses clientes usa o preço dele (em vez do preço médio do
   * mix), e o lote vai encolhendo com o churn do produto. Sem plano, vale o mix. */
  plano: { tipo: "plano" | "modulo"; indice: number } | null;
};

export type MesResultado = {
  mes_referencia: string;
  novos_clientes: number;
  /** Quebra dos clientes novos por origem — "direto" é o que não veio de parceiro (crescimento
   * próprio + conversão de beta). */
  novos_direto: number;
  novos_representante: number;
  novos_associacao: number;
  /** Quantos clientes saíram no mês — o % de churn sozinho não mostra o tamanho da perda. */
  clientes_perdidos: number;
  clientes_ativos: number;
  beta_testers_ativos: number;
  mrr: number;
  churn_pct: number | null;
  cac_all_in: number | null;
  ltv: number | null;
  receita_bruta: number;
  receita_modulos: number;
  /** Parcelas de implementação faturadas no mês, já líquidas do desconto de cada canal. */
  receita_implementacao: number;
  /** Quantas implementações estão em cobrança no mês — uma por cliente em andamento. */
  implementacoes_ativas: number;
  /** Implantações vendidas no mês (clientes novos que pagam implementação, sem os isentos). */
  novas_implementacoes: number;
  cogs: number;
  opex_sm: number;
  opex_pd: number;
  opex_ga: number;
  ebitda: number;
  cogs_suporte: number;
  cogs_infraestrutura: number;
  cogs_outros: number;
  // Detalhe do COGS calculado por regra (uma linha por conta do plano de contas).
  cogs_llm: number;
  cogs_software: number;
  cogs_gateway: number;
  cogs_cs_proativo: number;
  cogs_suporte_reativo: number;
  sm_marketing: number;
  sm_vendas: number;
  sm_outros: number;
  /** Mensalidade de tabela de uma venda nova no mês: planos pelo mix + níveis/módulos pela adesão.
   * Sem descontos e sem implementação — é o preço de venda, não o ticket médio (receita ÷ clientes). */
  preco_medio_venda: number | null;
  /** Clientes novos vindos de feiras e eventos (já incluídos em novos_direto). */
  novos_acoes: number;
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
      return (
        mes >= new Date(inicio.getFullYear(), inicio.getMonth(), 1) &&
        mes <= fim
      );
    })
    .sort((a, b) => (a.data_inicio! < b.data_inicio! ? 1 : -1));
  if (dentro[0]) return dentro[0];

  // Fora de qualquer intervalo definido: usa a última fase cujo início já passou.
  const passadas = fases
    .filter(
      (f) => f.data_inicio && new Date(f.data_inicio + "T00:00:00") <= mes,
    )
    .sort((a, b) => (a.data_inicio! < b.data_inicio! ? 1 : -1));
  return passadas[0] ?? null;
}

const FASE_ORDEM: FaseValue[] = FASES.map((f) => f.value);

/** Preço efetivo do plano na fase/mês atual: aplica override por fase e reajuste anual. */
function precoEfetivo(
  plano: PlanoInput,
  fase: FaseValue,
  mes: Date,
  dataLancamento: string | null,
): number {
  let preco = plano.preco;

  const idxAtual = FASE_ORDEM.indexOf(fase);
  const entradasFase = (
    Object.entries(plano.precos_por_fase) as [FaseValue, number][]
  )
    .filter(([f]) => FASE_ORDEM.indexOf(f) <= idxAtual)
    .sort((a, b) => FASE_ORDEM.indexOf(b[0]) - FASE_ORDEM.indexOf(a[0]));
  if (entradasFase.length > 0) preco = entradasFase[0][1];

  if (plano.reajuste_anual_pct && dataLancamento) {
    const lanc = new Date(dataLancamento + "T00:00:00");
    const mesesDesdeLancamento =
      (mes.getFullYear() - lanc.getFullYear()) * 12 +
      (mes.getMonth() - lanc.getMonth());
    const anos = Math.floor(mesesDesdeLancamento / 12);
    if (anos >= 1) preco *= Math.pow(1 + plano.reajuste_anual_pct, anos);
  }

  return preco;
}

/** ARPU mensal equivalente, ponderado pelo mix percentual de cada plano, na fase/mês atual. */
function calcularArpu(
  planos: PlanoInput[],
  fase: FaseValue,
  mes: Date,
  dataLancamento: string | null,
): number {
  const comMix = planos.filter((p) => p.mix_percentual != null);
  if (comMix.length === 0) return 0;

  const somaMix = comMix.reduce((acc, p) => acc + Number(p.mix_percentual), 0);
  if (somaMix <= 0) return 0;

  return comMix.reduce((acc, p) => {
    // `preco` é sempre o valor mensal, independente da cobrança — "anual"/"semestral" definem só o
    // tempo mínimo de permanência do cliente (compromisso), não o valor digitado.
    const mensal = precoEfetivo(p, fase, mes, dataLancamento);
    return acc + mensal * (Number(p.mix_percentual) / somaMix);
  }, 0);
}

type Totais = {
  cogs: number;
  sm: number;
  pd: number;
  ga: number;
  suporte: number;
  infraestrutura: number;
  outros_cogs: number;
  marketing: number;
  vendas: number;
  outros_sm: number;
};

function novoTotais(): Totais {
  return {
    cogs: 0,
    sm: 0,
    pd: 0,
    ga: 0,
    suporte: 0,
    infraestrutura: 0,
    outros_cogs: 0,
    marketing: 0,
    vendas: 0,
    outros_sm: 0,
  };
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
function custoContratacoesNoMes(
  contratacoes: ContratacaoInput[],
  mes: Date,
): Totais {
  const totais = novoTotais();
  for (const c of contratacoes) {
    const inicio = c.data_inicio ? new Date(c.data_inicio + "T00:00:00") : null;
    const fim = c.data_fim ? new Date(c.data_fim + "T00:00:00") : null;
    const iniciouAntes =
      !inicio || new Date(inicio.getFullYear(), inicio.getMonth(), 1) <= mes;
    const aindaAtiva = !fim || fim >= mes;
    if (iniciouAntes && aindaAtiva)
      acumular(totais, subgrupoDeCargo(c.cargo, c.categoria), c.custo_mensal);
  }
  return totais;
}

/** Formas de pagamento normalizadas (frações somando 1). Sem mix válido, todos pagam em `parcelas`. */
export function formasDePagamento(
  impl: ImplementacaoInput,
): { parcelas: number; fracao: number; desconto: number }[] {
  const formas = (impl.formas ?? []).filter(
    (f) => f.pct > 0 && f.parcelas >= 1,
  );
  const soma = formas.reduce((s, f) => s + f.pct, 0);
  if (formas.length === 0 || soma <= 0)
    return [{ parcelas: Math.max(1, impl.parcelas), fracao: 1, desconto: 0 }];
  return formas.map((f) => ({
    parcelas: f.parcelas,
    fracao: f.pct / soma,
    desconto: Math.min(1, Math.max(0, f.desconto ?? 0)),
  }));
}

export function calcularSimulacao(input: SimulacaoInput): MesResultado[] {
  const dataBase =
    input.dataInicioProduto ??
    input.fases.find((f) => f.data_inicio)?.data_inicio;
  if (!dataBase) return [];

  // A projeção vai até o fim do período do cenário. Sem isso, cada produto rodava 60 meses a
  // partir da PRÓPRIA data de início — e como as datas diferem, os produtos sumiam da projeção em
  // meses diferentes, o que parecia uma queda de faturamento no último ano.
  const totalMeses = (() => {
    if (input.dataFimCenario) {
      const inicio = new Date(dataBase + "T00:00:00");
      const fim = new Date(input.dataFimCenario + "T00:00:00");
      const meses =
        (fim.getFullYear() - inicio.getFullYear()) * 12 +
        (fim.getMonth() - inicio.getMonth()) +
        1;
      if (meses > 0) return meses;
    }
    return input.meses ?? 60;
  })();

  let clientesAtivos = 0;

  // Cliente é unidade indivisível: não entra nem sai meio cliente. Mas truncar a fração todo mês
  // enviesaria a projeção pra baixo, e arredondar entrada e saída isoladamente faz elas se
  // cancelarem em base pequena (base 5: crescimento 1,15→1 e churn 0,5→1, net zero pra sempre).
  // Por isso guardamos a sobra de cada fluxo e ela entra no mês seguinte: cada mês é inteiro e o
  // acumulado do período bate com a matemática contínua.
  const residuos = new Map<string, number>();
  const inteiroComResiduo = (valor: number, chave: string) => {
    const comSobra = valor + (residuos.get(chave) ?? 0);
    const inteiro = Math.max(0, Math.round(comSobra));
    residuos.set(chave, comSobra - inteiro);
    return inteiro;
  };
  let betaAtivos = 0;
  const adocaoModulos = new Map<number, number>();
  // Beta testers de módulo: convertem no mês do lançamento oficial. Enquanto durar a condição
  // especial (se houver), pagam com desconto; depois disso somam-se aos "permanentes" (preço cheio).
  const moduloJaLancado = new Set<number>();
  const betaModuloPermanentes = new Map<number, number>();
  let betaModuloComDesconto: {
    moduloIdx: number;
    quantidade: number;
    desconto: number;
    mesFim: number;
  }[] = [];
  // Clientes que converteram do beta e ainda estão dentro da janela de condição especial
  // (desconto por tempo limitado) — cada entrada é um lote independente, escopado à fase/beta
  // que a originou, sem acumular com outras condições de outras fases ou módulos.
  let condicoesEspeciaisAtivas: {
    quantidade: number;
    desconto: number;
    mesFim: number;
  }[] = [];
  // Canais de parceiro (representante/associação): cada lote de clientes trazido num mês carrega
  // seu próprio desconto e prazo — associação normalmente entra com mesFim=Infinity (permanente).
  let descontosCanalAtivos: {
    quantidade: number;
    desconto: number;
    mesFim: number;
  }[] = [];
  // Crédito de uso concedido ao cliente vira SALDO, não desconto de um mês só: R$100 num produto
  // de R$109 é quase um mês grátis; no de R$61, quase dois. Deduzir tudo no mês de entrada
  // estouraria a receita daquele mês e o excedente se perderia.
  let saldoCreditoCliente = 0;
  // Total acumulado de clientes já trazidos por cada canal (índice em input.canais), sem descontar
  // por churn — mesma simplificação já usada nos lotes de beta — usado pra cobrar comissão
  // recorrente sobre a receita atual desses clientes.
  const canalClientesAcumulados = new Map<number, number>();
  // Parcelas de implementação ainda em aberto — cada leva de clientes novos gera uma, diluída
  // pelo número de parcelas contratado.
  let parcelasImplementacaoAtivas: {
    valorMensal: number;
    quantidade: number;
    mesFim: number;
  }[] = [];
  /** Índices dos lotes de beta que já viraram clientes pagantes — cada lote converte uma vez só. */
  const betasConvertidos = new Set<number>();
  // Feiras e eventos: venda fechada antes do lançamento fica guardada e entra no mês em que o
  // produto lança (não há o que cobrar antes). Cada lote com plano definido paga o preço daquele
  // plano/nível e vai encolhendo com o churn do produto.
  let vendasAcoesAguardando: VendaAcaoInput[] = [];
  let lotesPlanoAcoes: {
    quantidade: number;
    plano: { tipo: "plano" | "modulo"; indice: number };
  }[] = [];
  const resultados: MesResultado[] = [];

  const mesPontoPartida = input.pontoPartida
    ? `${input.pontoPartida.mes.slice(0, 7)}-01`
    : null;

  // Índice do mês em que cada módulo entrou — base do reajuste "N meses depois do lançamento".
  const mesLancamentoModulo = new Map<number, number>();
  for (let i = 0; i < totalMeses; i++) {
    const mes = addMonths(dataBase, i);
    const fase = faseParaMes(input.fases, mes);

    // Saldo de abertura do cenário: substitui a base acumulada antes de o mês ser calculado.
    if (mesPontoPartida && isoMonth(mes) === mesPontoPartida) {
      clientesAtivos = Math.max(
        0,
        Math.round(input.pontoPartida!.clientes_ativos),
      );
    }

    if (!fase) {
      resultados.push({
        mes_referencia: isoMonth(mes),
        novos_clientes: 0,
        novos_direto: 0,
        novos_representante: 0,
        novos_associacao: 0,
        clientes_perdidos: 0,
        clientes_ativos: 0,
        beta_testers_ativos: 0,
        mrr: 0,
        churn_pct: null,
        cac_all_in: null,
        ltv: null,
        receita_bruta: 0,
        receita_modulos: 0,
        receita_implementacao: 0,
        implementacoes_ativas: 0,
        novas_implementacoes: 0,
        cogs: 0,
        opex_sm: 0,
        opex_pd: 0,
        opex_ga: 0,
        ebitda: 0,
        cogs_suporte: 0,
        cogs_infraestrutura: 0,
        cogs_outros: 0,
        cogs_llm: 0,
        cogs_software: 0,
        cogs_gateway: 0,
        cogs_cs_proativo: 0,
        cogs_suporte_reativo: 0,
        sm_marketing: 0,
        sm_vendas: 0,
        sm_outros: 0,
        preco_medio_venda: null,
        novos_acoes: 0,
      });
      continue;
    }

    // Taxa do trimestre da fase em que o mês cai (ou a da fase, se não houver bloco).
    const { crescimento: taxaCrescimento, churn: taxaChurn } = taxasDoMes(
      fase,
      mes,
    );

    // Pró-rata no mês exato do lançamento comercial (meio do mês civil).
    let fatorProRata = 1;
    if (input.dataLancamentoEstimada) {
      const lanc = new Date(input.dataLancamentoEstimada + "T00:00:00");
      if (
        lanc.getFullYear() === mes.getFullYear() &&
        lanc.getMonth() === mes.getMonth()
      ) {
        const totalDias = daysInMonth(mes);
        fatorProRata = (totalDias - lanc.getDate() + 1) / totalDias;
      }
    }

    // Meses desde o lançamento comercial do produto — usado pelo beta, por reajustes e por
    // módulos com gatilho por tempo.
    let mesesDesdeLancamentoProduto: number | null = null;
    if (input.dataLancamentoEstimada) {
      const lanc = new Date(input.dataLancamentoEstimada + "T00:00:00");
      mesesDesdeLancamentoProduto =
        (mes.getFullYear() - lanc.getFullYear()) * 12 +
        (mes.getMonth() - lanc.getMonth());
    }

    // Beta testers viram clientes pagantes no LANÇAMENTO ou no FIM DO PRÓPRIO TESTE — o que vier
    // depois. Antes a conversão era sempre no mês do lançamento, o que gerava cliente pagante antes
    // de o teste ter começado quando as datas do beta caíam depois do lançamento.
    const mesAtualIso = isoMonth(mes).slice(0, 7);
    const mesLancamento = input.dataLancamentoEstimada?.slice(0, 7) ?? null;
    let conversaoBeta = 0;

    if (mesLancamento) {
      input.betas.forEach((beta, bi) => {
        if (betasConvertidos.has(bi)) return;
        const mesFimTeste = beta.data_fim?.slice(0, 7) ?? mesLancamento;
        const mesConversao =
          mesFimTeste > mesLancamento ? mesFimTeste : mesLancamento;
        if (mesAtualIso < mesConversao) return;

        betasConvertidos.add(bi);
        conversaoBeta += beta.quantidade;
        if (beta.condicao_especial_pct && beta.condicao_especial_meses) {
          condicoesEspeciaisAtivas.push({
            quantidade: beta.quantidade,
            desconto: beta.condicao_especial_pct,
            mesFim: i + beta.condicao_especial_meses,
          });
        }
      });
    }

    // Beta ativo = já começou a testar e ainda não converteu. Recalculado do zero a cada mês pra
    // não acumular o mesmo lote mês após mês.
    betaAtivos = 0;
    input.betas.forEach((beta, bi) => {
      if (betasConvertidos.has(bi)) return;
      if (beta.data_inicio && beta.data_inicio.slice(0, 7) <= mesAtualIso)
        betaAtivos += beta.quantidade;
    });

    // Canais de parceiro (representante/associação) trazem clientes direto, sem funil de leads —
    // diferente do canal "direto" (SDR), já embutido na taxa de crescimento mensal da fase. Cada
    // fase pode ter trazido uma leva nova de parceiros, e cada leva decai a intensidade de
    // clientes/mês com o tempo até um piso, a partir do início daquela fase.
    // Nenhum canal vende antes do produto existir. A curva de parceiros arrancava no início da
    // FASE, então um produto cujo desenvolvimento começa em setembro e só lança em fevereiro
    // aparecia faturando implementação cinco meses antes de ter o que entregar.
    const produtoJaLancado =
      mesLancamento === null || mesAtualIso >= mesLancamento;

    const novosPorCanal: number[] = input.canais.map((canal) => {
      if (!produtoJaLancado) return 0;
      // Só canais de parceiro trazem cliente por curva própria. Direto e self-service vêm da taxa
      // de crescimento da fase.
      if (canal.tipo_canal === "direto" || canal.tipo_canal === "self_service")
        return 0;
      // Canal sem fatia neste produto não traz cliente nenhum pra ele.
      if (canal.peso_no_canal <= 0) return 0;
      let total = 0;
      for (const lote of canal.parceirosPorFase) {
        if (lote.quantidade_parceiros <= 0) continue;
        const faseDoLote = input.fases.find((f) => f.fase === lote.fase);
        if (!faseDoLote?.data_inicio) continue;
        const inicioLote = new Date(faseDoLote.data_inicio + "T00:00:00");
        const idadeMeses =
          (mes.getFullYear() - inicioLote.getFullYear()) * 12 +
          (mes.getMonth() - inicioLote.getMonth());
        if (idadeMeses < 0) continue;
        const inicial = canal.media_clientes_parceiro_inicial ?? 0;
        const queda = canal.queda_intensidade_mensal_pct ?? 0;
        const piso = canal.media_clientes_parceiro_minima ?? 0;
        const intensidadeAtual = Math.max(
          piso,
          inicial * Math.pow(1 - queda, idadeMeses),
        );
        total += lote.quantidade_parceiros * intensidadeAtual;
      }
      // Os parceiros são os mesmos pra todo o portfólio — o que este produto recebe é a fatia dele.
      return total * canal.peso_no_canal;
    });
    // Arredonda por canal (cada um com seu resíduo) para que custo de fechamento, isenção de
    // implementação e a coluna de novos por canal falem todos do mesmo número inteiro.
    for (let ci = 0; ci < novosPorCanal.length; ci++) {
      novosPorCanal[ci] = inteiroComResiduo(novosPorCanal[ci], `canal:${ci}`);
    }
    const novosClientesCanais = novosPorCanal.reduce((a, b) => a + b, 0);
    const novosPorTipoCanal = input.canais.reduce(
      (acc, canal, ci) => {
        if (canal.tipo_canal === "representante")
          acc.representante += novosPorCanal[ci];
        else if (canal.tipo_canal === "associacao")
          acc.associacao += novosPorCanal[ci];
        return acc;
      },
      { representante: 0, associacao: 0 },
    );

    let novosClientesIsentosImplementacao = 0;
    // Quanto vale a implementação dos clientes que entraram neste mês, já com o desconto de cada
    // canal aplicado. Cliente de associação paga menos (ou nada), e é isso que puxa o ticket médio
    // pra baixo — por isso o valor é somado coorte a coorte, não por um preço único.
    let descontoImplementacaoDoMes = 0;
    input.canais.forEach((canal, ci) => {
      if (novosPorCanal[ci] <= 0) return;
      const desconto = canal.isencao_implementacao
        ? 1
        : (canal.desconto_implementacao_pct ?? 0);
      if (desconto > 0)
        descontoImplementacaoDoMes += novosPorCanal[ci] * Math.min(1, desconto);
      if (canal.isencao_implementacao)
        novosClientesIsentosImplementacao += novosPorCanal[ci];
      if (canal.desconto_cliente_pct) {
        descontosCanalAtivos.push({
          quantidade: novosPorCanal[ci],
          desconto: canal.desconto_cliente_pct,
          mesFim:
            canal.desconto_cliente_meses != null
              ? i + canal.desconto_cliente_meses
              : Infinity,
        });
      }
      canalClientesAcumulados.set(
        ci,
        (canalClientesAcumulados.get(ci) ?? 0) + novosPorCanal[ci],
      );
    });

    // Entrada direta (crescimento orgânico + conversão de beta) e saída por churn, cada uma
    // arredondada com seu próprio resíduo. O total de novos é a soma das partes já inteiras,
    // então a coluna "Total novos" sempre bate com direto + representantes + associações.
    // Vendas de feiras e eventos do mês (e, no 1º mês simulado, as de antes dele).
    for (const v of input.vendasAcoes ?? []) {
      const mesVenda = v.mes.slice(0, 7);
      if (mesVenda === mesAtualIso || (i === 0 && mesVenda < mesAtualIso))
        vendasAcoesAguardando.push(v);
    }
    for (const l of lotesPlanoAcoes) l.quantidade *= 1 - taxaChurn;
    lotesPlanoAcoes = lotesPlanoAcoes.filter((l) => l.quantidade > 0.001);
    let clientesAcoes = 0;
    if (produtoJaLancado && vendasAcoesAguardando.length > 0) {
      for (const v of vendasAcoesAguardando) {
        clientesAcoes += v.clientes;
        if (v.plano && v.clientes > 0)
          lotesPlanoAcoes.push({ quantidade: v.clientes, plano: v.plano });
      }
      vendasAcoesAguardando = [];
    }
    const novosAcoes = inteiroComResiduo(clientesAcoes, "acoes");

    const novosOrganicos = clientesAtivos * taxaCrescimento * fatorProRata;
    const novosDireto =
      inteiroComResiduo(novosOrganicos + conversaoBeta, "direto") + novosAcoes;
    const novosClientes = novosDireto + novosClientesCanais;
    const perdidos = Math.min(
      clientesAtivos,
      inteiroComResiduo(clientesAtivos * taxaChurn, "saida"),
    );
    clientesAtivos = Math.max(0, clientesAtivos + novosClientes - perdidos);

    const arpu = calcularArpu(
      input.planos,
      fase.fase,
      mes,
      input.dataLancamentoEstimada,
    );

    // Remove condições especiais já vencidas e desconta, do faturamento normal, os clientes
    // ainda dentro da janela (pagam preço cheio menos o desconto combinado, só nesse período).
    condicoesEspeciaisAtivas = condicoesEspeciaisAtivas.filter(
      (c) => c.mesFim > i,
    );
    const descontoCondicaoEspecial = condicoesEspeciaisAtivas.reduce(
      (acc, c) => acc + c.quantidade * arpu * c.desconto,
      0,
    );

    // Mesmo mecanismo, pros descontos vindos de canal de parceiro (representante/associação).
    descontosCanalAtivos = descontosCanalAtivos.filter((c) => c.mesFim > i);
    const descontoCanalCliente = descontosCanalAtivos.reduce(
      (acc, c) => acc + c.quantidade * arpu * c.desconto,
      0,
    );

    // Crédito de uso concedido ao cliente (associação/representante): entra no saldo quando o
    // cliente chega e é consumido mês a mês até acabar — é isso que faz "usa quase dois meses sem
    // pagar" aparecer como dois meses de receita menor, e não como um buraco só no primeiro.
    input.canais.forEach((canal, ci) => {
      if (
        canal.tipo_canal === "direto" ||
        !canal.credito_uso_valor ||
        novosPorCanal[ci] <= 0
      )
        return;
      if (canal.credito_uso_destino !== "parceiro")
        saldoCreditoCliente += novosPorCanal[ci] * canal.credito_uso_valor;
    });

    const receitaAntesCredito =
      (arpu * clientesAtivos -
        descontoCondicaoEspecial -
        descontoCanalCliente) *
      fatorProRata;
    const creditoConsumido = Math.min(
      saldoCreditoCliente,
      Math.max(0, receitaAntesCredito),
    );
    saldoCreditoCliente -= creditoConsumido;
    const receitaPlanos = receitaAntesCredito - creditoConsumido;

    // Receita de módulos add-on: ativa por fase do ciclo de vida OU por tempo desde o lançamento
    // (ex: melhorias do Fashion Mind, 12/24 meses após o MVP), com adesão inicial sobre a base
    // de clientes e crescimento mensal composto até 100%.
    const faseIdxAtual = FASE_ORDEM.indexOf(fase.fase);
    let receitaModulos = 0;
    // Remove condições especiais de beta de módulo já vencidas, somando o lote ao grupo
    // permanente (preço cheio dali em diante).
    betaModuloComDesconto = betaModuloComDesconto.filter((c) => {
      if (c.mesFim > i) return true;
      betaModuloPermanentes.set(
        c.moduloIdx,
        (betaModuloPermanentes.get(c.moduloIdx) ?? 0) + c.quantidade,
      );
      return false;
    });

    const lancadosNesteMes: number[] = [];
    // Preço do módulo neste mês: o de tabela, ou reajustado depois de N meses do lançamento dele.
    const precoModulo = (mi: number) => {
      const m = input.modulos[mi];
      const desde = mesLancamentoModulo.get(mi);
      if (m.reajuste_pct && m.reajuste_apos_meses != null && desde != null && i - desde >= m.reajuste_apos_meses) {
        return m.preco * (1 + m.reajuste_pct);
      }
      return m.preco;
    };
    input.modulos.forEach((modulo, mi) => {
      const lancado =
        modulo.data_disponibilidade != null
          ? isoMonth(mes).slice(0, 7) >= modulo.data_disponibilidade.slice(0, 7)
          : modulo.meses_apos_lancamento != null
            ? mesesDesdeLancamentoProduto != null &&
              mesesDesdeLancamentoProduto >= modulo.meses_apos_lancamento
            : modulo.fase_lancamento != null &&
              faseIdxAtual >= FASE_ORDEM.indexOf(modulo.fase_lancamento);
      if (!lancado) return;
      if (!mesLancamentoModulo.has(mi)) mesLancamentoModulo.set(mi, i);

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
            betaModuloPermanentes.set(
              mi,
              (betaModuloPermanentes.get(mi) ?? 0) + beta.quantidade,
            );
          }
        }
      }

      const tetoAdocao = modulo.percentual_permanencia_estimado ?? 1;
      let adocaoPct = adocaoModulos.get(mi);
      adocaoPct =
        adocaoPct === undefined
          ? Math.min(tetoAdocao, modulo.adesao_inicial_pct)
          : Math.min(
              tetoAdocao,
              adocaoPct * (1 + modulo.crescimento_adesao_mensal_pct),
            );
      adocaoModulos.set(mi, adocaoPct);
      lancadosNesteMes.push(mi);
    });

    // Em produto de NÍVEIS, o cliente está em UM plano só: quem está no Premium não paga também
    // Basic e Starter. Se as fatias de adesão somarem mais de 100%, normalizamos — sem isso o
    // mesmo cliente era cobrado em todos os níveis lançados, somando os preços.
    let fatorNivelExclusivo = 1;
    if (input.modulosExclusivos && lancadosNesteMes.length > 0) {
      const somaAdocao = lancadosNesteMes.reduce(
        (acc, mi) => acc + (adocaoModulos.get(mi) ?? 0),
        0,
      );
      if (somaAdocao > 1) fatorNivelExclusivo = 1 / somaAdocao;
    }

    // Fatia da base no nível que consome LLM (ex: Premium do Mind) — o custo de API só incide nela.
    let fracaoNivelLlm = 0;
    lancadosNesteMes.forEach((mi) => {
      const modulo = input.modulos[mi];
      const adocaoPct = (adocaoModulos.get(mi) ?? 0) * fatorNivelExclusivo;
      if (
        input.cogs?.llm?.ativo &&
        input.cogs.llm.nivel_nome &&
        modulo.nome === input.cogs.llm.nivel_nome
      ) {
        fracaoNivelLlm = adocaoPct;
      }

      const precoAtual = precoModulo(mi);
      receitaModulos += adocaoPct * clientesAtivos * precoAtual;
      receitaModulos += (betaModuloPermanentes.get(mi) ?? 0) * precoAtual;
      receitaModulos += betaModuloComDesconto
        .filter((c) => c.moduloIdx === mi)
        .reduce(
          (acc, c) => acc + c.quantidade * precoAtual * (1 - c.desconto),
          0,
        );
    });
    receitaModulos *= fatorProRata;

    // Preço médio de venda: mensalidade de tabela de um cliente novo — planos pelo mix + níveis/
    // módulos pela fatia de adesão. Diferente do ticket médio, não carrega desconto nem implementação.
    const precoModulosPorCliente = lancadosNesteMes.reduce(
      (acc, mi) =>
        acc +
        (adocaoModulos.get(mi) ?? 0) *
          fatorNivelExclusivo *
          precoModulo(mi),
      0,
    );
    const precoMedioVenda = arpu + precoModulosPorCliente;

    // Clientes de feira/evento com plano definido pagam o preço daquele plano/nível, não a média:
    // soma a diferença (plano − média do mix) sobre o que resta do lote.
    let ajusteAcoes = 0;
    for (const l of lotesPlanoAcoes) {
      const quantidade = Math.min(l.quantidade, clientesAtivos);
      if (l.plano.tipo === "plano") {
        const plano = input.planos[l.plano.indice];
        if (plano)
          ajusteAcoes +=
            quantidade *
            (precoEfetivo(plano, fase.fase, mes, input.dataLancamentoEstimada) -
              arpu);
      } else if (lancadosNesteMes.includes(l.plano.indice)) {
        ajusteAcoes +=
          quantidade *
          (precoModulo(l.plano.indice) - precoModulosPorCliente);
      }
    }
    ajusteAcoes *= fatorProRata;

    // Receita recorrente do produto (planos + módulos), já líquida dos descontos de beta e canal.
    const receitaRecorrente = receitaPlanos + receitaModulos + ajusteAcoes;

    // Desconto de combo lançado NO PRÓPRIO PRODUTO (não na consolidação do cenário), pra que a
    // margem bruta de cada produto fique medível. Só vale a partir do lançamento do último produto
    // que compõe o combo — antes disso não existe combo pra vender. Não incide sobre implementação.
    let descontoCombo = 0;
    for (const combo of input.combos) {
      if (
        combo.ativo_a_partir_de &&
        isoMonth(mes).slice(0, 7) < combo.ativo_a_partir_de.slice(0, 7)
      )
        continue;
      descontoCombo +=
        receitaRecorrente *
        combo.percentual_clientes_combo *
        combo.desconto_pct;
    }
    const mrrLiquido = Math.max(0, receitaRecorrente - descontoCombo);

    // Implementação: cobrança única na primeira contratação, diluída nas parcelas contratadas.
    // O trabalho é feito para todo cliente novo (custo cheio), mas a receita respeita o desconto
    // do canal por onde ele veio — um isento gera custo e nenhuma receita.
    let receitaImplementacao = 0;
    let implementacoesAtivas = 0;
    let novasImplementacoes = 0;
    let custoImplementacao = 0;
    if (input.implementacao) {
      // Equivalente em clientes pagando preço cheio: 3 clientes com 50% de desconto valem 1,5.
      const pagantesEquivalentes = Math.max(
        0,
        novosClientes - descontoImplementacaoDoMes,
      );
      // Quem tem desconto parcial continua sendo UMA cobrança na contagem; só o isento não paga.
      const cobrancasNovas = Math.max(
        0,
        novosClientes - novosClientesIsentosImplementacao,
      );
      novasImplementacoes = cobrancasNovas;
      if (cobrancasNovas > 0 && input.implementacao.preco_venda > 0) {
        // Cada leva de clientes novos se divide pelo mix de formas de pagamento: cada fatia vira um
        // lote com o seu número de parcelas (e o desconto da forma, se houver). Sem mix, é uma forma só.
        for (const forma of formasDePagamento(input.implementacao)) {
          const parcelas = Math.max(1, Math.round(forma.parcelas));
          parcelasImplementacaoAtivas.push({
            valorMensal:
              (pagantesEquivalentes *
                forma.fracao *
                input.implementacao.preco_venda *
                (1 - forma.desconto)) /
              parcelas,
            quantidade: cobrancasNovas * forma.fracao,
            mesFim: i + parcelas,
          });
        }
      }
      parcelasImplementacaoAtivas = parcelasImplementacaoAtivas.filter(
        (p) => p.mesFim > i,
      );
      receitaImplementacao = parcelasImplementacaoAtivas.reduce(
        (acc, p) => acc + p.valorMensal,
        0,
      );
      implementacoesAtivas = parcelasImplementacaoAtivas.reduce(
        (acc, p) => acc + p.quantidade,
        0,
      );
      // Cada canal entrega a implantação com as suas etapas: o cliente que vem por consultor já
      // chega com a metodologia implantada, então custa menos. Direto e ações usam o padrão.
      let novosComCustoProprio = 0;
      input.canais.forEach((canal, ci) => {
        if (
          novosPorCanal[ci] <= 0 ||
          canal.custo_implementacao_por_cliente == null
        )
          return;
        custoImplementacao +=
          novosPorCanal[ci] * canal.custo_implementacao_por_cliente;
        novosComCustoProprio += novosPorCanal[ci];
      });
      custoImplementacao +=
        Math.max(0, novosClientes - novosComCustoProprio) *
        input.implementacao.custo_total;
    }

    const receitaBruta = mrrLiquido + receitaImplementacao;

    // Custo real das contratações (CLT + PJ) ativas neste mês, já separado por categoria fina.
    const totais = custoContratacoesNoMes(input.contratacoes, mes);

    // Custo direto de entregar a implementação — COGS, lançado inteiro no mês do onboarding
    // (o trabalho acontece ali, mesmo quando o cliente paga parcelado).
    if (custoImplementacao > 0)
      acumular(totais, "outros_cogs", custoImplementacao);

    // COGS por regra de escala (infra, LLM, suporte, CS, software, gateway) — ver src/lib/cogs.ts.
    // Cada cobrança do mês (assinatura + parcela de implementação) passa pelo gateway.
    const cogsMes = calcularCogsMes(input.cogs, {
      mes: isoMonth(mes),
      clientesAtivos,
      fracaoNivelLlm,
      transacoes: clientesAtivos + implementacoesAtivas,
      receitaCobrada: receitaBruta,
      custoHora: input.custoHoraPorPerfil ?? (() => 0),
    });
    acumular(totais, "infraestrutura", cogsMes.infraestrutura);
    acumular(
      totais,
      "outros_cogs",
      cogsMes.llm + cogsMes.software + cogsMes.gateway,
    );
    acumular(totais, "suporte", cogsMes.suporteReativo + cogsMes.csProativo);

    // COGS e OPEX a partir do plano de custos da fase (equipe alocada + custos fixos/variáveis).
    for (const c of input.custosFixos.filter((c) => c.fase === fase.fase)) {
      acumular(totais, c.subgrupo, c.quantidade * c.valor_unitario);
    }

    for (const a of input.alocacoes.filter((a) => a.fase === fase.fase)) {
      const custo = a.quantidade_funcionarios * a.horas_mes * a.custo_hora;
      acumular(totais, subgrupoDeCargo(a.cargo, a.categoria), custo);
    }

    // Comissão, valor fixo de fechamento e crédito pro parceiro — custo de vendas dos canais de
    // parceiro. Comissão recorre todo mês sobre o total já acumulado de clientes daquele canal
    // (mesma simplificação dos lotes de beta: não desconta por churn); valor fixo e crédito pro
    // parceiro são únicos, cobrados só no mês em que o cliente entra.
    // Self-service: ninguém prospecta, mas o tráfego é pago. O custo é a mídia necessária pra
    // encher o teste grátis — testes = clientes do canal ÷ conversão do teste. Vai pra marketing,
    // não pra vendas, porque é verba de mídia e não remuneração de quem vende.
    input.canais.forEach((canal, ci) => {
      if (canal.tipo_canal !== "self_service") return;
      if (canal.peso_no_canal <= 0 || !canal.custo_por_trial) return;
      const novosDoCanal = novosDireto * canal.peso_no_canal;
      if (novosDoCanal <= 0) return;
      const conversaoTrial =
        canal.taxa_conversao_trial && canal.taxa_conversao_trial > 0
          ? canal.taxa_conversao_trial
          : 1;
      const trials = novosDoCanal / conversaoTrial;
      acumular(totais, "marketing", trials * canal.custo_por_trial);
    });

    input.canais.forEach((canal, ci) => {
      if (canal.tipo_canal === "direto" || canal.tipo_canal === "self_service")
        return;
      let custoCanal = 0;
      const acumuladoCanal = canalClientesAcumulados.get(ci) ?? 0;
      if (canal.comissao_pct && acumuladoCanal > 0)
        custoCanal += acumuladoCanal * arpu * canal.comissao_pct;
      if (novosPorCanal[ci] > 0) {
        if (canal.valor_fixo_fechamento)
          custoCanal += novosPorCanal[ci] * canal.valor_fixo_fechamento;
        if (canal.credito_uso_valor && canal.credito_uso_destino === "parceiro")
          custoCanal += novosPorCanal[ci] * canal.credito_uso_valor;
      }
      if (custoCanal > 0) acumular(totais, "vendas", custoCanal);
    });

    for (const c of input.custosVariaveis.filter((c) => c.fase === fase.fase)) {
      // "por cliente" é recorrente (cobra de novo, todo mês, sobre a base inteira de clientes
      // ativos) — serve pra custo tipo gateway/hospedagem por cliente. "único por cliente" cobra
      // só uma vez, no mês em que o cliente é adquirido (ex: custo de implementação/onboarding) —
      // exceto os clientes de canais com isenção de implementação, que ficam de fora dessa base.
      const baseUnicoPorCliente = Math.max(
        0,
        novosClientes - novosClientesIsentosImplementacao,
      );
      const valor =
        c.tipo_calculo === "valor_fixo"
          ? (c.valor_base ?? 0)
          : c.tipo_calculo === "valor_por_cliente"
            ? (c.valor_base ?? 0) + (c.valor_por_unidade ?? 0) * clientesAtivos
            : c.tipo_calculo === "unico_por_cliente"
              ? (c.valor_por_unidade ?? 0) * baseUnicoPorCliente
              : (c.percentual ?? 0) * receitaBruta;
      acumular(totais, c.subgrupo, valor);
    }

    // CAC all-in: todo o investimento em S&M da fase (equipe comercial contratada + equipe
    // alocada + custos fixos/variáveis categorizados como S&M) dividido pelos clientes novos.
    const cacAllIn = novosClientes > 0 ? totais.sm / novosClientes : null;

    // LTV = mensalidade por cliente × margem bruta ÷ churn mensal. A mensalidade vem do MRR
    // REALIZADO dividido pelos clientes ativos, não do `arpu` de tabela: `arpu` só existe em produto
    // precificado por planos com mix (calcularArpu), e num produto por módulos/níveis — o caso do
    // Fashion Mind — ele é zero, o que zerava o LTV inteiro. O MRR por cliente funciona nos dois
    // formatos e já reflete descontos e níveis contratados.
    const mensalidadePorCliente =
      clientesAtivos > 0 ? mrrLiquido / clientesAtivos : arpu;
    const margemBrutaProduto =
      receitaBruta > 0
        ? Math.max(0, (receitaBruta - totais.cogs) / receitaBruta)
        : 1;
    // Churn zero (plano anual antes de completar 12 meses) não significa LTV zero: significa que a
    // conta não se aplica ainda — ninguém pode sair. Fica nulo, e as telas tiram esses meses da média.
    const ltv =
      taxaChurn > 0
        ? (mensalidadePorCliente * margemBrutaProduto) / taxaChurn
        : null;

    resultados.push({
      mes_referencia: isoMonth(mes),
      novos_clientes: novosClientes,
      novos_direto: novosDireto,
      novos_representante: novosPorTipoCanal.representante,
      novos_associacao: novosPorTipoCanal.associacao,
      clientes_perdidos: perdidos,
      clientes_ativos: clientesAtivos,
      beta_testers_ativos: betaAtivos,
      // MRR é só o recorrente — implementação é cobrança única, entra em receita_bruta mas não aqui.
      mrr: mrrLiquido,
      receita_implementacao: receitaImplementacao,
      // Quantas parcelas de implementação estão sendo cobradas neste mês (uma por cliente em
      // andamento) — é o denominador extra do ticket médio, junto das assinaturas.
      implementacoes_ativas: implementacoesAtivas,
      novas_implementacoes: novasImplementacoes,
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
      cogs_llm: cogsMes.llm,
      cogs_software: cogsMes.software,
      cogs_gateway: cogsMes.gateway,
      cogs_cs_proativo: cogsMes.csProativo,
      cogs_suporte_reativo: cogsMes.suporteReativo,
      sm_marketing: totais.marketing,
      sm_vendas: totais.vendas,
      sm_outros: totais.outros_sm,
      preco_medio_venda: precoMedioVenda > 0 ? precoMedioVenda : null,
      novos_acoes: novosAcoes,
    });
  }

  return resultados;
}

export { FASES };
