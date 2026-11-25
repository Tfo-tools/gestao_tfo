/**
 * Orçamento no tempo (controle de estouro) — rubrica/atividade × mês, com UM valor por célula que
 * muda de estado: previsto (aprovado) → negociado (orçamento fechado) → realizado (pago no mês).
 *
 * Regra da célula, por mês:
 *   - pago naquele mês        → realizado (valor da despesa vinculada à linha)
 *   - senão, orçamento fechado→ negociado (valor negociado distribuído no período)
 *   - senão                   → previsto  (valor aprovado distribuído no período)
 * A diferença (Δ) de cada mês é val − previsto, e é 0 enquanto a linha é só previsto (não executada).
 * Projeção = soma das células; Estouro = projeção − previsto; Saldo = teto − projeção.
 *
 * Controla a subvenção econômica (fonte 'subvencao', fora a bolsa). Bolsa e contrapartida à parte.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;

export type EstadoMes = "previsto" | "negociado" | "realizado";
export type CelulaMes = { estado: EstadoMes; val: number; prev: number; delta: number };
export type LinhaOrc = {
  id: string;
  rubrica: string;
  atividade: string;
  aprovado: number;
  negociado: number | null;
  estado: EstadoMes;
  consolidado: number;
  deltaConsolidado: number;
  meses: CelulaMes[];
};
export type OrcamentoTempo = {
  meses: string[]; // YYYY-MM
  linhas: LinhaOrc[];
  teto: number;
  previstoMes: number[];
  projecaoMes: number[];
  estouroMes: number[];
  previstoTotal: number;
  projecaoTotal: number;
  estouroTotal: number;
  realizadoTotal: number;
  orcamentariaPct: number;
  saldo: number;
};

function mesesEntre(ini: string, fim: string): string[] {
  const out: string[] = [];
  let y = Number(ini.slice(0, 4)), m = Number(ini.slice(5, 7));
  const fy = Number(fim.slice(0, 4)), fm = Number(fim.slice(5, 7));
  let g = 0;
  while ((y < fy || (y === fy && m <= fm)) && g++ < 60) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
/** Distribui um valor linearmente nos meses, com o resto no último (soma exata). */
function distribui(valor: number, meses: string[]): Record<string, number> {
  const n = meses.length; if (n === 0) return {};
  const base = r2(valor / n); const out: Record<string, number> = {}; let acc = 0;
  meses.forEach((mm, i) => { const v = i === n - 1 ? r2(valor - acc) : base; out[mm] = v; acc = r2(acc + v); });
  return out;
}

type RubRaw = { id: string; nome: string; fonte: string };
type LinhaRaw = { id: string; rubrica_id: string | null; atividade: string | null; valor: number; data_inicio: string; data_fim: string; negociado: number | null };
type DespRaw = { linha_id: string | null; valor_total: number; data_gasto: string };

export async function carregarOrcamentoTempo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  programaId: string,
): Promise<OrcamentoTempo> {
  // negociado pode não existir antes da migration: cai no modo base.
  async function selLinhas(): Promise<LinhaRaw[]> {
    const full = await supabase
      .from("programa_linhas_previstas")
      .select("id, rubrica_id, atividade, valor, data_inicio, data_fim, negociado")
      .eq("programa_id", programaId);
    if (!full.error) return (full.data ?? []) as LinhaRaw[];
    const base = await supabase
      .from("programa_linhas_previstas")
      .select("id, rubrica_id, atividade, valor, data_inicio, data_fim")
      .eq("programa_id", programaId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((base.data ?? []) as any[]).map((l) => ({ ...l, negociado: null })) as LinhaRaw[];
  }
  async function selDespesas(): Promise<DespRaw[]> {
    const full = await supabase.from("despesas").select("linha_id, valor_total, data_gasto").eq("programa_id", programaId);
    if (!full.error) return (full.data ?? []) as DespRaw[];
    return [];
  }

  const [{ data: programa }, { data: rubricasRaw }, linhasRaw, despesasRaw] = await Promise.all([
    supabase.from("programas_investimento").select("valor_subvencao").eq("id", programaId).maybeSingle(),
    supabase.from("programa_rubricas").select("id, nome, fonte").eq("programa_id", programaId),
    selLinhas(),
    selDespesas(),
  ]);

  const teto = Number(programa?.valor_subvencao ?? 0);
  // só subvenção econômica (fora a bolsa) entra no controle de teto
  const rubricas = ((rubricasRaw ?? []) as RubRaw[]).filter((r) => r.fonte === "subvencao" && !/bolsa/i.test(r.nome));
  const rubIds = new Set(rubricas.map((r) => r.id));
  const nomeRub = new Map(rubricas.map((r) => [r.id, r.nome]));
  const linhas = (linhasRaw as LinhaRaw[]).filter((l) => l.rubrica_id && rubIds.has(l.rubrica_id) && l.data_inicio && l.data_fim);
  const despesas = despesasRaw as DespRaw[];

  // realizado por linha/mês
  const realizado = new Map<string, Record<string, number>>();
  const mesesSet = new Set<string>();
  for (const d of despesas) {
    if (!d.linha_id) continue;
    const m = d.data_gasto.slice(0, 7);
    const r = realizado.get(d.linha_id) ?? {};
    r[m] = r2((r[m] ?? 0) + Number(d.valor_total));
    realizado.set(d.linha_id, r);
    mesesSet.add(m);
  }
  for (const l of linhas) for (const m of mesesEntre(l.data_inicio, l.data_fim)) mesesSet.add(m);
  const meses = [...mesesSet].sort();

  const linhasOrc: LinhaOrc[] = [];
  const previstoMes = meses.map(() => 0), projecaoMes = meses.map(() => 0);
  let realizadoTotal = 0;

  for (const l of linhas) {
    const periodo = mesesEntre(l.data_inicio, l.data_fim);
    const prevDist = distribui(Number(l.valor), periodo);
    const negDist = l.negociado != null ? distribui(Number(l.negociado), periodo) : null;
    const real = realizado.get(l.id) ?? {};
    const temRealizado = Object.keys(real).length > 0;

    const cels: CelulaMes[] = meses.map((m) => {
      const prev = r2(prevDist[m] ?? 0);
      let estado: EstadoMes, val: number;
      if (real[m] != null) { estado = "realizado"; val = r2(real[m]); }
      else if (negDist) { estado = "negociado"; val = r2(negDist[m] ?? 0); }
      else { estado = "previsto"; val = prev; }
      return { estado, val, prev, delta: estado === "previsto" ? 0 : r2(val - prev) };
    });

    meses.forEach((_, i) => { previstoMes[i] = r2(previstoMes[i] + cels[i].prev); projecaoMes[i] = r2(projecaoMes[i] + cels[i].val); });
    const consolidado = r2(cels.reduce((s, c) => s + c.val, 0));
    realizadoTotal = r2(realizadoTotal + Object.values(real).reduce((s, v) => s + v, 0));
    const estado: EstadoMes = temRealizado ? "realizado" : l.negociado != null ? "negociado" : "previsto";

    linhasOrc.push({
      id: l.id,
      rubrica: nomeRub.get(l.rubrica_id!) ?? "—",
      atividade: l.atividade || "",
      aprovado: Number(l.valor),
      negociado: l.negociado != null ? Number(l.negociado) : null,
      estado,
      consolidado,
      deltaConsolidado: r2(consolidado - Number(l.valor)),
      meses: cels,
    });
  }

  linhasOrc.sort((a, b) => b.aprovado - a.aprovado);
  const previstoTotal = r2(previstoMes.reduce((s, v) => s + v, 0));
  const projecaoTotal = r2(projecaoMes.reduce((s, v) => s + v, 0));

  return {
    meses,
    linhas: linhasOrc,
    teto,
    previstoMes,
    projecaoMes,
    estouroMes: meses.map((_, i) => r2(projecaoMes[i] - previstoMes[i])),
    previstoTotal,
    projecaoTotal,
    estouroTotal: r2(projecaoTotal - previstoTotal),
    realizadoTotal,
    orcamentariaPct: teto > 0 ? Math.round((realizadoTotal / teto) * 100) : 0,
    saldo: r2(teto - projecaoTotal),
  };
}
