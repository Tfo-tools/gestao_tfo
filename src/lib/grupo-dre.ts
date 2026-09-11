export type GrupoDre = "cogs" | "sm" | "pd" | "ga" | "marca";

export const GRUPO_LABELS: Record<GrupoDre, string> = {
  cogs: "COGS",
  sm: "Vendas e Marketing (S&M)",
  pd: "Pesquisa e Desenvolvimento (P&D)",
  ga: "Geral e Administrativo (G&A)",
  marca: "Marca: Lançamento e Fortalecimento",
};

export const GRUPO_TOOLTIP: Record<GrupoDre, string> = {
  cogs: "Cost of Goods Sold (Custo dos Produtos/Serviços Vendidos): custos diretos para entregar o produto — ex: infraestrutura, hospedagem, APIs de terceiros.",
  sm: "Sales & Marketing (Vendas e Marketing): custos para atrair e converter clientes — ex: anúncios, comissões, equipe comercial.",
  pd: "Pesquisa e Desenvolvimento: custos da equipe e ferramentas que constroem e evoluem o produto.",
  ga: "General & Administrative (Geral e Administrativo): custos de gestão da empresa — ex: contabilidade, jurídico, administrativo.",
  marca: "Custos de construção e fortalecimento de marca — lançamento, eventos, conteúdo institucional, imprensa — separados de G&A porque não são manutenção do negócio, são investimento em posicionamento.",
};

export const ORDEM_GRUPOS: GrupoDre[] = ["cogs", "sm", "pd", "ga", "marca"];

/** Classifica uma conta do plano de contas num grupo da DRE, ou null se ela não participa
 * da cascata operacional (receita, deduções, financeiro, capital, ativo). Prefixos já no
 * esquema unificado com o DRE/EBITDA (2.1 S&M, 2.2 P&D, 2.3 G&A, 2.4 Marca). */
export function grupoDeConta(codigo: string, tipo: string): GrupoDre | null {
  if (tipo === "cogs") return "cogs";
  if (codigo.startsWith("2.1")) return "sm";
  if (codigo.startsWith("2.2")) return "pd";
  if (codigo.startsWith("2.3")) return "ga";
  if (codigo.startsWith("2.4")) return "marca";
  return null;
}

/** Mesma classificação, retornando um rótulo pronto pra exibição — usado onde o grupo "Outros"
 * (financeiro/ativo/receita/dedução) também precisa aparecer, ex. a aba Realizado. */
export function grupoLabelDe(codigo: string, tipo: string): string {
  const grupo = grupoDeConta(codigo, tipo);
  if (grupo) return GRUPO_LABELS[grupo];
  if (tipo === "financeiro") return "Financeiro";
  if (tipo === "ativo") return "Ativos";
  return "Outros";
}
