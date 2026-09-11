/**
 * COGS que escala com a base — uma regra por conta do plano de contas (1.1.x). Tudo aqui é
 * função pura de (premissas, estado do mês) → R$, pra ser testável fora do motor e pra cada
 * linha do Plano de Custos conseguir explicar de onde veio o número.
 */

export type PerfilCustoHora = { cargo: string; tipo_contratacao: string; senioridade: string };

export type CogsPremissas = {
  /** 1.1.1 — plataforma (Supabase/Vercel/...) com base fixa que sobe em degraus + incremento por cliente. */
  infra?: {
    /** Mês a partir do qual a infra custa (YYYY-MM-DD). Antes disso, plano gratuito = 0. */
    inicio?: string | null;
    base_mensal?: number;
    por_cliente_mes?: number;
    degraus?: { a_partir_de_clientes: number; base_mensal: number }[];
  };
  /** 1.1.2 — LLM só pros clientes de um nível (Premium do Mind): tokens/mês × preço por milhão × câmbio. */
  llm?: {
    ativo?: boolean;
    nivel_nome?: string;
    tokens_entrada_mes?: number;
    tokens_saida_mes?: number;
    preco_milhao_entrada_usd?: number;
    preco_milhao_saida_usd?: number;
    cambio?: number;
  };
  /** 1.1.3 — suporte reativo: (taxa de chamados × TMA) × margem, em horas por cliente, × custo/hora. */
  suporte?: {
    /** Mês a partir do qual o suporte é pago. Antes, quem atende é a equipe atual, sem custo extra. */
    inicio?: string | null;
    taxa_chamados_pct?: number;
    tma_horas?: number;
    margem?: number;
  } & Partial<PerfilCustoHora>;
  /** 1.1.3 — CS proativo (régua de relacionamento): (monitoramento + cadência + QBR diluída) × overhead. */
  cs_proativo?: {
    inicio?: string | null;
    ativo?: boolean;
    monitoramento_h?: number;
    cadencia_h?: number;
    qbr_h_mes?: number;
    overhead?: number;
  } & Partial<PerfilCustoHora>;
  /** 1.1.4 — ferramenta de atendimento; modelo interno = 0. */
  software_atendimento?: { custo_mensal?: number; observacao?: string };
  /** 1.1.5 — gateway: mix de meios de pagamento × (fixo por transação + % sobre o valor). */
  gateway?: {
    mix_cartao?: number;
    mix_boleto?: number;
    mix_pix?: number;
    cartao_pct?: number;
    cartao_fixo?: number;
    boleto_fixo?: number;
    pix_fixo?: number;
  };
};

export type CogsEstadoMes = {
  /** Mês de referência (YYYY-MM-01) — pra respeitar o "a partir de" de cada regra. */
  mes?: string;
  clientesAtivos: number;
  /** Fatia da base no nível que usa LLM (0–1). */
  fracaoNivelLlm: number;
  /** Cobranças do mês: assinaturas + parcelas de implementação (cada uma passa pelo gateway). */
  transacoes: number;
  /** Valor total que passa pelo gateway no mês. */
  receitaCobrada: number;
  /** Custo/hora de um perfil, vindo da tabela de custo/hora. */
  custoHora: (perfil: Partial<PerfilCustoHora>) => number;
};

export type CogsResultado = {
  infraestrutura: number;
  llm: number;
  suporteReativo: number;
  csProativo: number;
  software: number;
  gateway: number;
  /** Horas — úteis pra dimensionar equipe em Necessidade de Contratação. */
  horasSuporte: number;
  horasCs: number;
};

/** Base da plataforma no mês: o maior degrau já atingido pela base, senão a base inicial. */
export function infraBaseNoMes(infra: CogsPremissas["infra"], clientes: number): number {
  const degraus = [...(infra?.degraus ?? [])].sort((a, b) => a.a_partir_de_clientes - b.a_partir_de_clientes);
  let base = infra?.base_mensal ?? 0;
  for (const d of degraus) if (clientes >= d.a_partir_de_clientes) base = d.base_mensal;
  return base;
}

export function horasSuportePorCliente(s: CogsPremissas["suporte"]): number {
  return (s?.taxa_chamados_pct ?? 0) * (s?.tma_horas ?? 0) * (s?.margem ?? 1);
}

export function horasCsPorCliente(c: CogsPremissas["cs_proativo"]): number {
  if (!c?.ativo) return 0;
  return ((c.monitoramento_h ?? 0) + (c.cadencia_h ?? 0) + (c.qbr_h_mes ?? 0)) * (c.overhead ?? 1);
}

export function custoLlmPorCliente(l: CogsPremissas["llm"]): number {
  if (!l?.ativo) return 0;
  const entrada = ((l.tokens_entrada_mes ?? 0) / 1_000_000) * (l.preco_milhao_entrada_usd ?? 0);
  const saida = ((l.tokens_saida_mes ?? 0) / 1_000_000) * (l.preco_milhao_saida_usd ?? 0);
  return (entrada + saida) * (l.cambio ?? 1);
}

/** A regra já vale neste mês? Sem "inicio", vale sempre. Compara só ano-mês. */
export function regraAtiva(inicio: string | null | undefined, mes: string | undefined): boolean {
  if (!inicio || !mes) return true;
  return mes.slice(0, 7) >= inicio.slice(0, 7);
}

export function calcularCogsMes(p: CogsPremissas | null | undefined, e: CogsEstadoMes): CogsResultado {
  const vazio: CogsResultado = { infraestrutura: 0, llm: 0, suporteReativo: 0, csProativo: 0, software: 0, gateway: 0, horasSuporte: 0, horasCs: 0 };
  if (!p) return vazio;
  const n = Math.max(0, e.clientesAtivos);

  // 1.1.1 — a base fixa existe mesmo com zero clientes (a plataforma está no ar); o incremento
  // por cliente cresce linear com a base. Antes do "início" (plano gratuito), zero.
  const infraestrutura =
    regraAtiva(p.infra?.inicio, e.mes) && (n > 0 || (p.infra?.base_mensal ?? 0) > 0)
      ? infraBaseNoMes(p.infra, n) + n * (p.infra?.por_cliente_mes ?? 0)
      : 0;

  // 1.1.2 — só a fatia da base que está no nível com LLM.
  const llm = n * Math.max(0, Math.min(1, e.fracaoNivelLlm)) * custoLlmPorCliente(p.llm);

  // 1.1.3 — horas × custo/hora do perfil escolhido. Antes do "início", a equipe atual absorve
  // o atendimento: as horas existem (aparecem na demanda), mas não viram custo.
  const horasSuporte = n * horasSuportePorCliente(p.suporte);
  const suporteReativo = regraAtiva(p.suporte?.inicio, e.mes) ? horasSuporte * e.custoHora(p.suporte ?? {}) : 0;
  const horasCs = n * horasCsPorCliente(p.cs_proativo);
  const csProativo = regraAtiva(p.cs_proativo?.inicio, e.mes) ? horasCs * e.custoHora(p.cs_proativo ?? {}) : 0;

  // 1.1.4
  const software = n > 0 ? (p.software_atendimento?.custo_mensal ?? 0) : 0;

  // 1.1.5 — cada meio tem sua taxa; o mix diz quantas transações (e quanto do valor) vai por cada.
  const g = p.gateway;
  const somaMix = (g?.mix_cartao ?? 0) + (g?.mix_boleto ?? 0) + (g?.mix_pix ?? 0);
  let gateway = 0;
  if (g && somaMix > 0 && e.transacoes > 0) {
    const fc = (g.mix_cartao ?? 0) / somaMix;
    const fb = (g.mix_boleto ?? 0) / somaMix;
    const fp = (g.mix_pix ?? 0) / somaMix;
    gateway =
      e.transacoes * fc * (g.cartao_fixo ?? 0) + e.receitaCobrada * fc * (g.cartao_pct ?? 0) +
      e.transacoes * fb * (g.boleto_fixo ?? 0) +
      e.transacoes * fp * (g.pix_fixo ?? 0);
  }

  return { infraestrutura, llm, suporteReativo, csProativo, software, gateway, horasSuporte, horasCs };
}


/** Horas de atendimento (suporte reativo + CS proativo) por cliente/mês, por produto — pra
 *  dimensionar a aba Suporte a partir das mesmas regras que geram o custo de COGS. */
export function horasAtendimentoPorProduto(linhas: { produto_id: string; parametros: CogsPremissas | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of linhas) {
    out[l.produto_id] = horasSuportePorCliente(l.parametros?.suporte) + horasCsPorCliente(l.parametros?.cs_proativo);
  }
  return out;
}
