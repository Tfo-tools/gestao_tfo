export type SubgrupoConta =
  | "suporte"
  | "infraestrutura"
  | "outros_cogs"
  | "marketing"
  | "vendas"
  | "outros_sm"
  | "pd"
  | "ga"
  | "outros";

/** Categorização fina por código de conta (usada quando o custo já tem plano_contas_id vinculado). */
export function subgrupoDeConta(codigo: string, tipo: string): SubgrupoConta {
  if (tipo === "cogs") {
    if (codigo.startsWith("4.1.3")) return "suporte"; // Pessoal Direto (CS/Suporte)
    if (codigo.startsWith("4.1.1")) return "infraestrutura"; // Infraestrutura e Cloud
    return "outros_cogs"; // APIs terceiros, softwares de atendimento, gateways, onboarding
  }
  if (codigo.startsWith("4.2.1")) {
    if (codigo.startsWith("4.2.1.06") || codigo.startsWith("4.2.1.07") || codigo.startsWith("4.2.1.08") || codigo.startsWith("4.2.1.09")) {
      return "outros_sm";
    }
    if (codigo.startsWith("4.2.1.04") || codigo.startsWith("4.2.1.05")) return "vendas";
    return "marketing"; // 4.2.1.01/02/03.x — mídia, agências, conteúdo
  }
  if (codigo.startsWith("4.2.2")) return "pd";
  if (codigo.startsWith("4.2.3") || codigo.startsWith("4.2.4")) return "ga";
  return "outros";
}

/**
 * Categorização para custos que só têm cargo + categoria (pd/sm/ga) — equipe alocada, contratações
 * e modelos de contratação, sem plano_contas vinculado. "Suporte" no cargo sempre vira COGS-suporte,
 * mesmo que a categoria salva seja S&M, porque é assim que o time pensa esse custo.
 */
export function subgrupoDeCargo(cargo: string | null | undefined, categoria: "pd" | "sm" | "ga"): SubgrupoConta {
  if (cargo && cargo.trim().toLowerCase().includes("suporte")) return "suporte";
  if (categoria === "pd") return "pd";
  if (categoria === "ga") return "ga";
  return "vendas";
}
