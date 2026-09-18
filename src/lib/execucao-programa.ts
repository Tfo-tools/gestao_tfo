/**
 * Execução de um programa (fomento ou investimento) por conta do plano de contas: quanto foi
 * previsto no orçamento e quanto já entrou na despesa.
 *
 * Uma regra só, usada pela Prestação de Contas e pelo gráfico de destinação dos Indicadores — assim
 * o que o investidor confere e o que a sócia vê nunca divergem:
 *  - PREVISTO por conta = soma das linhas do orçamento proposto (programa_linhas_previstas) na conta.
 *  - REALIZADO por conta = despesas lançadas nessa conta entre a primeira e a última data do
 *    orçamento do programa. Não há vínculo direto despesa → programa; a conta e o período é que
 *    dizem o que foi executado com o recurso.
 *
 * É por programa, de propósito: dois programas que orçam a mesma conta contariam a mesma despesa
 * duas vezes se fossem somados.
 */

export type ExecucaoConta = { id: string; conta: string; previsto: number; realizado: number };

export type ExecucaoPrograma = {
  porConta: ExecucaoConta[];
  totalPrevisto: number;
  totalRealizado: number;
  desde: string | null;
  ate: string | null;
};

type LinhaOrcamento = {
  plano_contas_id: string;
  valor: number;
  data_inicio: string | null;
  data_fim: string | null;
  plano_contas: { codigo: string; conta: string } | null;
};

/** A conta pura: recebe as linhas do orçamento e as despesas já filtradas. Testável sem banco. */
export function calcularExecucao(
  linhas: LinhaOrcamento[],
  despesas: { plano_contas_id: string; valor_total: number }[],
): Omit<ExecucaoPrograma, "desde" | "ate"> {
  const contaIds = [...new Set(linhas.map((l) => l.plano_contas_id))];
  const realizadoPorConta = new Map<string, number>();
  for (const d of despesas) {
    realizadoPorConta.set(d.plano_contas_id, (realizadoPorConta.get(d.plano_contas_id) ?? 0) + Number(d.valor_total));
  }
  const porConta = contaIds
    .map((id) => {
      const linhasConta = linhas.filter((l) => l.plano_contas_id === id);
      const previsto = linhasConta.reduce((s, l) => s + Number(l.valor), 0);
      return {
        id,
        conta: linhasConta[0]?.plano_contas ? `${linhasConta[0].plano_contas.codigo} — ${linhasConta[0].plano_contas.conta}` : "—",
        previsto,
        realizado: realizadoPorConta.get(id) ?? 0,
      };
    })
    .sort((a, b) => b.previsto - a.previsto);
  return {
    porConta,
    totalPrevisto: porConta.reduce((s, c) => s + c.previsto, 0),
    totalRealizado: porConta.reduce((s, c) => s + c.realizado, 0),
  };
}

/** Período do programa: da primeira à última data do orçamento. */
export function periodoDoOrcamento(linhas: Pick<LinhaOrcamento, "data_inicio" | "data_fim">[]): { desde: string | null; ate: string | null } {
  const datas = linhas.flatMap((l) => [l.data_inicio, l.data_fim]).filter((d): d is string => !!d);
  return {
    desde: datas.length > 0 ? datas.reduce((a, b) => (a < b ? a : b)) : null,
    ate: datas.length > 0 ? datas.reduce((a, b) => (a > b ? a : b)) : null,
  };
}

export async function carregarExecucaoPrograma(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  programaId: string,
): Promise<ExecucaoPrograma> {
  const { data: linhasRaw } = await supabase
    .from("programa_linhas_previstas")
    .select("plano_contas_id, valor, data_inicio, data_fim, plano_contas:plano_contas_id(codigo, conta)")
    .eq("programa_id", programaId);
  const linhas = ((linhasRaw ?? []) as LinhaOrcamento[]).filter((l) => l.plano_contas_id);
  const { desde, ate } = periodoDoOrcamento(linhas);
  const contaIds = [...new Set(linhas.map((l) => l.plano_contas_id))];

  let despesas: { plano_contas_id: string; valor_total: number }[] = [];
  if (contaIds.length > 0) {
    let query = supabase.from("despesas").select("plano_contas_id, valor_total").in("plano_contas_id", contaIds);
    if (desde) query = query.gte("data_gasto", desde);
    if (ate) query = query.lte("data_gasto", ate);
    const { data } = await query;
    despesas = data ?? [];
  }
  return { ...calcularExecucao(linhas, despesas), desde, ate };
}
