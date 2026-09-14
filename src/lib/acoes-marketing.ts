/**
 * Ações de marketing do plano (tabela `acoes_marketing`).
 *
 * - FEIRA: mês/ano de realização, custo de participação (estande + logística + material) e retorno
 *   (clientes por produto e plano que se espera fechar na feira). O custo é PROVISIONADO como o dos
 *   eventos: 12 parcelas fixas ao longo do ano da feira; as vendas são do mês da feira, no canal direto.
 * - EVENTO: ano, quantidade de eventos, custo médio por evento e retorno por evento. O custo do ano
 *   (quantidade × custo médio) é provisionado em 12 parcelas fixas mensais; os clientes do ano
 *   (quantidade × retorno por evento) ficam distribuídos nos 12 meses.
 * - CAMPANHA de mídia (Google, LinkedIn, Instagram…): verba mensal de um mês a outro (sem fim = até
 *   o fim do cenário), custo por lead (CPL) e conversão lead → cliente. Clientes/mês = verba ÷ CPL ×
 *   conversão, pro produto e plano escolhidos.
 *
 * O custo entra na linha de Marketing (S&M) do cenário — e, portanto, no CAC. Os clientes das ações
 * EXPLICAM a meta do canal direto (não somam a ela): o painel de cobertura mostra quanto da meta as
 * ações cobrem. Só a ação marcada "soma_na_meta" acrescenta clientes à projeção.
 */

export type RetornoAcao = {
  produto_id: string;
  /** "plano" = plano de preço do produto; "modulo" = nível (produtos por níveis, ex: Fashion Mind). */
  plano_tipo: "plano" | "modulo" | null;
  plano_nome: string | null;
  /** Clientes por feira (feira) ou por evento (evento). Na campanha é só o peso de cada linha. */
  clientes: number;
};

export type TipoAcao = "feira" | "evento" | "campanha";

export type ParametrosAcao = {
  /** Feira: composição do custo (opcional) — a soma é o custo. */
  estande?: number | null;
  logistica?: number | null;
  material?: number | null;
  /** Campanha: canal de mídia, custo por lead e conversão lead → cliente (fração, 0,035 = 3,5%). */
  canal?: string | null;
  cpl?: number | null;
  conversao?: number | null;
};

export type AcaoMarketing = {
  id: string;
  tipo: TipoAcao;
  nome: string;
  /** Feira: mês de realização. Campanha: primeiro mês. (AAAA-MM-01) */
  mes: string | null;
  /** Campanha: último mês (null = até o fim do cenário). */
  mes_fim?: string | null;
  /** Evento: ano. */
  ano: number | null;
  /** Evento: quantidade de eventos no ano. */
  quantidade: number | null;
  /** Feira: custo total. Evento: custo médio por evento. Campanha: verba mensal. */
  custo: number;
  retorno: RetornoAcao[];
  parametros?: ParametrosAcao | null;
  /** true = os clientes somam à projeção (além do crescimento). Padrão: explicam a meta. */
  soma_na_meta?: boolean | null;
  observacoes?: string | null;
};

/** Sem data fim nem período do cenário, a campanha vai até o fim do horizonte do plano. */
export const FIM_PADRAO_CAMPANHA = "2030-12-01";

export const LABEL_TIPO_ACAO: Record<TipoAcao, string> = {
  feira: "Feira",
  evento: "Eventos",
  campanha: "Campanha",
};

function somarMeses(mesIso: string, n: number): string {
  const [y, m] = mesIso.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function mesMaisAnos(mesIso: string, anos: number): string {
  return somarMeses(mesIso, anos * 12);
}

function mesesDoAno(ano: number): string[] {
  return Array.from(
    { length: 12 },
    (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}-01`,
  );
}

/** Feira provisionada em 12 parcelas mensais no ano dela — igual aos eventos. */
export const PARCELAS_FEIRA = 12;

/** Meses em que a campanha roda. */
export function mesesDaCampanha(
  a: AcaoMarketing,
  fimCenario?: string | null,
): string[] {
  if (a.tipo !== "campanha" || !a.mes) return [];
  const fim = `${(a.mes_fim ?? fimCenario ?? FIM_PADRAO_CAMPANHA).slice(0, 7)}-01`;
  const meses: string[] = [];
  for (
    let m = `${a.mes.slice(0, 7)}-01`;
    m <= fim && meses.length < 600;
    m = somarMeses(m, 1)
  )
    meses.push(m);
  return meses;
}

export function leadsMensaisCampanha(a: AcaoMarketing): number {
  const cpl = Number(a.parametros?.cpl ?? 0);
  return cpl > 0 ? Number(a.custo) / cpl : 0;
}

export function clientesMensaisCampanha(a: AcaoMarketing): number {
  return leadsMensaisCampanha(a) * Number(a.parametros?.conversao ?? 0);
}

export function custoTotalAcao(
  a: AcaoMarketing,
  fimCenario?: string | null,
): number {
  if (a.tipo === "feira") return Number(a.custo);
  if (a.tipo === "campanha")
    return Number(a.custo) * mesesDaCampanha(a, fimCenario).length;
  return Number(a.custo) * Number(a.quantidade ?? 0);
}

/** Custo da ação por mês (AAAA-MM-01). */
export function custoAcaoPorMes(
  a: AcaoMarketing,
  fimCenario?: string | null,
): Map<string, number> {
  const porMes = new Map<string, number>();
  if (a.tipo === "feira") {
    if (!a.mes) return porMes;
    // Provisão mensal no ano da feira (jan a dez), como os eventos — o caixa não leva um solavanco
    // no mês do estande e o custo aparece distribuído na DRE.
    const parcela = Number(a.custo) / PARCELAS_FEIRA;
    for (const m of mesesDoAno(Number(a.mes.slice(0, 4))))
      porMes.set(m, parcela);
  } else if (a.tipo === "campanha") {
    for (const m of mesesDaCampanha(a, fimCenario))
      porMes.set(m, Number(a.custo));
  } else if (a.ano) {
    const mensal = custoTotalAcao(a) / 12;
    for (const m of mesesDoAno(a.ano)) porMes.set(m, mensal);
  }
  return porMes;
}

/** Vendas da ação para um produto, já distribuídas por mês. */
export function vendasAcaoPorMes(
  a: AcaoMarketing,
  produtoId: string,
  fimCenario?: string | null,
): { mes: string; clientes: number; retorno: RetornoAcao }[] {
  if (a.tipo === "campanha") {
    const linhas = (a.retorno ?? []).filter((r) => r.produto_id);
    const pesoTotal = linhas.reduce(
      (s, r) => s + (Number(r.clientes) > 0 ? Number(r.clientes) : 1),
      0,
    );
    const porMes = clientesMensaisCampanha(a);
    if (pesoTotal <= 0 || porMes <= 0) return [];
    return linhas
      .filter((r) => r.produto_id === produtoId)
      .flatMap((r) => {
        const parte =
          (Number(r.clientes) > 0 ? Number(r.clientes) : 1) / pesoTotal;
        return mesesDaCampanha(a, fimCenario).map((mes) => ({
          mes,
          clientes: porMes * parte,
          retorno: r,
        }));
      });
  }
  const linhas = (a.retorno ?? []).filter(
    (r) => r.produto_id === produtoId && Number(r.clientes) > 0,
  );
  if (a.tipo === "feira") {
    return a.mes
      ? linhas.map((r) => ({
          mes: `${a.mes!.slice(0, 7)}-01`,
          clientes: Number(r.clientes),
          retorno: r,
        }))
      : [];
  }
  if (!a.ano) return [];
  const qtd = Number(a.quantidade ?? 0);
  return linhas.flatMap((r) =>
    mesesDoAno(a.ano!).map((mes) => ({
      mes,
      clientes: (qtd * Number(r.clientes)) / 12,
      retorno: r,
    })),
  );
}

/** Clientes esperados no total da ação (todas as feiras/eventos/meses de campanha, todos os produtos). */
export function clientesTotaisAcao(
  a: AcaoMarketing,
  fimCenario?: string | null,
): number {
  if (a.tipo === "campanha")
    return clientesMensaisCampanha(a) * mesesDaCampanha(a, fimCenario).length;
  const porUnidade = (a.retorno ?? []).reduce(
    (s, r) => s + Number(r.clientes || 0),
    0,
  );
  return a.tipo === "feira"
    ? porUnidade
    : porUnidade * Number(a.quantidade ?? 0);
}

/** Clientes previstos por todas as ações, por produto e mês — base do painel de cobertura. */
export function clientesAcoesPorProdutoMes(
  acoes: AcaoMarketing[],
  fimCenario?: string | null,
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const a of acoes) {
    const produtos = new Set(
      (a.retorno ?? []).map((r) => r.produto_id).filter(Boolean),
    );
    for (const pid of produtos) {
      const doProduto = out.get(pid) ?? new Map<string, number>();
      for (const v of vendasAcaoPorMes(a, pid, fimCenario))
        doProduto.set(v.mes, (doProduto.get(v.mes) ?? 0) + v.clientes);
      out.set(pid, doProduto);
    }
  }
  return out;
}

/** Ações sem retorno cadastrado só geram custo — o painel avisa. */
export function acaoSemRetorno(a: AcaoMarketing): boolean {
  return clientesTotaisAcao(a) <= 0;
}
