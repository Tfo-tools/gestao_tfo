/**
 * Simulação tributária — Simples Nacional, Anexo III (serviços com Fator R ≥ 28%) e Anexo V
 * (Fator R < 28%). Tabelas oficiais 2024, valores em R$. Fonte: planilha "Simulacao_Tributaria_SaaS"
 * (Vanessa) — confere com a LC 123/2006 vigente. Regimes pós-reforma tributária (IBS/CBS) e Lucro
 * Presumido/Real ficam pra quando a empresa migrar de regime; hoje a TFO está no Simples.
 */

export type FaixaSimples = { limite: number; aliquota: number; deducao: number };

export const ANEXO_III: FaixaSimples[] = [
  { limite: 180_000, aliquota: 0.06, deducao: 0 },
  { limite: 360_000, aliquota: 0.112, deducao: 9_360 },
  { limite: 720_000, aliquota: 0.135, deducao: 17_640 },
  { limite: 1_800_000, aliquota: 0.16, deducao: 35_640 },
  { limite: 3_600_000, aliquota: 0.21, deducao: 125_640 },
  { limite: 4_800_000, aliquota: 0.33, deducao: 648_000 },
];

export const ANEXO_V: FaixaSimples[] = [
  { limite: 180_000, aliquota: 0.155, deducao: 0 },
  { limite: 360_000, aliquota: 0.18, deducao: 4_500 },
  { limite: 720_000, aliquota: 0.195, deducao: 9_900 },
  { limite: 1_800_000, aliquota: 0.205, deducao: 17_100 },
  { limite: 3_600_000, aliquota: 0.23, deducao: 62_100 },
  { limite: 4_800_000, aliquota: 0.305, deducao: 540_000 },
];

function faixaSimples(rbt12: number, tabela: FaixaSimples[]): FaixaSimples {
  return tabela.find((f) => rbt12 <= f.limite) ?? tabela[tabela.length - 1];
}

/** Alíquota efetiva = (RBT12 × alíquota nominal da faixa − parcela a deduzir) / RBT12. */
export function aliquotaEfetivaSimples(rbt12: number, tabela: FaixaSimples[]): number {
  if (rbt12 <= 0) return tabela[0].aliquota;
  const faixa = faixaSimples(rbt12, tabela);
  return Math.max(0, (rbt12 * faixa.aliquota - faixa.deducao) / rbt12);
}

export type ResultadoSimples = {
  anexo: "III" | "V";
  fatorR: number;
  aliquotaEfetiva: number;
  impostoMensal: number;
};

/**
 * DAS mensal pelo Simples Nacional. Fator R = folha de pagamento + pró-labore acumulados nos
 * últimos 12 meses, dividido pelo RBT12 — decide o anexo (III se ≥28%, senão V, sempre mais caro).
 */
export function calcularImpostoSimples(receitaMensal: number, rbt12: number, fatorR: number): ResultadoSimples {
  const anexo: "III" | "V" = fatorR >= 0.28 ? "III" : "V";
  const tabela = anexo === "III" ? ANEXO_III : ANEXO_V;
  const aliquotaEfetiva = aliquotaEfetivaSimples(rbt12, tabela);
  return { anexo, fatorR, aliquotaEfetiva, impostoMensal: receitaMensal * aliquotaEfetiva };
}
