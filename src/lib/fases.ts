export const FASES = [
  { value: "ideacao", label: "Ideação" },
  { value: "validacao", label: "Validação" },
  { value: "pmf", label: "Product-Market Fit (PMF)" },
  { value: "tracao", label: "Tração" },
  { value: "escala", label: "Escala" },
  { value: "maturidade", label: "Maturidade" },
] as const;

export type FaseValue = (typeof FASES)[number]["value"];
