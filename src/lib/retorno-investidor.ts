export type ReavaliacaoInput = {
  data_referencia: string;
  novo_valuation: number;
  fator_diluicao: number;
};

export type ProgramaValuationInput = {
  valor_investido: number;
  valuation_post_money: number | null;
  data_aporte: string | null;
  reavaliacoes: ReavaliacaoInput[];
};

export type RetornoPrograma = {
  temValuation: boolean;
  equityInicialPct: number | null;
  equityAtualPct: number | null;
  valuationAtual: number | null;
  valorParticipacao: number | null;
  moic: number | null;
  roiPct: number | null;
  tirPct: number | null;
  anosDecorridos: number | null;
  ultimaReavaliacao: string | null;
};

const NEUTRO: RetornoPrograma = {
  temValuation: false,
  equityInicialPct: null,
  equityAtualPct: null,
  valuationAtual: null,
  valorParticipacao: null,
  moic: null,
  roiPct: null,
  tirPct: null,
  anosDecorridos: null,
  ultimaReavaliacao: null,
};

/** Retorno do investidor via diluição de equity — MOIC, ROI% e TIR anualizada — em vez do
 * "capital recuperado via EBITDA da empresa" (que mede outra coisa: o caixa da própria empresa
 * cobrindo o valor captado, não o valor real da participação do investidor no momento). */
export function calcularRetornoPrograma(input: ProgramaValuationInput): RetornoPrograma {
  const { valor_investido, valuation_post_money, data_aporte, reavaliacoes } = input;

  if (!valuation_post_money || valuation_post_money <= 0 || valor_investido <= 0) return NEUTRO;

  const equityInicialPct = (valor_investido / valuation_post_money) * 100;

  const ordenadas = [...reavaliacoes].sort((a, b) => a.data_referencia.localeCompare(b.data_referencia));
  let equityAtual = equityInicialPct / 100;
  for (const r of ordenadas) {
    equityAtual *= 1 - Number(r.fator_diluicao || 0);
  }
  const equityAtualPct = equityAtual * 100;

  const ultima = ordenadas[ordenadas.length - 1] ?? null;
  const valuationAtual = ultima ? Number(ultima.novo_valuation) : valuation_post_money;
  const valorParticipacao = valuationAtual * equityAtual;
  const moic = valorParticipacao / valor_investido;
  const roiPct = (moic - 1) * 100;

  const dataBase = data_aporte;
  const dataRef = ultima?.data_referencia ?? null;
  let anosDecorridos: number | null = null;
  let tirPct: number | null = null;
  if (dataBase && dataRef) {
    const dias = (new Date(dataRef).getTime() - new Date(dataBase).getTime()) / (1000 * 60 * 60 * 24);
    anosDecorridos = dias / 365.25;
    if (anosDecorridos > 0 && moic > 0) {
      tirPct = (Math.pow(moic, 1 / anosDecorridos) - 1) * 100;
    }
  }

  return {
    temValuation: true,
    equityInicialPct,
    equityAtualPct,
    valuationAtual,
    valorParticipacao,
    moic,
    roiPct,
    tirPct,
    anosDecorridos,
    ultimaReavaliacao: ultima?.data_referencia ?? null,
  };
}

/** Agregado simples de vários programas — soma capital e valor de participação (MOIC/ROI
 * agregados exatos); a TIR agregada é uma média ponderada pelo capital investido (aproximação —
 * uma TIR exata multi-fluxo exigiria XIRR, fora de escopo enquanto há só um programa relevante). */
export function agregarRetornoProgramas(retornos: { retorno: RetornoPrograma; valorInvestido: number }[]) {
  const comValuation = retornos.filter((r) => r.retorno.temValuation);
  if (comValuation.length === 0) {
    return { temValuation: false, moic: null, roiPct: null, tirPct: null, valorInvestidoTotal: 0, valorParticipacaoTotal: 0 };
  }
  const valorInvestidoTotal = comValuation.reduce((s, r) => s + r.valorInvestido, 0);
  const valorParticipacaoTotal = comValuation.reduce((s, r) => s + (r.retorno.valorParticipacao ?? 0), 0);
  const moic = valorInvestidoTotal > 0 ? valorParticipacaoTotal / valorInvestidoTotal : null;
  const roiPct = moic != null ? (moic - 1) * 100 : null;
  const comTir = comValuation.filter((r) => r.retorno.tirPct != null);
  const tirPct =
    comTir.length > 0 && valorInvestidoTotal > 0
      ? comTir.reduce((s, r) => s + (r.retorno.tirPct as number) * r.valorInvestido, 0) / valorInvestidoTotal
      : null;
  return { temValuation: true, moic, roiPct, tirPct, valorInvestidoTotal, valorParticipacaoTotal };
}

// ───────────────── Simulação de retorno do investidor (com valor de saída) ─────────────────
// O retorno por equity acima só enxerga o que já aconteceu (aporte + reavaliações). Enquanto não
// há reavaliação, a participação vale exatamente o que foi paga e o ROI dá 0% — que é correto como
// histórico e inútil pra apresentar uma rodada. O investidor decide olhando o valor PROJETADO da
// participação na saída: quanto a empresa deve valer no fim do plano (múltiplo de ARR ou de EBITDA)
// × a fatia dele. É o que esta simulação calcula — e por isso todos os parâmetros são editáveis.

export type BaseSaida = "arr" | "ebitda";

export type SimulacaoRetornoInput = {
  /** Capital aportado na rodada (editável — não precisa ser o valor do programa cadastrado). */
  valorInvestido: number;
  /** Mês do aporte ("AAAA-MM-01"). */
  mesAporte: string;
  /** Fatia do investidor depois da rodada, em % (500 mil ÷ pós-money de 5 mi = 10%). */
  equityPct: number;
  /** Múltiplo de saída aplicado sobre a base escolhida. */
  multiploSaida: number;
  baseSaida: BaseSaida;
  /** ARR (MRR × 12) e EBITDA anualizado do mês de saída — de onde sai o valor da empresa. */
  arrNaSaida: number;
  ebitdaNaSaida: number;
  /** Mês da saída ("AAAA-MM-01") — normalmente o fim do período projetado. */
  mesSaida: string;
};

export type SimulacaoRetorno = {
  valorEmpresaNaSaida: number;
  valorParticipacao: number;
  /** Quantas vezes o capital volta (2,5x = recebe 2,5 vezes o que colocou). */
  moic: number | null;
  roiPct: number | null;
  /** TIR anualizada do fluxo do investidor: sai o aporte, volta a participação na saída. */
  tirAnualPct: number | null;
  anos: number | null;
  baseValor: number;
};

function mesesEntreIso(de: string, ate: string): number {
  const a = new Date(de.slice(0, 7) + "-01T00:00:00");
  const b = new Date(ate.slice(0, 7) + "-01T00:00:00");
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/** Retorno projetado da rodada: valor de saída × fatia, contra o capital aportado. */
export function simularRetornoInvestidor(input: SimulacaoRetornoInput): SimulacaoRetorno {
  const { valorInvestido, mesAporte, equityPct, multiploSaida, baseSaida, arrNaSaida, ebitdaNaSaida, mesSaida } = input;
  const baseValor = baseSaida === "ebitda" ? ebitdaNaSaida : arrNaSaida;
  // Empresa com EBITDA negativo não se avalia por múltiplo de EBITDA — o valor de saída fica zero
  // e a simulação mostra isso em vez de inventar um número.
  const valorEmpresaNaSaida = Math.max(0, baseValor) * Math.max(0, multiploSaida);
  const valorParticipacao = valorEmpresaNaSaida * (Math.max(0, equityPct) / 100);
  if (valorInvestido <= 0) {
    return { valorEmpresaNaSaida, valorParticipacao, moic: null, roiPct: null, tirAnualPct: null, anos: null, baseValor };
  }
  const moic = valorParticipacao / valorInvestido;
  const meses = Math.max(0, mesesEntreIso(mesAporte, mesSaida));
  const anos = meses / 12;
  const tirAnualPct = anos > 0 && moic > 0 ? (Math.pow(moic, 1 / anos) - 1) * 100 : null;
  return { valorEmpresaNaSaida, valorParticipacao, moic, roiPct: (moic - 1) * 100, tirAnualPct, anos, baseValor };
}
