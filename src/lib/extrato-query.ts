export type FiltrosExtrato = {
  desde?: string | null;
  ate?: string | null;
  conta?: string | null;
  contaIds?: string[] | null;
  produto?: string | null;
  comprovado?: string | null;
  pagador?: string | null;
  descricao?: string | null;
};

export type DespesaExportada = {
  data_gasto: string;
  valor_total: number;
  comprovado: boolean;
  descricao: string | null;
  pagador: string | null;
  plano_contas: { codigo: string; conta: string } | null;
  despesa_produtos: { produtos: { nome: string } | null }[];
};

function proximoMesIso(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const next = new Date(y, m, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Mesma lógica de filtro usada no Extrato — compartilhada entre a exportação CSV e XLSX pra não
 * divergir do que a tela mostra. */
export async function buscarDespesasFiltradas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  filtros: FiltrosExtrato,
): Promise<DespesaExportada[]> {
  const { desde, ate, conta, contaIds, produto, comprovado, pagador, descricao } = filtros;

  let query = supabase
    .from("despesas")
    .select(
      produto
        ? "data_gasto, valor_total, comprovado, descricao, pagador, plano_contas:plano_contas_id(codigo, conta), despesa_produtos!inner(produtos(nome))"
        : "data_gasto, valor_total, comprovado, descricao, pagador, plano_contas:plano_contas_id(codigo, conta), despesa_produtos(produtos(nome))",
    )
    .order("data_gasto", { ascending: false });

  if (desde) query = query.gte("data_gasto", `${desde}-01`);
  if (ate) query = query.lt("data_gasto", proximoMesIso(ate));
  if (conta) query = query.eq("plano_contas_id", conta);
  if (contaIds && contaIds.length > 0) query = query.in("plano_contas_id", contaIds);
  if (produto) query = query.eq("despesa_produtos.produto_id", produto);
  if (comprovado === "sim") query = query.eq("comprovado", true);
  if (comprovado === "nao") query = query.eq("comprovado", false);
  if (pagador) query = query.eq("pagador", pagador);
  if (descricao) query = query.ilike("descricao", `%${descricao}%`);

  const { data } = await query;
  return (data ?? []) as unknown as DespesaExportada[];
}

export function nomesProdutosDe(d: DespesaExportada) {
  return d.despesa_produtos.map((dp) => dp.produtos?.nome).filter(Boolean).join(" / ");
}

/** Resolve o filtro "tipo de despesa" (a mesma divisão usada no lançamento — COGS/S&M/P&D/G&A/
 * Marca/Financeiro/Ativos) pra uma lista de plano_contas_id, já que não é uma coluna do banco. */
export async function resolverContaIdsPorTipo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tipo: string | null,
): Promise<string[] | null> {
  if (!tipo) return null;
  const { categoriaDeConta } = await import("@/lib/categoria-negocio");
  const { data } = await supabase.from("plano_contas").select("id, codigo").in("tipo", ["cogs", "opex", "financeiro", "ativo"]);
  return ((data ?? []) as { id: string; codigo: string }[]).filter((c) => categoriaDeConta(c) === tipo).map((c) => c.id);
}
