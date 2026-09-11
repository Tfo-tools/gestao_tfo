/**
 * Ponto de partida de um cenário espelhado.
 *
 * Um cenário novo (ex: "Com aporte — Jan/2027") não começa do zero: no primeiro mês do período ele
 * herda a base de clientes que o cenário de origem já tinha acumulado até ali. Guardamos esse saldo
 * em `cenarios.ponto_partida` (um retrato, editável) e o motor de simulação substitui a base
 * acumulada por ele no mês de início — ver `pontoPartida` em src/lib/simulacao.ts.
 */

export type PontoPartidaProduto = {
  /** Clientes ativos que o cenário usa como abertura (editável). */
  clientes: number;
  /** O que o cenário de origem tinha no mês anterior ao início — referência pra comparar a edição. */
  clientes_origem: number;
  mrr_origem: number;
};

export type PontoPartida = {
  /** Primeiro mês do cenário (AAAA-MM-01) — a abertura vale a partir dele. */
  mes: string;
  origem_id: string;
  origem_nome: string;
  capturado_em: string;
  produtos: Record<string, PontoPartidaProduto>;
};

export function mesAnterior(mesIso: string): string {
  const [y, m] = mesIso.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function pontoPartidaDoProduto(
  ponto: PontoPartida | null | undefined,
  produtoId: string,
): { mes: string; clientes_ativos: number } | null {
  const p = ponto?.produtos?.[produtoId];
  if (!ponto?.mes || !p) return null;
  return { mes: ponto.mes, clientes_ativos: Number(p.clientes ?? 0) };
}

/**
 * Lê no cenário de origem os clientes ativos de cada produto no mês ANTERIOR ao início do cenário
 * (o saldo com que o cenário novo abre). Retorna null quando a origem não tem projeção naquele mês
 * — aí não há de onde herdar e a simulação segue acumulando sozinha, como sempre foi.
 */
export async function capturarPontoPartida(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  origemId: string,
  dataInicioCenario: string,
  mapProdutoId: (id: string) => string = (id) => id,
): Promise<PontoPartida | null> {
  const mesInicio = `${dataInicioCenario.slice(0, 7)}-01`;
  const [{ data: origem }, { data: linhas }] = await Promise.all([
    supabase.from("cenarios").select("id, nome").eq("id", origemId).single(),
    supabase
      .from("simulacao_mensal")
      .select("produto_id, clientes_ativos, mrr")
      .eq("cenario_id", origemId)
      .eq("mes_referencia", mesAnterior(mesInicio)),
  ]);
  if (!origem || !linhas || linhas.length === 0) return null;

  const produtos: Record<string, PontoPartidaProduto> = {};
  for (const l of linhas as { produto_id: string; clientes_ativos: number; mrr: number | null }[]) {
    const clientes = Math.round(Number(l.clientes_ativos ?? 0));
    produtos[mapProdutoId(l.produto_id)] = { clientes, clientes_origem: clientes, mrr_origem: Number(l.mrr ?? 0) };
  }
  return { mes: mesInicio, origem_id: origem.id, origem_nome: origem.nome, capturado_em: new Date().toISOString(), produtos };
}
