// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function materializarDespesasRecorrentes(supabase: any) {
  const hoje = new Date();
  const mesAtualIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  const proximoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  const proximoMesIso = `${proximoMes.getFullYear()}-${String(proximoMes.getMonth() + 1).padStart(2, "0")}-01`;
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();

  const { data: recorrentes } = await supabase
    .from("despesas_recorrentes")
    .select("id, plano_contas_id, produto_id, descricao, valor, pagador, dia_do_mes, data_inicio, data_fim")
    .eq("ativo", true)
    .lte("data_inicio", mesAtualIso);

  const ativas = (
    (recorrentes ?? []) as { id: string; data_fim: string | null }[]
  ).filter((r) => !r.data_fim || r.data_fim >= mesAtualIso);

  if (ativas.length === 0) return;

  const { data: existentes } = await supabase
    .from("despesas")
    .select("despesa_recorrente_id")
    .in(
      "despesa_recorrente_id",
      ativas.map((r) => r.id),
    )
    .gte("data_gasto", mesAtualIso)
    .lt("data_gasto", proximoMesIso);

  const jaMaterializadas = new Set(((existentes ?? []) as { despesa_recorrente_id: string }[]).map((e) => e.despesa_recorrente_id));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const faltantes = ativas.filter((r) => !jaMaterializadas.has(r.id));
  if (faltantes.length === 0) return;

  const novasDespesas = faltantes.map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rr = r as any;
    const dia = Math.min(rr.dia_do_mes, ultimoDiaMes);
    return {
      data_gasto: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
      plano_contas_id: rr.plano_contas_id,
      produto_id: rr.produto_id,
      valor_total: rr.valor,
      descricao: rr.descricao,
      pagador: rr.pagador,
      comprovado: false,
      despesa_recorrente_id: rr.id,
      criado_por: user?.id ?? null,
    };
  });

  await supabase.from("despesas").insert(novasDespesas);
}
