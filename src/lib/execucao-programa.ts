/**
 * Execução de um programa (fomento ou investimento) por conta do plano de contas: quanto foi
 * previsto no orçamento e quanto já foi pago com o recurso dele.
 *
 * Uma regra só, usada pela Prestação de Contas e pelo gráfico de destinação dos Indicadores — assim
 * o que o investidor confere e o que a sócia vê nunca divergem:
 *  - PREVISTO por conta = soma das linhas do orçamento proposto (programa_linhas_previstas).
 *  - USADO por conta = despesas VINCULADAS ao programa no lançamento (despesas.programa_id) — o que
 *    foi pago com o recurso dele (a conta específica do programa já preenche o vínculo).
 *
 * Antes o "usado" era qualquer despesa numa conta orçada dentro do período do programa, e isso
 * contava gasto que não saiu do recurso (ex.: serviços contábeis pagos pela empresa antes de o
 * Centelha liberar um real). O que define é de onde saiu o dinheiro, não a conta nem a data.
 *
 * Despesa vinculada numa conta que não estava no orçamento aparece como "fora do orçamento" — é o
 * que a prestação de contas vai questionar primeiro.
 */

export type ExecucaoConta = {
  id: string;
  conta: string;
  previsto: number;
  realizado: number;
  /** Conta sem linha no orçamento, mas com despesa vinculada ao programa. */
  foraDoOrcamento?: boolean;
};

export type DespesaVinculada = {
  id: string;
  data_gasto: string;
  descricao: string | null;
  valor_total: number;
  comprovado: boolean;
  plano_contas_id: string;
  plano_contas: { codigo: string; conta: string } | null;
};

export type ExecucaoPrograma = {
  porConta: ExecucaoConta[];
  totalPrevisto: number;
  totalRealizado: number;
  /** As despesas que comprovam o programa, da mais recente pra mais antiga. */
  despesas: DespesaVinculada[];
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

type DespesaParaConta = Pick<DespesaVinculada, "plano_contas_id" | "valor_total"> & {
  plano_contas?: { codigo: string; conta: string } | null;
};

const rotulo = (pc: { codigo: string; conta: string } | null | undefined) => (pc ? `${pc.codigo} — ${pc.conta}` : "—");

/** A conta pura: recebe as linhas do orçamento e as despesas vinculadas. Testável sem banco. */
export function calcularExecucao(
  linhas: LinhaOrcamento[],
  despesas: DespesaParaConta[],
): Omit<ExecucaoPrograma, "desde" | "ate" | "despesas"> {
  const usadoPorConta = new Map<string, number>();
  const nomeDaConta = new Map<string, string>();
  for (const d of despesas) {
    usadoPorConta.set(d.plano_contas_id, (usadoPorConta.get(d.plano_contas_id) ?? 0) + Number(d.valor_total));
    if (d.plano_contas) nomeDaConta.set(d.plano_contas_id, rotulo(d.plano_contas));
  }
  const orcadas = [...new Set(linhas.map((l) => l.plano_contas_id))];
  const porConta: ExecucaoConta[] = orcadas
    .map((id) => {
      const linhasConta = linhas.filter((l) => l.plano_contas_id === id);
      return {
        id,
        conta: rotulo(linhasConta[0]?.plano_contas),
        previsto: linhasConta.reduce((s, l) => s + Number(l.valor), 0),
        realizado: usadoPorConta.get(id) ?? 0,
      };
    })
    .sort((a, b) => b.previsto - a.previsto);
  // Contas pagas com o recurso mas que não estavam no orçamento: vão pro fim, destacadas.
  for (const [id, valor] of usadoPorConta) {
    if (!orcadas.includes(id)) porConta.push({ id, conta: nomeDaConta.get(id) ?? "—", previsto: 0, realizado: valor, foraDoOrcamento: true });
  }
  return {
    porConta,
    totalPrevisto: porConta.reduce((s, c) => s + c.previsto, 0),
    totalRealizado: porConta.reduce((s, c) => s + c.realizado, 0),
  };
}

/** Período do programa: da primeira à última data do orçamento (só pra exibir). */
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
  const [{ data: linhasRaw }, { data: despesasRaw }] = await Promise.all([
    supabase
      .from("programa_linhas_previstas")
      .select("plano_contas_id, valor, data_inicio, data_fim, plano_contas:plano_contas_id(codigo, conta)")
      .eq("programa_id", programaId),
    supabase
      .from("despesas")
      .select("id, data_gasto, descricao, valor_total, comprovado, plano_contas_id, plano_contas:plano_contas_id(codigo, conta)")
      .eq("programa_id", programaId)
      .order("data_gasto", { ascending: false }),
  ]);
  const linhas = ((linhasRaw ?? []) as LinhaOrcamento[]).filter((l) => l.plano_contas_id);
  const despesas = ((despesasRaw ?? []) as DespesaVinculada[]).filter((d) => d.plano_contas_id);
  return { ...calcularExecucao(linhas, despesas), despesas, ...periodoDoOrcamento(linhas) };
}
