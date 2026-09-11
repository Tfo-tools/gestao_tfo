/**
 * Feiras e eventos do plano de marketing (tabela `acoes_marketing`).
 *
 * - FEIRA: mês/ano de realização, custo estimado de participação e retorno (clientes por produto e
 *   plano que se espera fechar na feira). O custo é pago em 3 parcelas iguais até o mês da feira
 *   (M−2, M−1 e M); as vendas entram no mês da feira, no canal direto.
 * - EVENTO: ano, quantidade de eventos, custo médio por evento e retorno por evento. O custo do ano
 *   (quantidade × custo médio) é provisionado em 12 parcelas fixas mensais; os clientes do ano
 *   (quantidade × retorno por evento) também entram distribuídos nos 12 meses, no canal direto.
 *
 * O custo entra na linha de Marketing (S&M) do cenário — e, portanto, no CAC.
 */

export type RetornoAcao = {
  produto_id: string;
  /** "plano" = plano de preço do produto; "modulo" = nível (produtos por níveis, ex: Fashion Mind). */
  plano_tipo: "plano" | "modulo" | null;
  plano_nome: string | null;
  /** Clientes por feira (feira) ou por evento (evento). */
  clientes: number;
};

export type AcaoMarketing = {
  id: string;
  tipo: "feira" | "evento";
  nome: string;
  /** Feira: mês de realização (AAAA-MM-01). */
  mes: string | null;
  /** Evento: ano. */
  ano: number | null;
  /** Evento: quantidade de eventos no ano. */
  quantidade: number | null;
  /** Feira: custo total de participação. Evento: custo médio por evento. */
  custo: number;
  retorno: RetornoAcao[];
  observacoes?: string | null;
};

function somarMeses(mesIso: string, n: number): string {
  const [y, m] = mesIso.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function mesesDoAno(ano: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}-01`);
}

export const PARCELAS_FEIRA = 3;

export function custoTotalAcao(a: AcaoMarketing): number {
  return a.tipo === "feira" ? Number(a.custo) : Number(a.custo) * Number(a.quantidade ?? 0);
}

/** Custo da ação por mês (AAAA-MM-01). */
export function custoAcaoPorMes(a: AcaoMarketing): Map<string, number> {
  const porMes = new Map<string, number>();
  if (a.tipo === "feira") {
    if (!a.mes) return porMes;
    const parcela = Number(a.custo) / PARCELAS_FEIRA;
    for (let k = PARCELAS_FEIRA - 1; k >= 0; k--) porMes.set(somarMeses(a.mes, -k), parcela);
  } else if (a.ano) {
    const mensal = custoTotalAcao(a) / 12;
    for (const m of mesesDoAno(a.ano)) porMes.set(m, mensal);
  }
  return porMes;
}

/** Vendas da ação para um produto, já distribuídas por mês. */
export function vendasAcaoPorMes(a: AcaoMarketing, produtoId: string): { mes: string; clientes: number; retorno: RetornoAcao }[] {
  const linhas = (a.retorno ?? []).filter((r) => r.produto_id === produtoId && Number(r.clientes) > 0);
  if (a.tipo === "feira") {
    return a.mes ? linhas.map((r) => ({ mes: `${a.mes!.slice(0, 7)}-01`, clientes: Number(r.clientes), retorno: r })) : [];
  }
  if (!a.ano) return [];
  const qtd = Number(a.quantidade ?? 0);
  return linhas.flatMap((r) => mesesDoAno(a.ano!).map((mes) => ({ mes, clientes: (qtd * Number(r.clientes)) / 12, retorno: r })));
}

/** Clientes esperados no total da ação (todas as feiras/eventos, todos os produtos). */
export function clientesTotaisAcao(a: AcaoMarketing): number {
  const porUnidade = (a.retorno ?? []).reduce((s, r) => s + Number(r.clientes || 0), 0);
  return a.tipo === "feira" ? porUnidade : porUnidade * Number(a.quantidade ?? 0);
}
