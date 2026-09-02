export type IndicadorKey =
  | "meta"
  | "break_even"
  | "margem_operacional"
  | "margem_bruta"
  | "cac"
  | "ltv"
  | "churn"
  | "retorno_investimento";

export type IndicadorDef = {
  key: IndicadorKey;
  titulo: string;
  formula: string;
  editarLinks: { label: string; href: string }[];
};

export const INDICADORES: IndicadorDef[] = [
  {
    key: "meta",
    titulo: "Meta do período — clientes pagantes",
    formula: "Clientes ativos ao fim do período selecionado.",
    editarLinks: [{ label: "Crescimento e churn em Produtos", href: "/produtos" }],
  },
  {
    key: "break_even",
    titulo: "Break-even",
    formula: "Primeiro mês em que o EBITDA acumulado desde o início do período selecionado deixa de ser negativo.",
    editarLinks: [
      { label: "Plano de Custos", href: "/plano-de-custos" },
      { label: "Produtos (preço e crescimento)", href: "/produtos" },
    ],
  },
  {
    key: "margem_operacional",
    titulo: "Margem operacional",
    formula: "EBITDA acumulado ÷ Receita acumulada, no período selecionado.",
    editarLinks: [{ label: "Plano de Custos", href: "/plano-de-custos" }],
  },
  {
    key: "margem_bruta",
    titulo: "Margem bruta",
    formula: "(Receita − COGS − DAS do Simples Nacional) ÷ Receita, no período selecionado.",
    editarLinks: [{ label: "Plano de Custos (custos COGS do produto)", href: "/plano-de-custos" }],
  },
  {
    key: "cac",
    titulo: "CAC (all-in)",
    formula: "(Custos de Marketing + Custos de Vendas) ÷ novos clientes adquiridos, no período selecionado.",
    editarLinks: [
      { label: "Custos COGS (equipe comercial)", href: "/contratacoes" },
      { label: "Plano de Custos (marketing)", href: "/plano-de-custos" },
    ],
  },
  {
    key: "ltv",
    titulo: "LTV",
    formula: "ARPU (receita ÷ clientes ativos) dividido pelo churn mensal, ponderado pelos clientes ativos de cada mês.",
    editarLinks: [{ label: "Preços e churn em Produtos", href: "/produtos" }],
  },
  {
    key: "churn",
    titulo: "Churn médio",
    formula: "Churn mensal de cada fase, ponderado pelos clientes ativos do mês.",
    editarLinks: [{ label: "Churn por fase em Produtos", href: "/produtos" }],
  },
  {
    key: "retorno_investimento",
    titulo: "Retorno do investimento",
    formula: "Mês em que o EBITDA acumulado (desde o início do período) recupera todo o capital captado vinculado ao cenário.",
    editarLinks: [{ label: "Fomentos e Investimentos", href: "/fomento" }],
  },
];

export function indicadorPorKey(key: string | undefined): IndicadorDef {
  return INDICADORES.find((i) => i.key === key) ?? INDICADORES[0];
}
