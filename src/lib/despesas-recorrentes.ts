function mesDe(dataIso: string) {
  return `${dataIso.slice(0, 7)}-01`;
}

function proximoMes(mesIso: string) {
  const [y, m] = mesIso.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function ultimoDiaDoMes(mesIso: string) {
  const [y, m] = mesIso.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** Materializa TODOS os meses faltantes de cada despesa recorrente ativa, desde o mês de
 * data_inicio até o mês atual (não só o mês corrente) — uma recorrência cadastrada com início
 * retroativo deve preencher o histórico inteiro, não só daqui pra frente. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function materializarDespesasRecorrentes(supabase: any) {
  const mesAtualIso = mesDe(new Date().toISOString());

  const { data: recorrentes } = await supabase
    .from("despesas_recorrentes")
    .select("id, plano_contas_id, produto_id, descricao, valor, pagador, dia_do_mes, data_inicio, data_fim")
    .eq("ativo", true)
    .lte("data_inicio", mesAtualIso);

  type Recorrente = {
    id: string;
    plano_contas_id: string;
    produto_id: string | null;
    descricao: string;
    valor: number;
    pagador: string | null;
    dia_do_mes: number;
    data_inicio: string;
    data_fim: string | null;
  };
  const ativas = (recorrentes ?? []) as Recorrente[];
  if (ativas.length === 0) return;

  const { data: existentes } = await supabase
    .from("despesas")
    .select("despesa_recorrente_id, data_gasto")
    .in(
      "despesa_recorrente_id",
      ativas.map((r) => r.id),
    );

  const jaMaterializadas = new Set(
    ((existentes ?? []) as { despesa_recorrente_id: string; data_gasto: string }[]).map(
      (e) => `${e.despesa_recorrente_id}|${e.data_gasto.slice(0, 7)}`,
    ),
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const novasDespesas: Record<string, unknown>[] = [];
  for (const r of ativas) {
    let mes = mesDe(r.data_inicio);
    const mesFim = r.data_fim && mesDe(r.data_fim) < mesAtualIso ? mesDe(r.data_fim) : mesAtualIso;
    let guarda = 0;
    while (mes <= mesFim && guarda < 600) {
      guarda += 1;
      const chave = `${r.id}|${mes.slice(0, 7)}`;
      if (!jaMaterializadas.has(chave)) {
        const dia = Math.min(r.dia_do_mes, ultimoDiaDoMes(mes));
        novasDespesas.push({
          data_gasto: `${mes.slice(0, 7)}-${String(dia).padStart(2, "0")}`,
          plano_contas_id: r.plano_contas_id,
          produto_id: r.produto_id,
          valor_total: r.valor,
          descricao: r.descricao,
          pagador: r.pagador,
          comprovado: false,
          despesa_recorrente_id: r.id,
          criado_por: user?.id ?? null,
        });
      }
      mes = proximoMes(mes);
    }
  }

  if (novasDespesas.length > 0) {
    await supabase.from("despesas").insert(novasDespesas);
  }
}
