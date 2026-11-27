/**
 * Documentos por rúbrica (prestação de contas): consolida, por rúbrica, cada pagamento lançado no mês
 * e os documentos anexados a ele (boleto, nota fiscal, comprovante de pagamento), além da atividade
 * do cronograma vinculada e se ela foi entregue. É o que alimenta a aba "Documentos" — a tela única
 * pra onde o prestador é direcionado. Puxa tudo de despesas + anexos_despesa + as linhas do cronograma.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;

export type DocRef = { id: string } | null;
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
};
export type Documentos = { rubricas: RubricaDoc[] };

type RubRaw = { id: string; nome: string; fonte: string | null };
type LinhaRaw = { id: string; rubrica_id: string | null; atividade: string | null; valor: number; status: string | null; fim_real: string | null };
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
    const full = await supabase.from("programa_linhas_previstas").select("id, rubrica_id, atividade, valor, status, fim_real").eq("programa_id", programaId);
    if (!full.error) return (full.data ?? []) as LinhaRaw[];
    const base = await supabase.from("programa_linhas_previstas").select("id, rubrica_id, atividade, valor").eq("programa_id", programaId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((base.data ?? []) as any[]).map((l) => ({ ...l, status: null, fim_real: null })) as LinhaRaw[];
  }
  async function selDespesas(): Promise<DespRaw[]> {
    const full = await supabase.from("despesas").select("id, descricao, valor_total, data_gasto, rubrica_id, linha_id, anexos_despesa(id, tipo)").eq("programa_id", programaId);
    if (!full.error) return (full.data ?? []) as DespRaw[];
    const base = await supabase.from("despesas").select("id, descricao, valor_total, data_gasto, rubrica_id, anexos_despesa(id, tipo)").eq("programa_id", programaId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((base.data ?? []) as any[]).map((d) => ({ ...d, linha_id: null })) as DespRaw[];
  }

  const [{ data: rubricasRaw }, linhas, despesas] = await Promise.all([
    supabase.from("programa_rubricas").select("id, nome, fonte").eq("programa_id", programaId),
    selLinhas(),
    selDespesas(),
  ]);

  const rubricas = (rubricasRaw ?? []) as RubRaw[];
  const linhaPorId = new Map(linhas.map((l) => [l.id, l]));
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
      };
    })
    .filter((r) => !/bolsa/i.test(r.nome)) // bolsa não tem comprovação de serviço
    .sort((a, b) => (a.contrapartida === b.contrapartida ? b.total - a.total : a.contrapartida ? 1 : -1));

  return { rubricas: out };
}
