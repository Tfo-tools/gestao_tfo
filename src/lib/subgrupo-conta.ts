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

/** Categorização fina por código de conta (usada quando o custo já tem plano_contas_id vinculado).
 * Prefixos já no esquema unificado com o DRE/EBITDA (2.1 S&M, 2.2 P&D, 2.3 G&A, 2.4 Marca) — Marca
 * continua dobrada em "ga" aqui porque a simulação de Planos ainda não tem uma coluna própria pra
 * ela (só o lado Real, em grupo-dre.ts, já separa Marca na sua própria linha). */
export function subgrupoDeConta(codigo: string, tipo: string): SubgrupoConta {
  if (tipo === "cogs") {
    if (codigo.startsWith("1.1.3")) return "suporte"; // Pessoal Direto (CS/Suporte)
    if (codigo.startsWith("1.1.1")) return "infraestrutura"; // Infraestrutura e Cloud
    return "outros_cogs"; // APIs terceiros, softwares de atendimento, gateways, onboarding
  }
  if (codigo.startsWith("2.1")) {
    if (codigo.startsWith("2.1.6") || codigo.startsWith("2.1.7") || codigo.startsWith("2.1.8") || codigo.startsWith("2.1.9")) {
      return "outros_sm";
    }
    if (codigo.startsWith("2.1.4") || codigo.startsWith("2.1.5")) return "vendas";
    return "marketing"; // 2.1.1/2/3.x — mídia, agências, conteúdo
  }
  if (codigo.startsWith("2.2")) return "pd";
  if (codigo.startsWith("2.3") || codigo.startsWith("2.4")) return "ga";
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
