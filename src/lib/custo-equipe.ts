// Custo real de equipe — provisionamento mensal, não percentual chumbado. 13º e férias são
// provisões reais (1/12 e 1/12 × 4/3), FGTS é calculado (8% sobre salário + provisões), e o
// restante do encargo (INSS patronal, RAT, Sistema S — que varia por regime tributário e já foi
// levantado com o contador em encargos_regimes.aliquota_total_efetiva) entra como um resíduo, pra
// não reinventar uma alíquota que já foi validada. A soma bate exatamente com o total do regime.
//
// Dedução: pra Simples Nacional (aliquota_total_efetiva = 29%), 13º(1/12) + férias(1/12×4/3) +
// FGTS(8% sobre a base) somam exatamente 29% — o Simples não paga INSS patronal/RAT/Sistema S
// separado (substituídos pelo DAS), então o resíduo dá zero. Pra outros regimes, o resíduo é
// exatamente o que sobra pra fechar o total já validado.

export type ComponentesCustoClt = {
  salarioBruto: number;
  provisaoDecimoTerceiro: number;
  provisaoFerias: number;
  fgts: number;
  demaisEncargos: number; // INSS patronal + RAT + Sistema S (residual do regime, já líquido de 13º/férias/FGTS)
  beneficios: number;
  custoTotalMensal: number;
};

export function calcularCustoClt(salarioBruto: number, aliquotaTotalEfetiva: number, beneficiosMensal: number): ComponentesCustoClt {
  const provisaoDecimoTerceiro = salarioBruto / 12;
  const provisaoFerias = (salarioBruto / 12) * (4 / 3);
  const baseEncargos = salarioBruto + provisaoDecimoTerceiro + provisaoFerias;
  const fgts = baseEncargos * 0.08;

  const totalEncargosRegime = salarioBruto * aliquotaTotalEfetiva;
  const demaisEncargos = Math.max(0, totalEncargosRegime - provisaoDecimoTerceiro - provisaoFerias - fgts);

  const custoTotalMensal = salarioBruto + provisaoDecimoTerceiro + provisaoFerias + fgts + demaisEncargos + beneficiosMensal;

  return {
    salarioBruto,
    provisaoDecimoTerceiro,
    provisaoFerias,
    fgts,
    demaisEncargos,
    beneficios: beneficiosMensal,
    custoTotalMensal,
  };
}

// Aproximação padrão de mercado pra converter horas/dia em horas/mês.
export const DIAS_UTEIS_MES = 21;

export type CategoriaAlocacao = "pd" | "sm" | "ga" | "cogs_suporte";

export const LABEL_CATEGORIA_ALOCACAO: Record<CategoriaAlocacao, string> = {
  pd: "P&D (Desenvolvimento)",
  sm: "Vendas e Marketing",
  ga: "Administrativo (G&A)",
  cogs_suporte: "Suporte ao cliente (COGS)",
};

export type Alocacao = {
  categoria: CategoriaAlocacao;
  produtoId: string | null;
  horasPorDia: number;
};

export function custoMensalPJ(valorHora: number, alocacoes: Alocacao[]) {
  const horasTotaisDia = alocacoes.reduce((s, a) => s + a.horasPorDia, 0);
  const horasTotaisMes = horasTotaisDia * DIAS_UTEIS_MES;
  const custoTotalMensal = horasTotaisMes * valorHora;
  return { horasTotaisDia, horasTotaisMes, custoTotalMensal };
}

/** Distribui um custo mensal total entre as alocações, proporcional às horas/dia de cada uma —
 * usado tanto pra CLT (rateando o custo provisionado entre categorias/produtos) quanto pra PJ. */
export function distribuirPorAlocacao<T extends { horasPorDia: number }>(custoTotalMensal: number, alocacoes: T[]): (T & { custoMes: number })[] {
  const totalHoras = alocacoes.reduce((s, a) => s + a.horasPorDia, 0) || 1;
  return alocacoes.map((a) => ({ ...a, custoMes: custoTotalMensal * (a.horasPorDia / totalHoras) }));
}
