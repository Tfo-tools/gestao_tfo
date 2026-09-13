import { FASES, type FaseValue } from "@/lib/fases";

/** Carga horária padrão CLT (44h semanais) convertida em horas/mês — usada como capacidade de referência. */
export const HORAS_MES_PADRAO = (44 * 52) / 12;

export type FaseProdutoInput = {
  produtoId: string;
  fase: FaseValue;
  data_inicio: string | null;
  data_fim: string | null;
};

export type FunilPremissaInput = {
  produtoId: string;
  fase: FaseValue;
  /** Oportunidades/reuniões que um closer atende por mês. */
  capacidade_vendedor_mes: number | null;
  span_of_control: number | null;
  /** Reuniões que o vendedor gasta por oportunidade gerada. 1 = fecha na primeira conversa;
   *  1,25 = a cada 20 reuniões, 5 pedem uma segunda (caso do Fashion Mind). */
  reunioes_por_oportunidade: number | null;
  horas_suporte_por_cliente_mes: number | null;
};

/**
 * Uma célula da matriz produto × canal. A taxa de FECHAMENTO (reunião → cliente) é característica
 * do produto dentro daquele canal — o Fashion Mind é mais difícil de explicar que o Price, e um
 * representante que traz relação pronta fecha muito mais que prospecção fria.
 */
export type CanalFunilInput = {
  produtoId: string;
  tipo_canal: "direto" | "self_service" | "representante" | "associacao";
  percentual_mix: number;
  taxa_fechamento: number | null;
  /** Só o canal direto prospecta lead frio; vem do modelo de contratação que executa o canal. */
  taxa_qualificacao: number | null;
};

export type SimulacaoMesInput = {
  produtoId: string;
  mes_referencia: string;
  novos_clientes: number;
  clientes_ativos: number;
  /** Quantos dos novos vieram de cada tipo de canal — é o que a simulação de fato produziu,
   *  não o mix teórico. Sem isso a demanda de SDR sai do mix e infla 2x quando os parceiros
   *  entregam mais do que a fatia prevista. */
  novos_direto?: number;
  novos_representante?: number;
  novos_associacao?: number;
  /** Clientes que vieram de feiras, eventos e campanhas — a SDR faz o acompanhamento deles. */
  novos_acoes?: number;
};

/** Demanda de um produto num mês, já na unidade de cada cargo. É o que permite prender uma
 *  alocação a alguns produtos (SDR PJ só no Mind, SDR IA só no Price e no Skills). */
export type DemandaProdutoMes = {
  /** Reuniões/oportunidades que a SDR precisa gerar — canal direto, associações e feiras/eventos
   *  (tudo que precisa de acompanhamento pra fechar). Representante vai direto pro vendedor. */
  sdr: number;
  oportunidadesDireto: number;
  /** Reuniões que o vendedor atende (todas as de canais com reunião, já com a 2ª reunião). */
  reunioesVendedor: number;
  /** Vendedores necessários (reuniões ÷ capacidade do closer no produto). */
  vendedores: number;
  /** Coordenadores necessários (vendedores ÷ span). */
  coordenador: number;
  suporte: number;
  /** Clientes que fecharam passando por reunião com vendedor — base do "por venda" e da
   *  comissão. Self-service e produto sem vendedor ficam fora. */
  vendasComReuniao: number;
};

export function demandaProdutoVazia(): DemandaProdutoMes {
  return {
    sdr: 0,
    oportunidadesDireto: 0,
    reunioesVendedor: 0,
    vendedores: 0,
    coordenador: 0,
    suporte: 0,
    vendasComReuniao: 0,
  };
}

export type MesDemandaCargo = {
  mes_referencia: string;
  /** Unidade de demanda: "contatos" (SDR), "vendedores" (Coordenador) ou "horas" (Suporte). */
  demanda: number;
};

const FASE_ORDEM: FaseValue[] = FASES.map((f) => f.value);

function addMonths(dateStr: string, n: number): Date {
  const d = new Date(dateStr + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function isoMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function faseAtivaNoMes<
  T extends {
    fase: FaseValue;
    data_inicio: string | null;
    data_fim: string | null;
  },
>(fases: T[], mes: Date): T | null {
  // Quando duas fases têm limite no mesmo mês civil, preferimos a que começou por último — ela
  // rege a maior parte do mês (ver mesma correção em simulacao.ts::faseParaMes).
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

  const passadas = fases
    .filter(
      (f) => f.data_inicio && new Date(f.data_inicio + "T00:00:00") <= mes,
    )
    .sort((a, b) => (a.data_inicio! < b.data_inicio! ? 1 : -1));
  return passadas[0] ?? null;
}

/**
 * Deriva a demanda mensal de SDR (em contatos necessários), Coordenador (em vendedores que
 * precisam de supervisão) e Suporte (em horas), a partir das premissas de funil por produto/fase
 * e do crescimento de clientes já calculado na simulação (simulacao_mensal).
 */
export function calcularDemandaPorCargo(params: {
  fasesPorProduto: FaseProdutoInput[];
  funis: FunilPremissaInput[];
  canais: CanalFunilInput[];
  simulacao: SimulacaoMesInput[];
  /** Horas de suporte + CS por cliente/mês, por produto — vem das regras de COGS (1.1.3). Quando
   *  informado, substitui o campo por fase (que ficou redundante e saiu da tela). */
  horasSuportePorProduto?: Record<string, number>;
}): {
  /** REUNIÕES que o SDR precisa agendar no mês (canal direto). Leads deixaram de ser a unidade:
   *  a remuneração real é por reunião agendada, e leads varia por eficiência de cada modelo. */
  sdr: MesDemandaCargo[];
  /** Reuniões que o time de vendas precisa ATENDER — inclui as reuniões extras que produtos de
   *  ciclo mais longo (ex: Fashion Mind) exigem pra fechar. */
  vendedor: MesDemandaCargo[];
  /** Vendedores a supervisionar ÷ span of control. Só aparece com span_of_control preenchido. */
  coordenador: MesDemandaCargo[];
  suporte: MesDemandaCargo[];
  oportunidades: MesDemandaCargo[];
  /** Reuniões que o canal DIRETO precisa gerar no mês — base pra dimensionar o SDR. As de
   *  parceiro ficam de fora: chegam prontas e não consomem prospecção. */
  oportunidadesDireto: MesDemandaCargo[];
  /** Meses em que faltou taxa de qualificação — o custo de SDR sai subestimado nesses meses. */
  mesesSemQualificacao: string[];
  /** A mesma demanda, aberta por produto e mês: porProduto[produtoId][mes]. */
  porProduto: Record<string, Record<string, DemandaProdutoMes>>;
} {
  const { fasesPorProduto, funis, canais, simulacao, horasSuportePorProduto } =
    params;

  const canaisPorProduto = new Map<string, CanalFunilInput[]>();
  for (const c of canais) {
    const atual = canaisPorProduto.get(c.produtoId) ?? [];
    atual.push(c);
    canaisPorProduto.set(c.produtoId, atual);
  }

  const fasesPorProdutoMap = new Map<string, FaseProdutoInput[]>();
  for (const f of fasesPorProduto) {
    const atual = fasesPorProdutoMap.get(f.produtoId) ?? [];
    atual.push(f);
    fasesPorProdutoMap.set(f.produtoId, atual);
  }

  const funilPorProdutoFase = new Map<string, FunilPremissaInput>();
  for (const f of funis) {
    funilPorProdutoFase.set(`${f.produtoId}__${f.fase}`, f);
  }

  const porMesSdr = new Map<string, number>();
  const porMesCoordenador = new Map<string, number>();
  const porMesSuporte = new Map<string, number>();
  const porMesOportunidades = new Map<string, number>();
  const porMesOportunidadesDireto = new Map<string, number>();
  const porMesVendedor = new Map<string, number>();
  const mesesSemQualificacao = new Set<string>();
  const porProduto: Record<string, Record<string, DemandaProdutoMes>> = {};
  function acc(
    produtoId: string,
    mesIso: string,
    campo: keyof DemandaProdutoMes,
    v: number,
  ) {
    const doProduto = (porProduto[produtoId] ??= {});
    const d = (doProduto[mesIso] ??= demandaProdutoVazia());
    d[campo] += v;
  }

  for (const s of simulacao) {
    const fases = fasesPorProdutoMap.get(s.produtoId) ?? [];
    const mes = new Date(s.mes_referencia + "T00:00:00");
    const faseAtiva = faseAtivaNoMes(fases, mes);
    if (!faseAtiva) continue;

    const funil = funilPorProdutoFase.get(`${s.produtoId}__${faseAtiva.fase}`);
    if (!funil) continue;

    const mesIso = isoMonth(mes);

    // Suporte não passa por canal — depende só da base de clientes ativos.
    // Suporte: horas por cliente vêm das regras de COGS do produto (suporte reativo + CS proativo).
    // O campo por fase só vale como fallback de simulação antiga.
    const horasPorCliente =
      horasSuportePorProduto?.[s.produtoId] ??
      funil.horas_suporte_por_cliente_mes ??
      0;
    if (horasPorCliente > 0) {
      porMesSuporte.set(
        mesIso,
        (porMesSuporte.get(mesIso) ?? 0) + s.clientes_ativos * horasPorCliente,
      );
      acc(s.produtoId, mesIso, "suporte", s.clientes_ativos * horasPorCliente);
    }

    // Funil em dois estágios, calculado de trás pra frente e CANAL A CANAL — porque a taxa de
    // fechamento é característica do produto dentro de cada canal (o Mind fecha 10% na prospecção
    // fria e 50% via representante). Os clientes do mês se dividem pelo mix de canais:
    //   clientes do canal = clientes do mês × % do mix
    //   oportunidades     = clientes do canal ÷ fechamento do canal   (o closer trabalha isso)
    //   leads             = oportunidades ÷ qualificação              (só no canal direto)
    const canaisDoProduto = canaisPorProduto.get(s.produtoId) ?? [];
    const somaMix = canaisDoProduto.reduce(
      (acc, c) => acc + c.percentual_mix,
      0,
    );
    if (somaMix <= 0) continue;

    // Quantos clientes cada TIPO de canal trouxe de verdade neste mês. A simulação calcula
    // parceiros pela curva deles e o direto pela taxa de crescimento — a fatia real raramente
    // bate com o mix da matriz. Dimensionar o SDR pelo mix, e não pelo realizado, é o que fazia
    // o app pedir 6 SDRs pra 1 cliente. Sem os campos (simulação antiga), cai no mix.
    const temRealizado = s.novos_direto != null;
    const realizadoPorTipo: Record<string, number> = {
      direto: s.novos_direto ?? 0,
      representante: s.novos_representante ?? 0,
      associacao: s.novos_associacao ?? 0,
    };
    // Vários canais do mesmo tipo (duas associações) dividem o realizado do tipo pelo mix entre si.
    const mixPorTipo: Record<string, number> = {};
    for (const c of canaisDoProduto)
      mixPorTipo[c.tipo_canal] =
        (mixPorTipo[c.tipo_canal] ?? 0) + c.percentual_mix;

    for (const canal of canaisDoProduto) {
      if (!canal.taxa_fechamento || canal.percentual_mix <= 0) continue;
      // Self-service não tem reunião: o cliente entra pelo teste grátis e ativa sozinho. Não gera
      // demanda de SDR nem de vendedor — o custo dele é mídia, calculado na simulação do produto.
      if (canal.tipo_canal === "self_service") continue;

      const clientesDoCanal = temRealizado
        ? (realizadoPorTipo[canal.tipo_canal] ?? 0) *
          (canal.percentual_mix / (mixPorTipo[canal.tipo_canal] || 1))
        : s.novos_clientes * (canal.percentual_mix / somaMix);
      const oportunidades = clientesDoCanal / canal.taxa_fechamento;
      porMesOportunidades.set(
        mesIso,
        (porMesOportunidades.get(mesIso) ?? 0) + oportunidades,
      );
      // Só as reuniões do canal direto são trabalho de prospecção. As de parceiro vêm de relação
      // pronta e não podem contar como resultado de SDR nem dimensionar o time.
      if (canal.tipo_canal === "direto") {
        porMesOportunidadesDireto.set(
          mesIso,
          (porMesOportunidadesDireto.get(mesIso) ?? 0) + oportunidades,
        );
        acc(s.produtoId, mesIso, "oportunidadesDireto", oportunidades);
      }

      // O vendedor atende TODAS as reuniões, de qualquer canal — inclusive as que o parceiro traz
      // prontas. E produtos de ciclo mais longo pedem reunião extra pra fechar: no Fashion Mind,
      // a cada 20 reuniões 5 avançam pra uma segunda conversa, então a carga é 1,25× as reuniões.
      const reunioesAtendidas =
        oportunidades * (funil.reunioes_por_oportunidade ?? 1);
      if (funil.capacidade_vendedor_mes) {
        const vendedores = reunioesAtendidas / funil.capacidade_vendedor_mes;
        porMesVendedor.set(
          mesIso,
          (porMesVendedor.get(mesIso) ?? 0) + vendedores,
        );
        acc(s.produtoId, mesIso, "reunioesVendedor", reunioesAtendidas);
        acc(s.produtoId, mesIso, "vendedores", vendedores);
        // Produto sem capacidade de closer cadastrada vende sem vendedor (automático): as vendas
        // dele não pagam "por venda" nem comissão.
        acc(s.produtoId, mesIso, "vendasComReuniao", clientesDoCanal);
        // Coordenador supervisiona vendedores — span_of_control diz quantos por coordenador.
        if (funil.span_of_control) {
          porMesCoordenador.set(
            mesIso,
            (porMesCoordenador.get(mesIso) ?? 0) +
              vendedores / funil.span_of_control,
          );
          acc(
            s.produtoId,
            mesIso,
            "coordenador",
            vendedores / funil.span_of_control,
          );
        }
      }

      // Representante traz relação pronta e vai direto pro vendedor. Todo o resto — direto e
      // associação — precisa da SDR pra chegar ao acesso/reunião, senão não fecha.
      if (canal.tipo_canal === "representante") continue;

      // A demanda de SDR é o número de REUNIÕES a agendar. Quantas ligações isso custa depende da
      // eficiência de cada modelo e é calculado na hora de precificar, não aqui — assim o mesmo
      // plano de vendas pode ser comparado entre um CLT que qualifica 1% e um bot que qualifica 0,4%.
      porMesSdr.set(mesIso, (porMesSdr.get(mesIso) ?? 0) + oportunidades);
      acc(s.produtoId, mesIso, "sdr", oportunidades);
      if (canal.tipo_canal === "direto" && !canal.taxa_qualificacao)
        mesesSemQualificacao.add(mesIso);
    }

    // Feiras, eventos e campanhas: o cliente chega pela ação, mas a SDR acompanha até o acesso ou
    // a reunião e o vendedor atende — mesma conta do canal direto, com a taxa dele.
    const direto = canaisDoProduto.find(
      (c) => c.tipo_canal === "direto" && c.taxa_fechamento,
    );
    const clientesAcoes = s.novos_acoes ?? 0;
    if (direto?.taxa_fechamento && clientesAcoes > 0) {
      const oportunidades = clientesAcoes / direto.taxa_fechamento;
      porMesOportunidades.set(
        mesIso,
        (porMesOportunidades.get(mesIso) ?? 0) + oportunidades,
      );
      porMesSdr.set(mesIso, (porMesSdr.get(mesIso) ?? 0) + oportunidades);
      acc(s.produtoId, mesIso, "sdr", oportunidades);
      const reunioesAtendidas =
        oportunidades * (funil.reunioes_por_oportunidade ?? 1);
      if (funil.capacidade_vendedor_mes) {
        const vendedores = reunioesAtendidas / funil.capacidade_vendedor_mes;
        porMesVendedor.set(
          mesIso,
          (porMesVendedor.get(mesIso) ?? 0) + vendedores,
        );
        acc(s.produtoId, mesIso, "reunioesVendedor", reunioesAtendidas);
        acc(s.produtoId, mesIso, "vendedores", vendedores);
        acc(s.produtoId, mesIso, "vendasComReuniao", clientesAcoes);
        if (funil.span_of_control) {
          porMesCoordenador.set(
            mesIso,
            (porMesCoordenador.get(mesIso) ?? 0) +
              vendedores / funil.span_of_control,
          );
          acc(
            s.produtoId,
            mesIso,
            "coordenador",
            vendedores / funil.span_of_control,
          );
        }
      }
    }
  }

  const toArray = (m: Map<string, number>): MesDemandaCargo[] =>
    [...m.entries()]
      .map(([mes_referencia, demanda]) => ({ mes_referencia, demanda }))
      .sort((a, b) => (a.mes_referencia < b.mes_referencia ? -1 : 1));

  return {
    sdr: toArray(porMesSdr),
    vendedor: toArray(porMesVendedor),
    coordenador: toArray(porMesCoordenador),
    suporte: toArray(porMesSuporte),
    oportunidades: toArray(porMesOportunidades),
    oportunidadesDireto: toArray(porMesOportunidadesDireto),
    mesesSemQualificacao: [...mesesSemQualificacao].sort(),
    porProduto,
  };
}

export { FASE_ORDEM };

/**
 * Leads que um modelo precisa trabalhar num mês para entregar as reuniões pedidas.
 *
 * As reuniões são o que o plano de vendas exige (clientes ÷ taxa de fechamento do canal) e não
 * mudam com quem prospecta. O que muda é a eficiência: um modelo que qualifica 4% precisa do dobro
 * de leads de um que qualifica 8% para entregar as mesmas reuniões — e, num contrato por demanda,
 * custa o dobro. Sem isso todo modelo era cobrado pela demanda dimensionada com a taxa do canal, e
 * o modelo pior aparecia artificialmente barato na comparação.
 *
 * Sem taxa própria cadastrada, devolve a demanda base (não dá pra inferir a eficiência dele).
 */
export function leadsDoModeloNoMes(
  cargo: string,
  demandaBase: number,
  oportunidadesDireto: number,
  taxaQualificacaoDoModelo: number | null | undefined,
): number {
  if (cargo.trim().toLowerCase() !== "sdr") return demandaBase;
  if (!taxaQualificacaoDoModelo || taxaQualificacaoDoModelo <= 0)
    return demandaBase;
  return oportunidadesDireto / taxaQualificacaoDoModelo;
}

export type CargoChave = "sdr" | "vendedor" | "coordenador" | "suporte";

/**
 * Reconhece o cargo pelo que ele CONTÉM, não por igualdade: "Vendedor Pleno", "SDR Júnior",
 * "Closer Sênior" e "Analista de Suporte" precisam cair na aba certa. Senioridade no nome do
 * cargo é jeito natural de cadastrar — o app é que tem de entender.
 */
export function cargoChave(
  cargo: string | null | undefined,
): CargoChave | null {
  const c = (cargo ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!c) return null;
  if (c.includes("sdr") || c.includes("pre-venda") || c.includes("prospec"))
    return "sdr";
  if (
    c.includes("coordenador") ||
    c.includes("gerente comercial") ||
    c.includes("supervisor")
  )
    return "coordenador";
  if (
    c.includes("vendedor") ||
    c.includes("closer") ||
    c.includes("executivo") ||
    c.includes("account")
  )
    return "vendedor";
  if (
    c.includes("suporte") ||
    c.includes("customer") ||
    c.includes("atendimento") ||
    c.includes("cs ")
  )
    return "suporte";
  return null;
}
