export type GrupoConta = "cogs" | "sm" | "pd" | "ga" | "financeiro" | "ativo" | "outros";

export function grupoDeConta(codigo: string, tipo: string): GrupoConta {
  if (tipo === "cogs") return "cogs";
  if (codigo.startsWith("4.2.1")) return "sm";
  if (codigo.startsWith("4.2.2")) return "pd";
  if (codigo.startsWith("4.2.3") || codigo.startsWith("4.2.4")) return "ga";
  if (tipo === "financeiro") return "financeiro";
  if (tipo === "ativo") return "ativo";
  return "outros";
}
