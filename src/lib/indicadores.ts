export type IndicadorKey =
  | "meta"
  | "break_even"
  | "margem_operacional"
  | "margem_bruta"
  | "cac"
  | "ltv"
  | "churn"
  | "retorno_investimento"
  | "pmv"
  | "tir"
  | "cogs"
  | "sm"
  | "pd"
  | "ga";

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
  {
    key: "pmv",
    titulo: "Preço médio de venda (PMV)",
    formula:
      "Mensalidade de tabela de cada venda nova — planos pelo mix de venda + níveis/módulos pela fatia de adesão —, ponderada pelos clientes novos de cada produto no período. Não é o ticket médio: não carrega descontos (beta, canal, combo) nem implementação.",
    editarLinks: [
      { label: "Planos e níveis (Produtos)", href: (cenarioId: string) => (cenarioId ? `/produtos?cenario=${cenarioId}` : "/produtos") },
      { label: "Vendas", href: hrefVendas },
    ],
  },
  {
    key: "tir",
    titulo: "TIR — taxa interna de retorno",
    formula:
      "Taxa que zera o valor presente do fluxo mensal do período, anualizada. Com capital novo vinculado: o capital sai no mês do aporte e volta como EBITDA (mesma base do Capital coberto por caixa próprio). Sem capital novo: TIR do projeto sobre o fluxo de EBITDA — os meses negativos são o investimento que a operação consome. Não inclui valor de saída (leitura conservadora).",
    editarLinks: [
      { label: "Fomentos e Investimentos", href: hrefFomento },
      { label: "Plano de Custos", href: hrefPlanoCustos },
    ],
  },
  {
    key: "cogs",
    titulo: "COGS — o que entra na linha",
    formula:
      "Custo de entregar o serviço: regras de COGS de cada produto (infra, LLM, suporte reativo e CS proativo em horas × custo/hora, software, gateway), custo das etapas de implementação × clientes novos, e custos lançados em contas 1.1.x. Nada de aquisição de cliente entra aqui.",
    editarLinks: [{ label: "Plano de Custos (card CSP)", href: hrefPlanoCustos }],
  },
  {
    key: "sm",
    titulo: "Vendas e Marketing (S&M) — o que entra na linha",
    formula:
      "Tudo o que traz cliente: mídia do self-service, fechamento/comissão/crédito pagos a parceiros, equipe comercial alocada (SDR, vendedor, coordenador), feiras e eventos, e custos da empresa em contas 2.1.x. É o numerador do CAC.",
    editarLinks: [
      { label: "Canais de aquisição (Vendas)", href: hrefVendas },
      { label: "Equipe comercial (Necessidade de Contratação)", href: (cenarioId: string) => `/contratacoes/necessidade?cenario=${cenarioId}` },
    ],
  },
  {
    key: "pd",
    titulo: "P&D — o que entra na linha",
    formula: "Desenvolvimento de produto: custos da empresa em contas 2.2.x, equipe alocada de P&D e contratações por produto.",
    editarLinks: [{ label: "Plano de Custos (Desenvolvimento)", href: hrefPlanoCustos }],
  },
  {
    key: "ga",
    titulo: "G&A — o que entra na linha",
    formula:
      "Estrutura: custos da empresa em contas 2.3.x e 2.4.x (marca), filiação mensal às associações parceiras (fora do CAC) e equipe alocada de G&A.",
    editarLinks: [{ label: "Plano de Custos", href: hrefPlanoCustos }],
  },
];

export function indicadorPorKey(key: string | undefined): IndicadorDef {
  return INDICADORES.find((i) => i.key === key) ?? INDICADORES[0];
}
