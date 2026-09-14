import { categoriaDeConta } from "@/lib/categoria-negocio";
import type { FocoInvestimento } from "@/lib/indicadores-investidor";

/**
 * Orçamento proposto de cada programa (Fomento & Investimento → programa → Orçamento): como o
 * recurso vai ser usado, linha a linha, com a conta do plano de contas. É a fonte do "uso do
 * recurso" nos Indicadores e na planilha do investidor.
 */

export type LinhaOrcamento = {
  programa_id: string;
  atividade: string;
  /** Justificativa estratégica / impacto (campo observações da linha). */
  justificativa: string | null;
  valor: number;
  data_inicio: string | null;
  data_fim: string | null;
  rubrica: string | null;
  fonte: string | null;
  conta_codigo: string | null;
  conta_nome: string | null;
  categoria: FocoInvestimento;
};

export const LABEL_CATEGORIA_USO: Record<FocoInvestimento, string> = {
  marketing: "Marketing",
  vendas: "Vendas",
  operacao: "Operação e suporte (COGS)",
  produto: "Produto e tecnologia (P&D)",
  estrutura: "Estrutura (G&A)",
};

/** Em que frente do investimento a conta cai — mesma divisão das colunas de foco da planilha. */
export function focoDeConta(
  codigo: string | null | undefined,
  tipo: string | null | undefined,
): FocoInvestimento {
  if (!codigo) return "estrutura";
  if (tipo === "cogs" || codigo.startsWith("1.1")) return "operacao";
  if (codigo.startsWith("2.1")) {
    const cat = categoriaDeConta({ codigo });
    return cat === "vendas" || cat === "contratacoes" ? "vendas" : "marketing";
  }
  if (codigo.startsWith("2.2")) return "produto";
  return "estrutura";
}

export async function carregarOrcamentoProgramas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  programaIds: string[],
): Promise<LinhaOrcamento[]> {
  if (programaIds.length === 0) return [];
  const { data } = await supabase
    .from("programa_linhas_previstas")
    .select(
      "programa_id, atividade, observacoes, valor, data_inicio, data_fim, rubrica:rubrica_id(nome, fonte), conta:plano_contas_id(codigo, conta, tipo)",
    )
    .in("programa_id", programaIds)
    .order("data_inicio");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((l) => ({
    programa_id: l.programa_id,
    atividade: l.atividade,
    justificativa: l.observacoes ?? null,
    valor: Number(l.valor ?? 0),
    data_inicio: l.data_inicio,
    data_fim: l.data_fim,
    rubrica: l.rubrica?.nome ?? null,
    fonte: l.rubrica?.fonte ?? null,
    conta_codigo: l.conta?.codigo ?? null,
    conta_nome: l.conta?.conta ?? null,
    categoria: focoDeConta(l.conta?.codigo, l.conta?.tipo),
  }));
}

export function somaPorCategoria(
  linhas: LinhaOrcamento[],
): Map<FocoInvestimento, number> {
  const m = new Map<FocoInvestimento, number>();
  for (const l of linhas)
    m.set(l.categoria, (m.get(l.categoria) ?? 0) + l.valor);
  return m;
}
