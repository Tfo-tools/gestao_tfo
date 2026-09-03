// Categorias em linguagem de negócio pra lançamento rápido — não são as linhas da DRE (COGS/S&M/
// P&D/G&A), são o que passa pela cabeça na hora de lançar ("isso foi software", "isso foi uma
// feira"). Cada categoria aponta pra um punhado de contas do plano de contas; a classificação
// contábil usada nos relatórios (src/lib/grupo-dre.ts) não muda em nada.
export type CategoriaNegocio =
  | "software"
  | "ia"
  | "marketing"
  | "servicos"
  | "feiras_eventos"
  | "vendas"
  | "equipe"
  | "infraestrutura"
  | "produto"
  | "escritorio"
  | "marca"
  | "implementacao"
  | "financeiro"
  | "ativos";

export const CATEGORIAS_NEGOCIO: { chave: CategoriaNegocio; label: string }[] = [
  { chave: "software", label: "Software e ferramentas" },
  { chave: "ia", label: "IA e APIs" },
  { chave: "marketing", label: "Marketing e publicidade" },
  { chave: "servicos", label: "Serviços profissionais (jurídico, contábil, consultoria)" },
  { chave: "feiras_eventos", label: "Feiras e eventos" },
  { chave: "vendas", label: "Vendas e comercial" },
  { chave: "equipe", label: "Equipe e pessoal" },
  { chave: "infraestrutura", label: "Nuvem e infraestrutura" },
  { chave: "produto", label: "Produto e desenvolvimento" },
  { chave: "escritorio", label: "Escritório e estrutura" },
  { chave: "marca", label: "Marca e identidade visual" },
  { chave: "implementacao", label: "Implementação e onboarding" },
  { chave: "financeiro", label: "Financeiro (juros, câmbio, tarifas)" },
  { chave: "ativos", label: "Ativos e equipamentos" },
];

const LABEL_POR_CHAVE = new Map(CATEGORIAS_NEGOCIO.map((c) => [c.chave, c.label]));

// Mapa direto código → categoria. Cobre as 63 contas hoje disponíveis pro lançamento (tipo em
// cogs/opex/financeiro/ativo) — cada código aparece em exatamente uma categoria.
const CATEGORIA_POR_CODIGO: Record<string, CategoriaNegocio> = {
  // Software e ferramentas
  "4.1.4": "software",
  "4.2.1.06": "software",
  "4.2.2.02": "software",
  "4.2.3.06": "software",
  "6.1.2": "software",
  // IA e APIs
  "4.1.2": "ia",
  // Nuvem e infraestrutura
  "4.1": "infraestrutura",
  "4.1.1": "infraestrutura",
  "4.1.5": "infraestrutura",
  "4.2.2.05": "infraestrutura",
  // Implementação e onboarding
  "4.1.6": "implementacao",
  // Equipe e pessoal
  "4.1.3": "equipe",
  "4.2.1.04": "equipe",
  "4.2.2.01": "equipe",
  "4.2.3.01": "equipe",
  // Marketing e publicidade
  "4.2.1": "marketing",
  "4.2.1.01": "marketing",
  "4.2.1.02": "marketing",
  "4.2.1.03.1": "marketing",
  "4.2.1.03.2": "marketing",
  "4.2.1.09": "marketing",
  // Vendas e comercial
  "4.2.1.05": "vendas",
  "4.2.1.07": "vendas",
  // Feiras e eventos
  "4.2.1.08": "feiras_eventos",
  "4.2.4.03": "feiras_eventos",
  "4.2.4.03.1": "feiras_eventos",
  "4.2.4.03.2": "feiras_eventos",
  "4.2.4.03.3": "feiras_eventos",
  "4.2.4.03.4": "feiras_eventos",
  "4.2.4.07": "feiras_eventos",
  // Produto e desenvolvimento
  "4.2.2": "produto",
  "4.2.2.03": "produto",
  "4.2.2.06": "produto",
  "4.2.2.07": "produto",
  // Serviços profissionais
  "4.2.2.04": "servicos",
  "4.2.3.02": "servicos",
  "4.2.3.02.1": "servicos",
  "4.2.3.03": "servicos",
  // Escritório e estrutura
  "4.2.3": "escritorio",
  "4.2.3.04": "escritorio",
  "4.2.3.04.1": "escritorio",
  "4.2.3.05": "escritorio",
  "4.2.3.07": "escritorio",
  "4.2.3.08": "escritorio",
  "4.2.3.09": "escritorio",
  "4.2.3.10": "escritorio",
  // Marca e identidade visual
  "4.2.4": "marca",
  "4.2.4.01": "marca",
  "4.2.4.02": "marca",
  "4.2.4.02.1": "marca",
  "4.2.4.02.2": "marca",
  "4.2.4.02.3": "marca",
  "4.2.4.04": "marca",
  "4.2.4.05": "marca",
  "4.2.4.06": "marca",
  // Financeiro
  "4.3": "financeiro",
  "4.3.1": "financeiro",
  "4.3.2": "financeiro",
  "4.3.3": "financeiro",
  // Ativos e equipamentos
  "6.1": "ativos",
  "6.1.1": "ativos",
  "6.1.3": "ativos",
  "6.1.4": "ativos",
  "6.1.5": "ativos",
};

export type ContaComCodigo = { codigo: string };

/** Categoria de negócio de uma conta — cai em "escritorio" se algum código novo do plano de
 * contas ainda não tiver sido mapeado (fallback seguro, nunca deixa uma conta inalcançável). */
export function categoriaDeConta(c: ContaComCodigo): CategoriaNegocio {
  return CATEGORIA_POR_CODIGO[c.codigo] ?? "escritorio";
}

export function labelCategoriaNegocio(categoria: string): string {
  return LABEL_POR_CHAVE.get(categoria as CategoriaNegocio) ?? categoria;
}
