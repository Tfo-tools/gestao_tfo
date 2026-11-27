/**
 * Cronograma de prestação POR ATIVIDADE (não por rúbrica), ancorado na regra FAPES.
 *
 * Conceito (Manual 313/2022):
 *  - A ATIVIDADE (A-1..A-10, tabela programa_atividades) é a linha do cronograma — tem janela no tempo.
 *  - Cada atividade é paga por uma ou mais RÚBRICAS (atividade_rubrica); a rúbrica guarda o contrato/cotação.
 *  - Cada ENTREGA é o fato gerador do pagamento (9.7): paga-se DEPOIS que o prestador comprova (9.9),
 *    com 1 NF + 1 comprovante (9.2). Sem evidência, o slot fica "pendente" no mês previsto; com evidência
 *    e data, vira "entregue" (verde) e vai para o mês real (pode antecipar/atrasar).
 *  - Slots pendentes são COMPUTADOS por mês da atividade; só entregas confirmadas ficam gravadas.
 *
 * Também devolve os dois indicadores do painel (físico × orçamentário) e o corte Parcial/Final.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type EntregaConfirmada = {
  id: string;
  mesPrevisto: string; // YYYY-MM (slot que preenche)
  mesReal: string; // YYYY-MM (onde aparece em verde)
  evidenciaNome: string | null;
  valor: number | null;
};

export type RubricaDaAtividade = {
  rubricaId: string;
  nome: string;
  fonte: string;
  contrapartida: boolean;
  valorContrato: number; // soma das linhas da rúbrica (teto do contrato)
  entregas: EntregaConfirmada[];
};

export type AtividadeBarra = {
  id: string;
  codigo: string; // A-1
  nome: string;
  responsavel: string | null;
  iniPrev: string; // YYYY-MM-DD
  fimPrev: string; // YYYY-MM-DD
  meses: string[]; // YYYY-MM da janela
  pendentes: string[]; // YYYY-MM sem entrega confirmada (marcadores pendentes)
  rubricas: RubricaDaAtividade[];
  totalEntregas: number; // entregas confirmadas na atividade
};

/** Corte Parcial/Final da prestação (fonte: cronograma_prestação de contas.pdf — Termo de Outorga). */
export type CortePrestacao = { parcialFimMes: string; finalIniMes: string };

export type CronogramaEntregas = {
  meses: string[]; // eixo completo YYYY-MM
  atividades: AtividadeBarra[];
  corte: CortePrestacao;
  totalSlots: number; // oportunidades de entrega previstas (meses × atividade)
  entregues: number; // entregas confirmadas
  fisicoPct: number;
  gasto: number;
  teto: number;
  orcamentarioPct: number;
  antecipadas: number; // entregues antes do mês previsto (indicador interno)
};

const r2 = (v: number) => Math.round(v * 100) / 100;

function mesesEntre(ini: string, fim: string): string[] {
  const out: string[] = [];
  let y = Number(ini.slice(0, 4));
  let m = Number(ini.slice(5, 7));
  const fy = Number(fim.slice(0, 4));
  const fm = Number(fim.slice(5, 7));
  let g = 0;
  while ((y < fy || (y === fy && m <= fm)) && g++ < 120) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

type AtividadeRaw = { id: string; codigo: string; nome: string; responsavel: string | null; data_inicio: string; data_fim: string; ordem: number | null };
type VincRaw = { atividade_id: string; rubrica_id: string };
type RubRaw = { id: string; nome: string; fonte: string | null };
type LinhaRaw = { rubrica_id: string | null; valor: number };
type DespesaRaw = { valor_total: number };
type EntregaRaw = { id: string; atividade_id: string | null; rubrica_id: string | null; mes_previsto: string; mes_real: string | null; evidencia_caminho: string | null; evidencia_nome: string | null; valor: number | null };

// Corte da prestação Centelha III: 1ª Parcial 01/11/2026–30/04/2027, Final 01/05/2027–31/10/2027.
const CORTE: CortePrestacao = { parcialFimMes: "2027-04", finalIniMes: "2027-05" };

export async function carregarCronogramaEntregas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  programaId: string,
): Promise<CronogramaEntregas> {
  const admin = createAdminClient();

  const [{ data: programa }, atividadesRes, vincRes, { data: rubricasRaw }, { data: linhasRaw }, { data: despesasRaw }, entregasRes] = await Promise.all([
    supabase.from("programas_investimento").select("valor_subvencao, data_inicio_vigencia").eq("id", programaId).maybeSingle(),
    admin.from("programa_atividades").select("id, codigo, nome, responsavel, data_inicio, data_fim, ordem").eq("programa_id", programaId).order("ordem"),
    admin.from("atividade_rubrica").select("atividade_id, rubrica_id"),
    supabase.from("programa_rubricas").select("id, nome, fonte").eq("programa_id", programaId),
    supabase.from("programa_linhas_previstas").select("rubrica_id, valor").eq("programa_id", programaId),
    supabase.from("despesas").select("valor_total").eq("programa_id", programaId),
    admin.from("entregas").select("id, atividade_id, rubrica_id, mes_previsto, mes_real, evidencia_caminho, evidencia_nome, valor").eq("programa_id", programaId),
  ]);

  const atividades = (atividadesRes.data ?? []) as AtividadeRaw[];
  const vinc = (vincRes.data ?? []) as VincRaw[];
  const rubricas = (rubricasRaw ?? []) as RubRaw[];
  const linhas = (linhasRaw ?? []) as LinhaRaw[];
  const despesas = (despesasRaw ?? []) as DespesaRaw[];
  const entregas = (entregasRes.data ?? []) as EntregaRaw[];

  const rubById = new Map(rubricas.map((r) => [r.id, r]));
  // teto do contrato por rúbrica = soma das linhas
  const valorRub = new Map<string, number>();
  for (const l of linhas) { if (!l.rubrica_id) continue; valorRub.set(l.rubrica_id, r2((valorRub.get(l.rubrica_id) ?? 0) + Number(l.valor))); }
  // rúbricas de cada atividade
  const rubsDaAtiv = new Map<string, string[]>();
  for (const v of vinc) rubsDaAtiv.set(v.atividade_id, [...(rubsDaAtiv.get(v.atividade_id) ?? []), v.rubrica_id]);
  // entregas confirmadas por atividade+rúbrica
  const entregaPorAR = new Map<string, EntregaConfirmada[]>();
  const entregaMesPrevPorAtiv = new Map<string, Set<string>>(); // atividade -> meses previstos já cobertos
  let entregues = 0;
  let antecipadas = 0;
  for (const e of entregas) {
    if (!e.atividade_id || !e.evidencia_caminho || !e.mes_real) continue; // só confirmadas
    entregues++;
    if (e.mes_real < e.mes_previsto) antecipadas++;
    const item: EntregaConfirmada = { id: e.id, mesPrevisto: e.mes_previsto, mesReal: e.mes_real, evidenciaNome: e.evidencia_nome, valor: e.valor };
    const k = `${e.atividade_id}|${e.rubrica_id}`;
    entregaPorAR.set(k, [...(entregaPorAR.get(k) ?? []), item]);
    const s = entregaMesPrevPorAtiv.get(e.atividade_id) ?? new Set<string>();
    s.add(e.mes_previsto); entregaMesPrevPorAtiv.set(e.atividade_id, s);
  }

  let totalSlots = 0;
  const barras: AtividadeBarra[] = atividades.map((a) => {
    const meses = mesesEntre(a.data_inicio, a.data_fim);
    totalSlots += meses.length;
    const cobertos = entregaMesPrevPorAtiv.get(a.id) ?? new Set<string>();
    const pendentes = meses.filter((m) => !cobertos.has(m));
    const rubs: RubricaDaAtividade[] = (rubsDaAtiv.get(a.id) ?? []).map((rid) => {
      const r = rubById.get(rid);
      const fonte = r?.fonte ?? "subvencao";
      return {
        rubricaId: rid,
        nome: r?.nome ?? "Rúbrica",
        fonte,
        contrapartida: fonte === "contrapartida",
        valorContrato: valorRub.get(rid) ?? 0,
        entregas: (entregaPorAR.get(`${a.id}|${rid}`) ?? []).sort((x, y) => x.mesReal.localeCompare(y.mesReal)),
      };
    }).sort((x, y) => (x.contrapartida === y.contrapartida ? y.valorContrato - x.valorContrato : x.contrapartida ? 1 : -1));
    return {
      id: a.id, codigo: a.codigo, nome: a.nome, responsavel: a.responsavel,
      iniPrev: a.data_inicio, fimPrev: a.data_fim, meses, pendentes, rubricas: rubs,
      totalEntregas: rubs.reduce((s, r) => s + r.entregas.length, 0),
    };
  });

  // eixo de meses: da 1ª atividade (ou vigência) à última
  const inicios = barras.map((b) => b.iniPrev);
  const fins = barras.map((b) => b.fimPrev);
  const vig = programa?.data_inicio_vigencia ?? null;
  const todasIni = [...inicios, ...(vig ? [vig] : [])];
  const inicio = todasIni.length ? todasIni.reduce((a, b) => (a < b ? a : b)) : vig || `${new Date().getFullYear()}-01-01`;
  const fimMax = fins.length ? fins.reduce((a, b) => (a > b ? a : b)) : inicio;
  const meses = mesesEntre(inicio, fimMax);

  const gasto = r2(despesas.reduce((s, d) => s + Number(d.valor_total), 0));
  const teto = Number(programa?.valor_subvencao ?? 0);

  return {
    meses,
    atividades: barras,
    corte: CORTE,
    totalSlots,
    entregues,
    fisicoPct: totalSlots > 0 ? Math.round((entregues / totalSlots) * 100) : 0,
    gasto,
    teto,
    orcamentarioPct: teto > 0 ? Math.round((gasto / teto) * 100) : 0,
    antecipadas,
  };
}
