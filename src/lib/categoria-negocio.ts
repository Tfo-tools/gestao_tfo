// Categorias em linguagem de negócio pra lançamento rápido — não são as linhas da DRE (COGS/S&M/
// P&D/G&A), são o que passa pela cabeça na hora de lançar ("isso foi software", "isso foi uma
// feira"). Cada categoria aponta pra um punhado de contas do plano de contas; a classificação
// contábil usada nos relatórios (src/lib/grupo-dre.ts) não muda em nada.
//
// Lista revisada por ela na planilha "plano_de_contas_proposta_codigos_revisado" (coluna
// "Filtro") — mantém os nomes e o agrupamento exatamente como anotado ali.
export type CategoriaNegocio =
  | "csp"
  | "marketing"
  | "vendas"
  | "marca"
  | "desenvolvimento"
  | "taxas"
  | "estrutura_escritorio"
  | "viagem"
  | "prestadores_servico"
  | "imprensa"
  | "financeiro"
  | "contratacoes"
  | "ativos";

/** As 11 categorias que aparecem pra escolher na tela de Lançamentos — "Contratações" (custo de
 * pessoal) fica de fora porque vai ter tela própria (Contratações → Realizado, ainda não
 * construída), e "Ativos" porque ainda não tem volume de uso nos primeiros anos. Extrato e
 * Recorrentes continuam enxergando as 13 (usam CATEGORIAS_NEGOCIO completo) pra não esconder
 * nada de quem está revisando o que já foi lançado. */
export const CATEGORIAS_LANCAMENTO: CategoriaNegocio[] = [
  "csp",
  "marketing",
  "vendas",
  "marca",
  "desenvolvimento",
  "taxas",
  "estrutura_escritorio",
  "viagem",
  "prestadores_servico",
  "imprensa",
  "financeiro",
];

export const CATEGORIAS_NEGOCIO: { chave: CategoriaNegocio; label: string }[] = [
  { chave: "csp", label: "Custos do serviço Prestado (CSP)" },
  { chave: "marketing", label: "Marketing" },
  { chave: "vendas", label: "Vendas" },
  { chave: "marca", label: "Marca" },
  { chave: "desenvolvimento", label: "Desenvolvimento" },
  { chave: "taxas", label: "Taxas" },
  { chave: "estrutura_escritorio", label: "Estrutura e escritório (Adm)" },
  { chave: "viagem", label: "Viagem" },
  { chave: "prestadores_servico", label: "Prestadores de serviços (contador, jurídico, consultoria)" },
  { chave: "imprensa", label: "Imprensa" },
  { chave: "financeiro", label: "Financeiro" },
  { chave: "contratacoes", label: "Contratações (pessoal)" },
  { chave: "ativos", label: "Ativos" },
];

const LABEL_POR_CHAVE = new Map(CATEGORIAS_NEGOCIO.map((c) => [c.chave, c.label]));

// Mapa direto código → categoria, a partir da coluna "Filtro" da planilha revisada. Códigos já no
// esquema unificado com o DRE/EBITDA (1.x Receita, 1.1 COGS, 2.1-2.4 Opex, 3.0 Financeiro, 5.0
// Capital, 6.0 Ativos). Um código que não aparece aqui (ex: 2.4.7 — ela pediu pra remover, o custo
// de locomoção de eventos de marca passa a entrar em G&A → Locomoção/Viagem) fica de fora da busca
// de lançamento, sem precisar apagar a conta do banco.
const CATEGORIA_POR_CODIGO: Record<string, CategoriaNegocio> = {
  // Custos do serviço Prestado (CSP)
  "1.1.1": "csp",
  "1.1.2": "csp",
  "1.1.4": "csp",
  "1.1.5": "csp",
  "1.1.6": "csp",
  // Contratações (pessoal) — CSP, S&M e G&A que são folha/comissão
  "1.1.3": "contratacoes",
  "2.1.4": "contratacoes",
  "2.1.5": "contratacoes",
  "2.3.1": "contratacoes",
  // Marketing
  "2.1.1": "marketing",
  "2.1.2": "marketing",
  "2.1.3.1": "marketing",
  "2.1.3.2": "marketing",
  "2.1.8": "marketing",
  "2.1.9": "marketing",
  // Vendas
  "2.1.6": "vendas",
  "2.1.7": "vendas",
  // Desenvolvimento
  "2.2.1": "desenvolvimento",
  "2.2.2": "desenvolvimento",
  "2.2.3": "desenvolvimento",
  "2.2.4": "desenvolvimento",
  "2.2.5": "desenvolvimento",
  "2.2.6": "desenvolvimento",
  "2.2.7": "desenvolvimento",
  // Prestadores de serviços (contador, jurídico, consultoria)
  "2.3.2": "prestadores_servico",
  "2.3.3": "prestadores_servico",
  "2.3.11": "prestadores_servico", // Consultoria — conta nova, pedida na revisão
  // Taxas
  "2.3.2.1": "taxas", // Registro/proteção de marca (INPI) — separado do jurídico de propósito
  "2.3.5": "taxas",
  // Estrutura e escritório (Adm)
  "2.3.4": "estrutura_escritorio",
  "2.3.4.1": "estrutura_escritorio",
  "2.3.6": "estrutura_escritorio",
  "2.3.9": "estrutura_escritorio",
  "2.3.10": "estrutura_escritorio",
  // Viagem
  "2.3.7": "viagem",
  "2.3.8": "viagem",
  // Marca
  "2.4.1": "marca",
  "2.4.2": "marca",
  "2.4.2.1": "marca",
  "2.4.2.2": "marca",
  "2.4.2.3": "marca",
  "2.4.3": "marca",
  "2.4.3.1": "marca",
  "2.4.3.2": "marca",
  "2.4.3.3": "marca",
  "2.4.3.4": "marca",
  "2.4.4": "marca",
  "2.4.5": "marca",
  // Imprensa — material (existente) e serviço (conta nova, pedida na revisão)
  "2.4.6": "imprensa",
  "2.4.8": "imprensa",
  // Financeiro
  "3.0.1": "financeiro",
  "3.0.2": "financeiro",
  "3.0.3": "financeiro",
  // Ativos
  "6.0.1": "ativos",
  "6.0.2": "ativos",
  "6.0.3": "ativos",
  "6.0.4": "ativos",
  "6.0.5": "ativos",
};

export type ContaComCodigo = { codigo: string };

/** Categoria de negócio de uma conta — undefined quando nem o código nem nenhum ancestral dele
 * está mapeado (conta desativada de propósito da busca de lançamento, como a 2.4.7 removida na
 * revisão). Uma subconta nova criada em Configurações → Plano de Contas (ex: "2.3.5.1") não tem
 * entrada própria aqui até alguém adicionar — em vez de sumir da busca, ela herda a categoria do
 * código pai mais próximo que já esteja mapeado (ex: herda de "2.3.5"). */
export function categoriaDeConta(c: ContaComCodigo): CategoriaNegocio | undefined {
  const direta = CATEGORIA_POR_CODIGO[c.codigo];
  if (direta) return direta;

  const partes = c.codigo.split(".");
  for (let i = partes.length - 1; i > 0; i--) {
    const categoriaAncestral = CATEGORIA_POR_CODIGO[partes.slice(0, i).join(".")];
    if (categoriaAncestral) return categoriaAncestral;
  }
  return undefined;
}

export function labelCategoriaNegocio(categoria: string): string {
  return LABEL_POR_CHAVE.get(categoria as CategoriaNegocio) ?? categoria;
}
