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

/** Data efetiva do lançamento pra uma competência (mês) e um dia_do_mes configurado. Se o dia não
 * existe naquele mês (ex: dia 30 em fevereiro), o vencimento cai no dia 1º do mês seguinte — não
 * é "clampado" pro último dia do mês curto. */
function dataDoVencimento(mes: string, diaDoMes: number) {
  const ultimoDia = ultimoDiaDoMes(mes);
  if (diaDoMes <= ultimoDia) {
    return `${mes.slice(0, 7)}-${String(diaDoMes).padStart(2, "0")}`;
  }
  return `${proximoMes(mes).slice(0, 7)}-01`;
}

/** Materializa TODOS os meses (competências) faltantes de cada despesa recorrente ativa, desde o
 * mês de data_inicio até o mês atual — uma recorrência cadastrada com início retroativo preenche
 * o histórico inteiro, não só daqui pra frente. */
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

  const { data: produtosRaw } = await supabase
    .from("despesa_recorrente_produtos")
    .select("despesa_recorrente_id, produto_id")
    .in(
      "despesa_recorrente_id",
      ativas.map((r) => r.id),
    );
  const produtosPorRecorrente = new Map<string, string[]>();
  for (const p of (produtosRaw ?? []) as { despesa_recorrente_id: string; produto_id: string }[]) {
    const atual = produtosPorRecorrente.get(p.despesa_recorrente_id) ?? [];
    atual.push(p.produto_id);
    produtosPorRecorrente.set(p.despesa_recorrente_id, atual);
  }

  const { data: existentes } = await supabase
    .from("despesas")
    .select("despesa_recorrente_id, data_gasto, mes_competencia")
    .in(
      "despesa_recorrente_id",
      ativas.map((r) => r.id),
    );

  // Competência já coberta pra cada recorrente — usa mes_competencia quando existe (lançamentos
  // criados com esta lógica); cai pra data_gasto pra lançamentos antigos, de antes desse campo
  // existir, onde competência e data_gasto sempre coincidiam (nunca havia rollover de mês curto).
  const jaMaterializadas = new Set(
    ((existentes ?? []) as { despesa_recorrente_id: string; data_gasto: string; mes_competencia: string | null }[]).map(
      (e) => `${e.despesa_recorrente_id}|${mesDe(e.mes_competencia ?? e.data_gasto)}`,
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
      const chave = `${r.id}|${mes}`;
      if (!jaMaterializadas.has(chave)) {
        const produtoIds = produtosPorRecorrente.get(r.id) ?? [];
        novasDespesas.push({
          data_gasto: dataDoVencimento(mes, r.dia_do_mes),
          mes_competencia: mes,
          plano_contas_id: r.plano_contas_id,
          produto_id: r.produto_id ?? produtoIds[0] ?? null,
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

  if (novasDespesas.length === 0) return;

  const { data: despesasCriadas } = await supabase.from("despesas").insert(novasDespesas).select("id, despesa_recorrente_id");

  const novosDespesaProdutos: { despesa_id: string; produto_id: string }[] = [];
  for (const d of (despesasCriadas ?? []) as { id: string; despesa_recorrente_id: string }[]) {
    const produtoIds = produtosPorRecorrente.get(d.despesa_recorrente_id) ?? [];
    for (const produto_id of produtoIds) {
      novosDespesaProdutos.push({ despesa_id: d.id, produto_id });
    }
  }
  if (novosDespesaProdutos.length > 0) {
    await supabase.from("despesa_produtos").insert(novosDespesaProdutos);
  }
}
