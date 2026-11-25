/**
 * Prestação de contas de um programa de fomento: a planilha rubrica × mês, com o previsto (do
 * orçamento), o realizado (despesas que comprovam o programa, amarradas a uma rubrica) e o estado
 * das evidências de cada despesa, conforme a natureza. É o que colore a planilha e abre no detalhe.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;

export type Natureza = "pj" | "pf" | "prolabore" | "bolsa" | "passagem" | "diaria";
export type EvidenciaKey =
  | "nota_fiscal" | "cotacoes" | "comprovante_pagamento" | "rpa" | "guia_impostos"
  | "sefip_gfip" | "conectividade_social" | "comprovante_embarque" | "recibo_diaria" | "recibo";

export const EVIDENCIA_LABEL: Record<EvidenciaKey, string> = {
  nota_fiscal: "Nota fiscal",
  cotacoes: "Cotações (3 orçamentos)",
  comprovante_pagamento: "Comprovante de pagamento",
  rpa: "RPA",
  guia_impostos: "Guias dos impostos",
  sefip_gfip: "SEFIP/GFIP",
  conectividade_social: "Conectividade social",
  comprovante_embarque: "Comprovante de embarque",
  recibo_diaria: "Recibo de diária (Anexo IV)",
  recibo: "Recibo",
};

/** Qual tipo de anexo (anexos_despesa.tipo) satisfaz cada evidência. */
const TIPOS_DA_EVIDENCIA: Record<EvidenciaKey, string[]> = {
  nota_fiscal: ["fatura", "nota_fiscal"],
  cotacoes: ["cotacoes", "cotacao"],
  comprovante_pagamento: ["comprovante_pagamento"],
  rpa: ["rpa"],
  guia_impostos: ["guia_impostos"],
  sefip_gfip: ["sefip_gfip"],
  conectividade_social: ["conectividade_social"],
  comprovante_embarque: ["comprovante_embarque"],
  recibo_diaria: ["recibo_diaria"],
  recibo: ["recibo"],
};

export function naturezaDaRubrica(nome: string): Natureza {
  const n = nome.toLowerCase();
  if (/bolsa/.test(n)) return "bolsa";
  if (/pró.?labore|pro.?labore/.test(n)) return "prolabore";
  if (/pessoa física|pessoa fisica|\bpf\b|\brpa\b/.test(n)) return "pf";
  if (/passagem|aérea|aerea/.test(n)) return "passagem";
  if (/diária|diaria/.test(n)) return "diaria";
  return "pj"; // serviço PJ, assessoria, contábil, INPI, consultoria…
}

/** Evidências exigidas por natureza (conforme tutorial da prestação SIGFAPES). */
export function evidenciasExigidas(nat: Natureza): EvidenciaKey[] {
  switch (nat) {
    case "pj": return ["nota_fiscal", "cotacoes", "comprovante_pagamento"];
    case "pf": return ["rpa", "cotacoes", "guia_impostos", "comprovante_pagamento", "sefip_gfip", "conectividade_social"];
    case "passagem": return ["nota_fiscal", "comprovante_pagamento", "comprovante_embarque"];
    case "diaria": return ["recibo_diaria"];
    case "prolabore": return ["recibo", "comprovante_pagamento"];
    case "bolsa": return []; // à parte — sem instrução da FAPES ainda
  }
}

export type EvidenciaEstado = { key: EvidenciaKey; label: string; presente: boolean; anexoId: string | null };
export type DespesaCel = {
  id: string; descricao: string; valor: number; data_gasto: string; comprovado: boolean;
  evidencias: EvidenciaEstado[]; completa: boolean;
};
export type StatusCel = "vazio" | "parcial" | "ok" | "atrasado";
export type Celula = { mes: string; previsto: number; realizado: number; despesas: DespesaCel[]; status: StatusCel };
export type RubricaLinha = { id: string; nome: string; natureza: Natureza; fonte: string; contrapartida: boolean; atividade: string | null; porMes: Record<string, Celula>; totalPrevisto: number; totalRealizado: number };
export type Prestacao = {
  meses: string[];
  rubricas: RubricaLinha[];
  contrapartida: RubricaLinha[];
  bolsa: RubricaLinha[];
  naoAtribuidas: { id: string; descricao: string; valor: number; data_gasto: string }[];
};

function mesesEntre(ini: string, fim: string): string[] {
  const out: string[] = [];
  let y = Number(ini.slice(0, 4)); let m = Number(ini.slice(5, 7));
  const fy = Number(fim.slice(0, 4)); const fm = Number(fim.slice(5, 7));
  let g = 0;
  while ((y < fy || (y === fy && m <= fm)) && g++ < 240) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
function distribui(valor: number, meses: string[]): Record<string, number> {
  const n = meses.length; if (n === 0) return {};
  const base = r2(valor / n); const out: Record<string, number> = {}; let acc = 0;
  meses.forEach((mm, i) => { const v = i === n - 1 ? r2(valor - acc) : base; out[mm] = v; acc = r2(acc + v); });
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function carregarPrestacao(supabase: any, programaId: string): Promise<Prestacao> {
  const [{ data: rubricasRaw }, { data: linhas }, { data: despesasRaw }] = await Promise.all([
    supabase.from("programa_rubricas").select("id, nome, fonte").eq("programa_id", programaId),
    supabase.from("programa_linhas_previstas").select("rubrica_id, atividade, valor, data_inicio, data_fim").eq("programa_id", programaId),
    supabase.from("despesas").select("id, descricao, valor_total, data_gasto, comprovado, rubrica_id, anexos_despesa(id, tipo)").eq("programa_id", programaId),
  ]);

  const rubricas = (rubricasRaw ?? []) as { id: string; nome: string; fonte: string | null }[];
  const mesesSet = new Set<string>();
  const hoje = new Date().toISOString().slice(0, 7);

  // Previsto por rubrica/mês (distribuição linear no período de cada linha) e a atividade da linha.
  const previsto = new Map<string, Record<string, number>>();
  const atividadePorRubrica = new Map<string, string>();
  for (const l of (linhas ?? []) as { rubrica_id: string | null; atividade: string | null; valor: number; data_inicio: string | null; data_fim: string | null }[]) {
    if (!l.rubrica_id) continue;
    if (l.atividade && !atividadePorRubrica.has(l.rubrica_id)) atividadePorRubrica.set(l.rubrica_id, l.atividade);
    if (!l.data_inicio || !l.data_fim) continue;
    const ms = mesesEntre(l.data_inicio, l.data_fim);
    ms.forEach((m) => mesesSet.add(m));
    const parts = distribui(Number(l.valor), ms);
    const atual = previsto.get(l.rubrica_id) ?? {};
    for (const [m, v] of Object.entries(parts)) atual[m] = r2((atual[m] ?? 0) + v);
    previsto.set(l.rubrica_id, atual);
  }

  // Despesas que comprovam o programa, agrupadas por rubrica/mês.
  type DespRaw = { id: string; descricao: string | null; valor_total: number; data_gasto: string; comprovado: boolean; rubrica_id: string | null; anexos_despesa?: { id: string; tipo: string | null }[] };
  const despesas = (despesasRaw ?? []) as DespRaw[];
  const despesaCel = (d: DespRaw, nat: Natureza): DespesaCel => {
    const anexos = d.anexos_despesa ?? [];
    const evidencias = evidenciasExigidas(nat).map((key) => {
      const anexo = anexos.find((a) => a.tipo && TIPOS_DA_EVIDENCIA[key].includes(a.tipo));
      return { key, label: EVIDENCIA_LABEL[key], presente: !!anexo, anexoId: anexo?.id ?? null };
    });
    return { id: d.id, descricao: d.descricao || "—", valor: Number(d.valor_total), data_gasto: d.data_gasto, comprovado: d.comprovado, evidencias, completa: evidencias.length === 0 ? true : evidencias.every((e) => e.presente) };
  };

  const despPorRubricaMes = new Map<string, DespesaCel[]>();
  const naoAtribuidas: Prestacao["naoAtribuidas"] = [];
  for (const d of despesas) {
    if (!d.rubrica_id) { naoAtribuidas.push({ id: d.id, descricao: d.descricao || "—", valor: Number(d.valor_total), data_gasto: d.data_gasto }); continue; }
    const rub = rubricas.find((r) => r.id === d.rubrica_id);
    const nat = naturezaDaRubrica(rub?.nome ?? "");
    const mes = d.data_gasto.slice(0, 7);
    mesesSet.add(mes);
    const k = `${d.rubrica_id}|${mes}`;
    despPorRubricaMes.set(k, [...(despPorRubricaMes.get(k) ?? []), despesaCel(d, nat)]);
  }

  const meses = [...mesesSet].sort();

  const montaRubrica = (r: { id: string; nome: string; fonte: string | null }): RubricaLinha => {
    const nat = naturezaDaRubrica(r.nome);
    const fonte = r.fonte ?? "subvencao";
    const prev = previsto.get(r.id) ?? {};
    const porMes: Record<string, Celula> = {};
    let totalPrevisto = 0; let totalRealizado = 0;
    for (const m of meses) {
      const desp = despPorRubricaMes.get(`${r.id}|${m}`) ?? [];
      const p = r2(prev[m] ?? 0);
      const real = r2(desp.reduce((s, d) => s + d.valor, 0));
      if (p === 0 && desp.length === 0) continue;
      totalPrevisto = r2(totalPrevisto + p); totalRealizado = r2(totalRealizado + real);
      let status: StatusCel;
      if (desp.length === 0) status = p > 0 && m < hoje ? "atrasado" : "vazio";
      else status = desp.every((d) => d.completa) ? "ok" : "parcial";
      porMes[m] = { mes: m, previsto: p, realizado: real, despesas: desp, status };
    }
    return { id: r.id, nome: r.nome, natureza: nat, fonte, contrapartida: fonte === "contrapartida", atividade: atividadePorRubrica.get(r.id) ?? null, porMes, totalPrevisto, totalRealizado };
  };

  const todas = rubricas.map(montaRubrica).filter((r) => Object.keys(r.porMes).length > 0 || r.totalPrevisto > 0);
  todas.sort((a, b) => a.nome.localeCompare(b.nome));

  return {
    meses,
    // Fomento = subvenção econômica (fora bolsa). Contrapartida é da TFO: não entra no teto do fomento.
    rubricas: todas.filter((r) => r.natureza !== "bolsa" && !r.contrapartida),
    contrapartida: todas.filter((r) => r.natureza !== "bolsa" && r.contrapartida),
    bolsa: todas.filter((r) => r.natureza === "bolsa"),
    naoAtribuidas: naoAtribuidas.sort((a, b) => a.data_gasto.localeCompare(b.data_gasto)),
  };
}
