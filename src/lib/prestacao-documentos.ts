/**
 * Dossiê de prestação (tela própria): consolida a comprovação em duas partes, do jeito que a regra
 * FAPES separa:
 *   1) ENTREGAS por ATIVIDADE — a evidência de cada entrega (fato gerador), verde/pendente por mês.
 *   2) DOCUMENTOS de PAGAMENTO por SERVIÇO (rúbrica) — boleto, nota fiscal e comprovante de cada
 *      despesa lançada, mais a cotação (3 propostas) que é do contrato, não da entrega.
 * Entregas vêm da tabela `entregas` (RLS fechada, via serviço); pagamentos de `despesas` + anexos.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type DocRef = { id: string } | null;

export type EntregaDoc = {
  entregaId: string | null;
  mesPrevisto: string; // YYYY-MM
  mesReal: string | null;
  entregue: boolean;
  evidenciaNome: string | null;
  valor: number | null;
};
export type RubricaNaAtividade = {
  rubricaId: string;
  nome: string;
  fonte: string;
  contrapartida: boolean;
  valorContrato: number;
  entregas: EntregaDoc[];
};
export type AtividadeDoc = {
  id: string;
  codigo: string;
  nome: string;
  responsavel: string | null;
  rubricas: RubricaNaAtividade[];
};

export type PagamentoDoc = {
  despesaId: string;
  mes: string; // YYYY-MM
  data: string; // YYYY-MM-DD
  valor: number;
  descricao: string;
  boleto: DocRef;
  nf: DocRef;
  comprovante: DocRef;
};
export type ServicoDoc = {
  rubricaId: string;
  nome: string;
  fonte: string;
  contrapartida: boolean;
  valorContrato: number;
  pagamentos: PagamentoDoc[];
};

export type Dossie = {
  atividades: AtividadeDoc[];
  servicos: ServicoDoc[];
  corte: { parcialFimMes: string; finalIniMes: string };
  pendencias: number; // entregas pendentes + documentos de pagamento faltando
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const CORTE = { parcialFimMes: "2027-04", finalIniMes: "2027-05" };

function mesesEntre(ini: string, fim: string): string[] {
  const out: string[] = [];
  let y = Number(ini.slice(0, 4)); let m = Number(ini.slice(5, 7));
  const fy = Number(fim.slice(0, 4)); const fm = Number(fim.slice(5, 7));
  let g = 0;
  while ((y < fy || (y === fy && m <= fm)) && g++ < 120) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

const acha = (anexos: { id: string; tipo: string | null }[], tipos: string[]): DocRef => {
  const a = anexos.find((x) => x.tipo && tipos.includes(x.tipo));
  return a ? { id: a.id } : null;
};

type AtivRaw = { id: string; codigo: string; nome: string; responsavel: string | null; data_inicio: string; data_fim: string; ordem: number | null };
type RubRaw = { id: string; nome: string; fonte: string | null };
type EntregaRaw = { id: string; atividade_id: string | null; rubrica_id: string | null; mes_previsto: string; mes_real: string | null; evidencia_caminho: string | null; evidencia_nome: string | null; valor: number | null };
type DespRaw = { id: string; descricao: string | null; valor_total: number; data_gasto: string; rubrica_id: string | null; anexos_despesa?: { id: string; tipo: string | null }[] };

export async function carregarDossie(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  programaId: string,
): Promise<Dossie> {
  const admin = createAdminClient();

  async function selDespesas(): Promise<DespRaw[]> {
    const full = await supabase.from("despesas").select("id, descricao, valor_total, data_gasto, rubrica_id, anexos_despesa(id, tipo)").eq("programa_id", programaId);
    if (!full.error) return (full.data ?? []) as DespRaw[];
    const base = await supabase.from("despesas").select("id, descricao, valor_total, data_gasto, anexos_despesa(id, tipo)").eq("programa_id", programaId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((base.data ?? []) as any[]).map((d) => ({ ...d, rubrica_id: null })) as DespRaw[];
  }

  const [ativRes, vincRes, { data: rubRaw }, { data: linhasRaw }, despesas, entRes] = await Promise.all([
    admin.from("programa_atividades").select("id, codigo, nome, responsavel, data_inicio, data_fim, ordem").eq("programa_id", programaId).order("ordem"),
    admin.from("atividade_rubrica").select("atividade_id, rubrica_id"),
    supabase.from("programa_rubricas").select("id, nome, fonte").eq("programa_id", programaId),
    supabase.from("programa_linhas_previstas").select("rubrica_id, valor").eq("programa_id", programaId),
    selDespesas(),
    admin.from("entregas").select("id, atividade_id, rubrica_id, mes_previsto, mes_real, evidencia_caminho, evidencia_nome, valor").eq("programa_id", programaId),
  ]);

  const atividadesRaw = (ativRes.data ?? []) as AtivRaw[];
  const vinc = (vincRes.data ?? []) as { atividade_id: string; rubrica_id: string }[];
  const rubricas = (rubRaw ?? []) as RubRaw[];
  const rubById = new Map(rubricas.map((r) => [r.id, r]));
  const linhas = (linhasRaw ?? []) as { rubrica_id: string | null; valor: number }[];
  const entregas = (entRes.data ?? []) as EntregaRaw[];

  const valorRub = new Map<string, number>();
  for (const l of linhas) { if (!l.rubrica_id) continue; valorRub.set(l.rubrica_id, r2((valorRub.get(l.rubrica_id) ?? 0) + Number(l.valor))); }

  const rubsDaAtiv = new Map<string, string[]>();
  for (const v of vinc) rubsDaAtiv.set(v.atividade_id, [...(rubsDaAtiv.get(v.atividade_id) ?? []), v.rubrica_id]);

  // entregas confirmadas por atividade+rúbrica
  const confPorAR = new Map<string, EntregaRaw[]>();
  for (const e of entregas) {
    if (!e.atividade_id || !e.evidencia_caminho) continue;
    const k = `${e.atividade_id}|${e.rubrica_id}`;
    confPorAR.set(k, [...(confPorAR.get(k) ?? []), e]);
  }

  let pendencias = 0;

  const atividades: AtividadeDoc[] = atividadesRaw.map((a) => {
    const meses = mesesEntre(a.data_inicio, a.data_fim);
    const rubs: RubricaNaAtividade[] = (rubsDaAtiv.get(a.id) ?? []).map((rid) => {
      const r = rubById.get(rid);
      const fonte = r?.fonte ?? "subvencao";
      const conf = (confPorAR.get(`${a.id}|${rid}`) ?? []);
      const cobertos = new Set(conf.map((e) => e.mes_previsto));
      const entregasDoc: EntregaDoc[] = [
        ...conf.map((e) => ({ entregaId: e.id, mesPrevisto: e.mes_previsto, mesReal: e.mes_real, entregue: true, evidenciaNome: e.evidencia_nome, valor: e.valor })),
        ...meses.filter((m) => !cobertos.has(m)).map((m) => ({ entregaId: null, mesPrevisto: m, mesReal: null, entregue: false, evidenciaNome: null, valor: null })),
      ].sort((x, y) => (x.mesReal ?? x.mesPrevisto).localeCompare(y.mesReal ?? y.mesPrevisto));
      pendencias += entregasDoc.filter((e) => !e.entregue).length;
      return { rubricaId: rid, nome: r?.nome ?? "Rúbrica", fonte, contrapartida: fonte === "contrapartida", valorContrato: valorRub.get(rid) ?? 0, entregas: entregasDoc };
    });
    return { id: a.id, codigo: a.codigo, nome: a.nome, responsavel: a.responsavel, rubricas: rubs };
  });

  // Documentos de pagamento por serviço (rúbrica)
  const pagPorRub = new Map<string, PagamentoDoc[]>();
  for (const d of despesas) {
    if (!d.rubrica_id) continue;
    const anexos = d.anexos_despesa ?? [];
    const pag: PagamentoDoc = {
      despesaId: d.id, mes: d.data_gasto.slice(0, 7), data: d.data_gasto, valor: Number(d.valor_total), descricao: d.descricao || "—",
      boleto: acha(anexos, ["boleto"]), nf: acha(anexos, ["nota_fiscal", "fatura"]), comprovante: acha(anexos, ["comprovante_pagamento"]),
    };
    pagPorRub.set(d.rubrica_id, [...(pagPorRub.get(d.rubrica_id) ?? []), pag]);
  }
  const servicos: ServicoDoc[] = rubricas
    .filter((r) => !/bolsa/i.test(r.nome))
    .map((r) => {
      const fonte = r.fonte ?? "subvencao";
      const pagamentos = (pagPorRub.get(r.id) ?? []).sort((a, b) => a.data.localeCompare(b.data));
      for (const p of pagamentos) pendencias += (!p.boleto ? 1 : 0) + (!p.nf ? 1 : 0) + (!p.comprovante ? 1 : 0);
      return { rubricaId: r.id, nome: r.nome, fonte, contrapartida: fonte === "contrapartida", valorContrato: valorRub.get(r.id) ?? 0, pagamentos };
    })
    .sort((a, b) => (a.contrapartida === b.contrapartida ? b.valorContrato - a.valorContrato : a.contrapartida ? 1 : -1));

  return { atividades, servicos, corte: CORTE, pendencias };
}
