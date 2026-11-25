/**
 * Cronograma de prestação em BARRAS (previsto × executado), por atividade.
 *
 * A "entrega/atividade" é uma linha do orçamento (programa_linhas_previstas): já tem atividade,
 * valor, data_inicio e data_fim — a barra PREVISTA. A EXECUÇÃO vem de duas colunas novas na própria
 * linha (fim_real, status) e do pagamento vinculado (despesas.linha_id → ponto azul).
 *
 * Também calcula os dois indicadores que o painel mostra lado a lado:
 *  - execução FÍSICA  = atividades entregues ÷ total de atividades;
 *  - execução ORÇAMENTÁRIA = gasto com o recurso (despesas do programa) ÷ subvenção aprovada.
 * Os dois podem divergir de propósito (atividade cara entregue/paga antes puxa o orçamentário à
 * frente do físico), e é isso que o painel deixa visível.
 */

export type EntregaStatus = "previsto" | "andamento" | "entregue";

export type DespesaDaEntrega = { id: string; descricao: string; valor: number; dataGasto: string };

export type EntregaBarra = {
  id: string; // id da linha do orçamento
  rubricaId: string | null;
  atividade: string;
  valor: number;
  iniPrev: string; // YYYY-MM-DD
  fimPrev: string; // YYYY-MM-DD
  fimReal: string | null;
  status: EntregaStatus;
  /** Mês do pagamento (menor data_gasto entre as despesas vinculadas), ou null. */
  pagoMes: string | null; // YYYY-MM
  pago: boolean;
  despesas: DespesaDaEntrega[];
};

export type RubricaEntregas = { id: string; nome: string; valor: number; entregas: EntregaBarra[] };

export type CronogramaEntregas = {
  /** Meses do eixo (YYYY-MM), do início da vigência/atividades até a última entrega. */
  meses: string[];
  rubricas: RubricaEntregas[];
  semRubrica: EntregaBarra[];
  totalEntregas: number;
  entregues: number;
  fisicoPct: number;
  gasto: number;
  teto: number;
  orcamentarioPct: number;
  /** Atividades entregues antes do previsto — folga para antecipar (indicador interno). */
  antecipadas: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const ym = (iso: string) => iso.slice(0, 7);

function mesesEntre(ini: string, fim: string): string[] {
  const out: string[] = [];
  let y = Number(ini.slice(0, 4));
  let m = Number(ini.slice(5, 7));
  const fy = Number(fim.slice(0, 4));
  const fm = Number(fim.slice(5, 7));
  let g = 0;
  while ((y < fy || (y === fy && m <= fm)) && g++ < 60) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

type LinhaRaw = {
  id: string;
  rubrica_id: string | null;
  atividade: string | null;
  valor: number;
  data_inicio: string;
  data_fim: string;
  fim_real: string | null;
  status: string | null;
};
type DespesaRaw = { id: string; descricao: string | null; valor_total: number; data_gasto: string; linha_id: string | null };

export async function carregarCronogramaEntregas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  programaId: string,
): Promise<CronogramaEntregas> {
  // Tolerante à migration ainda não aplicada: se fim_real/status/linha_id não existem no banco,
  // cai no modo base (tudo "previsto", sem vínculo de pagamento) em vez de quebrar a página.
  async function selLinhas(): Promise<LinhaRaw[]> {
    const full = await supabase
      .from("programa_linhas_previstas")
      .select("id, rubrica_id, atividade, valor, data_inicio, data_fim, fim_real, status")
      .eq("programa_id", programaId);
    if (!full.error) return (full.data ?? []) as LinhaRaw[];
    const base = await supabase
      .from("programa_linhas_previstas")
      .select("id, rubrica_id, atividade, valor, data_inicio, data_fim")
      .eq("programa_id", programaId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((base.data ?? []) as any[]).map((l) => ({ ...l, fim_real: null, status: "previsto" })) as LinhaRaw[];
  }
  async function selDespesas(): Promise<DespesaRaw[]> {
    const full = await supabase.from("despesas").select("id, descricao, valor_total, data_gasto, linha_id").eq("programa_id", programaId);
    if (!full.error) return (full.data ?? []) as DespesaRaw[];
    const base = await supabase.from("despesas").select("id, descricao, valor_total, data_gasto").eq("programa_id", programaId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((base.data ?? []) as any[]).map((d) => ({ ...d, linha_id: null })) as DespesaRaw[];
  }

  const [{ data: programa }, { data: rubricasRaw }, linhasRaw, despesasRaw] = await Promise.all([
    supabase.from("programas_investimento").select("valor_subvencao, data_inicio_vigencia").eq("id", programaId).maybeSingle(),
    supabase.from("programa_rubricas").select("id, nome").eq("programa_id", programaId).order("nome"),
    selLinhas(),
    selDespesas(),
  ]);

  const rubricas = (rubricasRaw ?? []) as { id: string; nome: string }[];
  const linhas = (linhasRaw as LinhaRaw[]).filter((l) => l.data_inicio && l.data_fim);
  const despesas = despesasRaw as DespesaRaw[];

  // Despesas por atividade (para o ponto de pago) e gasto total do recurso.
  const despPorLinha = new Map<string, DespesaDaEntrega[]>();
  let gasto = 0;
  for (const d of despesas) {
    gasto = r2(gasto + Number(d.valor_total));
    if (!d.linha_id) continue;
    const item = { id: d.id, descricao: d.descricao || "—", valor: Number(d.valor_total), dataGasto: d.data_gasto };
    despPorLinha.set(d.linha_id, [...(despPorLinha.get(d.linha_id) ?? []), item]);
  }

  const montaEntrega = (l: LinhaRaw): EntregaBarra => {
    const ds = (despPorLinha.get(l.id) ?? []).sort((a, b) => a.dataGasto.localeCompare(b.dataGasto));
    const pagoMes = ds.length > 0 ? ym(ds[0].dataGasto) : null;
    const status = (l.status === "andamento" || l.status === "entregue" ? l.status : "previsto") as EntregaStatus;
    return {
      id: l.id,
      rubricaId: l.rubrica_id,
      atividade: l.atividade || "Atividade",
      valor: Number(l.valor),
      iniPrev: l.data_inicio,
      fimPrev: l.data_fim,
      fimReal: l.fim_real,
      status,
      pagoMes,
      pago: ds.length > 0,
      despesas: ds,
    };
  };

  const entregas = linhas.map(montaEntrega);

  // Eixo de meses: do início da vigência (ou 1ª atividade) à última data relevante.
  const inicios = entregas.map((e) => e.iniPrev);
  const fins = entregas.flatMap((e) => [e.fimPrev, e.fimReal].filter((x): x is string => !!x));
  const pagos = entregas.map((e) => e.pagoMes).filter((x): x is string => !!x).map((m) => `${m}-01`);
  const vig = programa?.data_inicio_vigencia ?? null;
  const todasIni = [...inicios, ...(vig ? [vig] : [])];
  const todasFim = [...fins, ...pagos];
  const inicio = todasIni.length ? todasIni.reduce((a, b) => (a < b ? a : b)) : vig || `${new Date().getFullYear()}-01-01`;
  const fimMax = todasFim.length ? todasFim.reduce((a, b) => (a > b ? a : b)) : inicio;
  const meses = mesesEntre(inicio, fimMax);

  const porRubrica = new Map<string, EntregaBarra[]>();
  const semRubrica: EntregaBarra[] = [];
  for (const e of entregas) {
    if (!e.rubricaId) { semRubrica.push(e); continue; }
    porRubrica.set(e.rubricaId, [...(porRubrica.get(e.rubricaId) ?? []), e]);
  }

  const rubricasEntregas: RubricaEntregas[] = rubricas
    .map((r) => {
      const es = (porRubrica.get(r.id) ?? []).sort((a, b) => a.iniPrev.localeCompare(b.iniPrev));
      return { id: r.id, nome: r.nome, valor: r2(es.reduce((s, e) => s + e.valor, 0)), entregas: es };
    })
    .filter((r) => r.entregas.length > 0);

  const totalEntregas = entregas.length;
  const entregues = entregas.filter((e) => e.status === "entregue").length;
  const antecipadas = entregas.filter((e) => e.fimReal && e.fimReal < e.fimPrev).length;
  const teto = Number(programa?.valor_subvencao ?? 0);

  return {
    meses,
    rubricas: rubricasEntregas,
    semRubrica: semRubrica.sort((a, b) => a.iniPrev.localeCompare(b.iniPrev)),
    totalEntregas,
    entregues,
    fisicoPct: totalEntregas > 0 ? Math.round((entregues / totalEntregas) * 100) : 0,
    gasto,
    teto,
    orcamentarioPct: teto > 0 ? Math.round((gasto / teto) * 100) : 0,
    antecipadas,
  };
}
