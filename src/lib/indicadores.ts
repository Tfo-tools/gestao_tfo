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
  | "ticket_entrada"
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
  /** `periodo` é a query do recorte atual ("inicio=…&fim=…"), pra não perder o filtro ao navegar. */
  editarLinks: { label: string; href: (cenarioId: string, periodo?: string) => string }[];
};

const hrefVendas = (cenarioId: string) => (cenarioId ? `/plano/${cenarioId}/vendas` : "/cenarios");
const hrefPlanoCustos = (cenarioId: string) => (cenarioId ? `/plano/${cenarioId}/custos` : "/cenarios");
/** Junta a query do período com o que a URL já tem. */
const comPeriodo = (url: string, periodo?: string) =>
  periodo ? (url.includes("?") ? `${url}&${periodo}` : `${url}?${periodo}`) : url;
/**
 * Atalho que abre o Plano de Custos JÁ no card certo, expandido e com o período preservado:
 * ?card=marketing abre o card, #card-marketing rola até ele. É o mesmo ciclo da tela de Vendas —
 * ajusta, recalcula ali e olha a tabela sem procurar onde era.
 */
const hrefCard = (card: string) => (cenarioId: string, periodo?: string) =>
  cenarioId ? `${comPeriodo(`/plano/${cenarioId}/custos?card=${card}`, periodo)}#card-${card}` : "/cenarios";
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
    formula:
      "(Receita líquida − COGS) ÷ Receita líquida, no período selecionado. Receita líquida = receita − impostos sobre a receita (DAS enquanto está no Simples; ISS + PIS/COFINS ou CBS/IBS, líquidos de crédito, depois). É a mesma base do benchmark de SaaS (70–85%).",
    editarLinks: [{ label: "Plano de Custos → CSP (COGS do produto)", href: hrefCard("csp") }],
  },
  {
    key: "ticket_entrada",
    titulo: "Ticket de entrada (mês 1)",
    formula:
      "O que um cliente novo paga no mês em que entra: a parcela de implantação que ele quita no ato (pelo mix de formas de pagamento) + a 1ª mensalidade. Implantação é serviço profissional, receita ÚNICA — por isso não entra em MRR, ARR, PMV nem ARPA, mas é o caixa do mês 1 e é com ele que se compara o CAC.",
    editarLinks: [
      { label: "Implantação e formas de pagamento (Produtos)", href: (cenarioId: string) => (cenarioId ? `/produtos?cenario=${cenarioId}` : "/produtos") },
      { label: "Planos e níveis (Produtos)", href: (cenarioId: string) => (cenarioId ? `/produtos?cenario=${cenarioId}` : "/produtos") },
    ],
  },
  {
    key: "cac",
    titulo: "CAC (all-in)",
    formula:
      "Fully-loaded: (Marketing + Vendas + Outros S&M — mídia, ferramentas, folha comercial própria e compartilhada, comissões, terceirizados) ÷ novos clientes adquiridos, no período selecionado.",
    editarLinks: [
      { label: "Equipe comercial: SDR e vendedor", href: (cenarioId: string) => `/contratacoes/necessidade?cenario=${cenarioId}&cargo=sdr` },
      { label: "Plano de Custos → Marketing", href: hrefCard("marketing") },
      { label: "Plano de Custos → Vendas", href: hrefCard("vendas") },
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
    titulo: "TIR do projeto — taxa interna de retorno",
    formula:
      "Taxa que zera o valor presente do fluxo mensal de caixa da EMPRESA (EBITDA menos IRPJ/CSLL), anualizada. Com capital novo vinculado, ele sai no mês do aporte e volta como caixa. Atenção: não é o retorno do investidor — esse fluxo credita 100% do caixa da empresa a quem comprou só uma fatia. O retorno de quem investe está na simulação da rodada, em Relatórios: valor de saída × participação.",
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
    editarLinks: [{ label: "Plano de Custos → CSP", href: hrefCard("csp") }],
  },
  {
    key: "sm",
    titulo: "Vendas e Marketing (S&M) — o que entra na linha",
    formula:
      "Tudo o que traz cliente: mídia do self-service, fechamento/comissão/crédito pagos a parceiros, equipe comercial alocada (SDR, vendedor, coordenador), feiras e eventos, e custos da empresa em contas 2.1.x. É o numerador do CAC.",
    editarLinks: [
      { label: "Canais de aquisição (Vendas)", href: hrefVendas },
      { label: "Plano de Custos → Marketing", href: hrefCard("marketing") },
      { label: "Plano de Custos → Vendas", href: hrefCard("vendas") },
      { label: "Equipe comercial (Necessidade de Contratação)", href: (cenarioId: string) => `/contratacoes/necessidade?cenario=${cenarioId}` },
    ],
  },
  {
    key: "pd",
    titulo: "P&D — o que entra na linha",
    formula: "Desenvolvimento de produto: custos da empresa em contas 2.2.x, equipe alocada de P&D e contratações por produto.",
    editarLinks: [{ label: "Plano de Custos → Desenvolvimento", href: hrefCard("desenvolvimento") }],
  },
  {
    key: "ga",
    titulo: "G&A — o que entra na linha",
    formula:
      "Estrutura: custos da empresa em contas 2.3.x e 2.4.x (marca), filiação mensal às associações parceiras (fora do CAC) e equipe alocada de G&A.",
    editarLinks: [
      { label: "Plano de Custos → Estrutura", href: hrefCard("estrutura_escritorio") },
      { label: "Plano de Custos → Taxas e serviços", href: hrefCard("taxas") },
    ],
  },
];

export function indicadorPorKey(key: string | undefined): IndicadorDef {
  return INDICADORES.find((i) => i.key === key) ?? INDICADORES[0];
}
