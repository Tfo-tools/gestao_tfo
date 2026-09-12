/**
 * Camada única de leitura de fases e de quais produtos cada cenário simula.
 *
 * Duas regras do negócio vivem aqui, e só aqui:
 *
 * 1. **As DATAS de fase são do produto** (`produto_fases`, uma linha por produto+fase). Editar muda
 *    em todos os cenários vinculados por construção — existe um único lugar com a data. As TAXAS
 *    (crescimento, churn, conversão) seguem por cenário em `fases_produto`, que também é a âncora
 *    de `premissas_funil` e `fases_trimestres`, e por isso não pode ser deduplicada.
 *
 * 2. **Quem entra em cada cenário**: o Base é o plano da empresa e absorve automaticamente todo
 *    produto `aprovado` ou `iniciado`; os demais cenários existem para captar investimento ou
 *    desenhar produto novo, então a escolha é explícita (`produto_cenario`) e pode incluir produto
 *    ainda `planejado` ou deixar de fora um já aprovado.
 *
 * Produto fora do cenário é ignorado sem erro no recálculo — antes, um produto global sem fase no
 * cenário fazia o recálculo inteiro reportar falha.
 */

export type StatusProduto = "planejado" | "aprovado" | "iniciado" | "descartado";

export const LABEL_STATUS: Record<StatusProduto, string> = {
  planejado: "Planejado",
  aprovado: "Aprovado",
  iniciado: "Iniciado",
  descartado: "Descartado",
};

export const AJUDA_STATUS: Record<StatusProduto, string> = {
  planejado: "Cadastrado para avaliação. Não entra no plano da empresa; só num cenário em que você o inclua de propósito.",
  aprovado: "Segue o fluxo de desenvolvimento desenhado. Entra automaticamente no Base; as datas de fase ainda podem ser ajustadas.",
  iniciado: "Lançado, gerando receita. Entra automaticamente no Base e as datas de fase ficam congeladas.",
  descartado: "Avaliado e recusado. Fica no cadastro como histórico, fora de qualquer cenário.",
};

/** Status que o Base absorve sozinho, porque Base é o plano da empresa. */
export const STATUS_NO_PLANO: StatusProduto[] = ["aprovado", "iniciado"];

/** Datas travadas depois do lançamento: o que já começou não tem data de início em aberto. */
export function datasTravadas(status: StatusProduto): boolean {
  return status === "iniciado";
}

export type FaseDatas = { fase: string; data_inicio: string | null; data_fim: string | null };

export type ProdutoDoCenario = {
  id: string;
  nome: string;
  status: StatusProduto;
  /** Por que este produto está neste cenário — usado na tela pra explicar entradas automáticas. */
  origem: "status" | "selecao";
  fases: FaseDatas[];
};

/**
 * Os produtos que o cenário simula, já com as datas de fase do produto.
 * No Base, vêm do status; nos outros, da seleção explícita.
 */
export async function produtosDoCenario(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cenarioId: string,
): Promise<ProdutoDoCenario[]> {
  if (!cenarioId) return [];

  const [{ data: cenario }, { data: produtos }, { data: vinculos }, { data: fases }] = await Promise.all([
    supabase.from("cenarios").select("id, is_base").eq("id", cenarioId).single(),
    supabase.from("produtos").select("id, nome, status").order("nome"),
    supabase.from("produto_cenario").select("produto_id").eq("cenario_id", cenarioId),
    supabase.from("produto_fases").select("produto_id, fase, data_inicio, data_fim"),
  ]);

  const ehBase = cenario?.is_base === true;
  const selecionados = new Set((vinculos ?? []).map((v: { produto_id: string }) => v.produto_id));
  const fasesPorProduto = new Map<string, FaseDatas[]>();
  for (const f of (fases ?? []) as (FaseDatas & { produto_id: string })[]) {
    const lista = fasesPorProduto.get(f.produto_id) ?? [];
    lista.push({ fase: f.fase, data_inicio: f.data_inicio, data_fim: f.data_fim });
    fasesPorProduto.set(f.produto_id, lista);
  }

  const saida: ProdutoDoCenario[] = [];
  for (const p of ((produtos ?? []) as { id: string; nome: string; status: StatusProduto }[])) {
    const porStatus = ehBase && STATUS_NO_PLANO.includes(p.status);
    const porSelecao = !ehBase && selecionados.has(p.id);
    if (!porStatus && !porSelecao) continue;
    saida.push({
      id: p.id,
      nome: p.nome,
      status: p.status,
      origem: porStatus ? "status" : "selecao",
      fases: fasesPorProduto.get(p.id) ?? [],
    });
  }
  return saida;
}

/** Só os ids — para os pontos que apenas precisam saber o que recalcular. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function idsDoCenario(supabase: any, cenarioId: string): Promise<string[]> {
  return (await produtosDoCenario(supabase, cenarioId)).map((p) => p.id);
}

/** Um produto está neste cenário? Usado pelo recálculo pra ignorar sem erro o que está fora. */
export async function produtoEstaNoCenario(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  produtoId: string,
  cenarioId: string,
): Promise<boolean> {
  const ids = await idsDoCenario(supabase, cenarioId);
  return ids.includes(produtoId);
}

/** Datas de fase de um produto, na ordem do ciclo de vida. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fasesDoProduto(supabase: any, produtoId: string): Promise<FaseDatas[]> {
  const { data } = await supabase
    .from("produto_fases")
    .select("fase, data_inicio, data_fim")
    .eq("produto_id", produtoId);
  return (data ?? []) as FaseDatas[];
}
