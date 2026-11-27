/**
 * Documentos por rúbrica (prestação de contas): consolida, por rúbrica, cada pagamento lançado no mês
 * e os documentos anexados a ele (boleto, nota fiscal, comprovante de pagamento), além da atividade
 * do cronograma vinculada e se ela foi entregue. É o que alimenta a aba "Documentos" — a tela única
 * pra onde o prestador é direcionado. Puxa tudo de despesas + anexos_despesa + as linhas do cronograma.
 */

import { createAdminClient } from "@/lib/supabase/admin";

const r2 = (v: number) => Math.round(v * 100) / 100;

export type DocRef = { id: string } | null;
/** Uma entrega comprovada (ou pendente) de uma atividade da rúbrica, puxada da tabela `entregas`. */
export type EntregaDoc = {
  entregaId: string | null;
  atividade: string;
  mesPrevisto: string; // YYYY-MM
  mesReal: string | null; // YYYY-MM
  entregue: boolean;
  evidenciaNome: string | null;
};
export type PagamentoDoc = {
  despesaId: string;
  mes: string; // YYYY-MM
  data: string; // YYYY-MM-DD
  valor: number;
  descricao: string;
  boleto: DocRef;
  nf: DocRef; // nota fiscal / fatura
  comprovante: DocRef; // comprovante de pagamento (transferência)
  atividade: string | null;
  entregue: boolean;
  fimReal: string | null;
};
export type RubricaDoc = {
  id: string;
  nome: string;
  fonte: string;
  contrapartida: boolean;
  atividade: string | null;
  total: number;
  pagamentos: PagamentoDoc[];
  /** Entregas por mês das atividades da rúbrica (verde = com evidência; pendente = sem). */
  entregas: EntregaDoc[];
};
export type Documentos = { rubricas: RubricaDoc[] };

type RubRaw = { id: string; nome: string; fonte: string | null };
type LinhaRaw = { id: string; rubrica_id: string | null; atividade: string | null; valor: number; status: string | null; fim_real: string | null; data_inicio: string | null; data_fim: string | null };
type EntregaRaw = { id: string; linha_id: string; mes_previsto: string; mes_real: string | null; evidencia_caminho: string | null; evidencia_nome: string | null };

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
type AnexoRaw = { id: string; tipo: string | null };
type DespRaw = { id: string; descricao: string | null; valor_total: number; data_gasto: string; rubrica_id: string | null; linha_id: string | null; anexos_despesa?: AnexoRaw[] };

const acha = (anexos: AnexoRaw[], tipos: string[]): DocRef => {
  const a = anexos.find((x) => x.tipo && tipos.includes(x.tipo));
  return a ? { id: a.id } : null;
};

export async function carregarDocumentos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  programaId: string,
): Promise<Documentos> {
  // Tolerante à migration de execução (status/fim_real/linha_id) ainda não aplicada.
  async function selLinhas(): Promise<LinhaRaw[]> {
    const full = await supabase.from("programa_linhas_previstas").select("id, rubrica_id, atividade, valor, status, fim_real, data_inicio, data_fim").eq("programa_id", programaId);
    if (!full.error) return (full.data ?? []) as LinhaRaw[];
    const base = await supabase.from("programa_linhas_previstas").select("id, rubrica_id, atividade, valor, data_inicio, data_fim").eq("programa_id", programaId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((base.data ?? []) as any[]).map((l) => ({ ...l, status: null, fim_real: null })) as LinhaRaw[];
  }
  // Entregas vivem em tabela de RLS fechada — lidas pelo serviço.
  async function selEntregas(): Promise<EntregaRaw[]> {
    const { data } = await createAdminClient()
      .from("entregas")
      .select("id, linha_id, mes_previsto, mes_real, evidencia_caminho, evidencia_nome")
      .eq("programa_id", programaId);
    return (data ?? []) as EntregaRaw[];
  }
  async function selDespesas(): Promise<DespRaw[]> {
    const full = await supabase.from("despesas").select("id, descricao, valor_total, data_gasto, rubrica_id, linha_id, anexos_despesa(id, tipo)").eq("programa_id", programaId);
    if (!full.error) return (full.data ?? []) as DespRaw[];
    const base = await supabase.from("despesas").select("id, descricao, valor_total, data_gasto, rubrica_id, anexos_despesa(id, tipo)").eq("programa_id", programaId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((base.data ?? []) as any[]).map((d) => ({ ...d, linha_id: null })) as DespRaw[];
  }

  const [{ data: rubricasRaw }, linhas, despesas, entregasRaw] = await Promise.all([
    supabase.from("programa_rubricas").select("id, nome, fonte").eq("programa_id", programaId),
    selLinhas(),
    selDespesas(),
    selEntregas(),
  ]);

  const rubricas = (rubricasRaw ?? []) as RubRaw[];
  const linhaPorId = new Map(linhas.map((l) => [l.id, l]));
  const entregaPorSlot = new Map<string, EntregaRaw>();
  for (const e of entregasRaw) entregaPorSlot.set(`${e.linha_id}|${e.mes_previsto}`, e);

  // Entregas por rúbrica: para cada atividade (linha) com período, um slot por mês; o slot vira verde
  // quando há evidência na tabela `entregas` e exibe o mês real da entrega.
  const entregasRub = new Map<string, EntregaDoc[]>();
  for (const l of linhas) {
    if (!l.rubrica_id || !l.data_inicio || !l.data_fim) continue;
    const ds: EntregaDoc[] = mesesEntre(l.data_inicio, l.data_fim).map((mp) => {
      const e = entregaPorSlot.get(`${l.id}|${mp}`);
      return {
        entregaId: e?.id ?? null,
        atividade: l.atividade || "Atividade",
        mesPrevisto: mp,
        mesReal: e?.mes_real ?? null,
        entregue: !!e?.evidencia_caminho,
        evidenciaNome: e?.evidencia_nome ?? null,
      };
    });
    entregasRub.set(l.rubrica_id, [...(entregasRub.get(l.rubrica_id) ?? []), ...ds]);
  }
  const totalRub = new Map<string, number>();
  const atividadeRub = new Map<string, string>();
  for (const l of linhas) {
    if (!l.rubrica_id) continue;
    totalRub.set(l.rubrica_id, r2((totalRub.get(l.rubrica_id) ?? 0) + Number(l.valor)));
    if (l.atividade && !atividadeRub.has(l.rubrica_id)) atividadeRub.set(l.rubrica_id, l.atividade);
  }

  const pagPorRub = new Map<string, PagamentoDoc[]>();
  for (const d of despesas) {
    const linha = d.linha_id ? linhaPorId.get(d.linha_id) : undefined;
    const rubId = d.rubrica_id ?? linha?.rubrica_id ?? null;
    if (!rubId) continue; // despesa sem rúbrica entra em "a classificar" na aba Orçamento
    const anexos = d.anexos_despesa ?? [];
    const pag: PagamentoDoc = {
      despesaId: d.id,
      mes: d.data_gasto.slice(0, 7),
      data: d.data_gasto,
      valor: Number(d.valor_total),
      descricao: d.descricao || "—",
      boleto: acha(anexos, ["boleto"]),
      nf: acha(anexos, ["nota_fiscal", "fatura"]),
      comprovante: acha(anexos, ["comprovante_pagamento"]),
      atividade: linha?.atividade ?? null,
      entregue: linha?.status === "entregue",
      fimReal: linha?.fim_real ?? null,
    };
    pagPorRub.set(rubId, [...(pagPorRub.get(rubId) ?? []), pag]);
  }

  const out: RubricaDoc[] = rubricas
    .map((r) => {
      const fonte = r.fonte ?? "subvencao";
      const pagamentos = (pagPorRub.get(r.id) ?? []).sort((a, b) => a.data.localeCompare(b.data));
      return {
        id: r.id,
        nome: r.nome,
        fonte,
        contrapartida: fonte === "contrapartida",
        atividade: atividadeRub.get(r.id) ?? null,
        total: totalRub.get(r.id) ?? 0,
        pagamentos,
        entregas: (entregasRub.get(r.id) ?? []).sort((a, b) => (a.mesReal ?? a.mesPrevisto).localeCompare(b.mesReal ?? b.mesPrevisto)),
      };
    })
    .filter((r) => !/bolsa/i.test(r.nome)) // bolsa não tem comprovação de serviço
    .sort((a, b) => (a.contrapartida === b.contrapartida ? b.total - a.total : a.contrapartida ? 1 : -1));

  return { rubricas: out };
}
