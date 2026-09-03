import { grupoDeConta, GRUPO_LABELS } from "@/lib/grupo-dre";

export type ContaComTipo = { codigo: string; tipo: string };

export const OUTROS_GRUPO_LABEL: Record<string, string> = {
  financeiro: "Financeiro (juros, tarifas, câmbio)",
  ativo: "Ativos e investimentos permanentes",
  marca: "Lançamento e construção de marca (pré-operação)",
};

export const ORDEM_GRUPOS_AMPLO = ["cogs", "sm", "pd", "ga", "marca", "financeiro", "ativo"];

/** Mesma divisão usada no lançamento — "marca" (4.2.4) sai de dentro de G&A só pra reduzir a
 * lista; o relatório continua classificando 4.2.4 como G&A, sem mudar os indicadores. */
export function grupoAmploDe(c: ContaComTipo): string {
  if (c.codigo.startsWith("4.2.4")) return "marca";
  return grupoDeConta(c.codigo, c.tipo) ?? c.tipo;
}

export function labelGrupoAmplo(grupo: string): string {
  if (grupo === "cogs") return "COGS — Custo dos Serviços Prestados";
  if (grupo === "sm" || grupo === "pd" || grupo === "ga") return GRUPO_LABELS[grupo as "sm" | "pd" | "ga"];
  return OUTROS_GRUPO_LABEL[grupo] ?? grupo;
}
