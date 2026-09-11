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
  /** Cada link recebe o cenário atual pra montar a URL — assim nunca abre a tela "solta", sem
   * saber de qual plano se trata. */
  editarLinks: { label: string; href: (cenarioId: string) => string }[];
};

const hrefVendas = (cenarioId: string) => (cenarioId ? `/plano/${cenarioId}/vendas` : "/cenarios");
const hrefPlanoCustos = (cenarioId: string) => (cenarioId ? `/plano/${cenarioId}/custos` : "/cenarios");
const hrefContratacoes = (cenarioId: string) => (cenarioId ? `/contratacoes?cenario=${cenarioId}` : "/contratacoes");
const hrefFomento = () => "/fomento";

export const INDICADORES: IndicadorDef[] = [
  {
    key: "meta",
    titulo: "Meta do período — clientes pagantes",
    formula: "Clientes ativos ao fim do período selecionado.",
    editarLinks: [{ label: "Crescimento e churn (Vendas)", href: hrefVendas }],
  },
  {
    key: "break_even",
    titulo: "Break-even",
    formula: "Primeiro mês em que o EBITDA acumulado desde o início do período selecionado deixa de ser negativo.",
    editarLinks: [
      { label: "Plano de Custos", href: hrefPlanoCustos },
      { label: "Vendas (preço e crescimento)", href: hrefVendas },
    ],
  },
  {
    key: "margem_operacional",
    titulo: "Margem operacional",
    formula: "EBITDA acumulado ÷ Receita acumulada, no período selecionado.",
    editarLinks: [{ label: "Plano de Custos", href: hrefPlanoCustos }],
  },
  {
    key: "margem_bruta",
    titulo: "Margem bruta",
    formula: "(Receita − COGS − DAS do Simples Nacional) ÷ Receita, no período selecionado.",
    editarLinks: [{ label: "Plano de Custos (custos COGS do produto)", href: hrefPlanoCustos }],
  },
  {
    key: "cac",
    titulo: "CAC (all-in)",
    formula:
      "Fully-loaded: (Marketing + Vendas + Outros S&M — mídia, ferramentas, folha comercial própria e compartilhada, comissões, terceirizados) ÷ novos clientes adquiridos, no período selecionado.",
    editarLinks: [
      { label: "Custos COGS (equipe comercial)", href: hrefContratacoes },
      { label: "Plano de Custos (marketing)", href: hrefPlanoCustos },
    ],
  },
  {
    key: "ltv",
    titulo: "LTV",
    formula:
      "(ARPU × margem bruta do produto) ÷ churn mensal — a margem bruta desconta o COGS (infra/suporte) do ARPU antes de dividir pelo churn, ponderado pelos clientes ativos de cada mês.",
    editarLinks: [{ label: "Preços e churn (Vendas)", href: hrefVendas }],
  },
  {
    key: "churn",
    titulo: "Churn médio",
    formula: "Churn mensal de cada fase, ponderado pelos clientes ativos do mês.",
    editarLinks: [{ label: "Churn por fase (Vendas)", href: hrefVendas }],
  },
  {
    key: "retorno_investimento",
    titulo: "Retorno do investimento",
    formula:
      "Mês em que o EBITDA acumulado (desde o início do período) recupera o capital NOVO vinculado ao cenário — o investimento ainda não aplicado. Fomento e parcelas já recebidas ficam fora da conta.",
    editarLinks: [{ label: "Fomentos e Investimentos", href: hrefFomento }],
  },
];

export function indicadorPorKey(key: string | undefined): IndicadorDef {
  return INDICADORES.find((i) => i.key === key) ?? INDICADORES[0];
}
