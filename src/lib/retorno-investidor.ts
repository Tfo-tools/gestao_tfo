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
