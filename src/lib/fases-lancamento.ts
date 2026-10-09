/**
 * Fases de lançamento do produto (tela de Produto do catálogo: mind, skills, price).
 * Aba 1 (datas): as 6 fases, uma data de início por fase; o fim de uma é o início da próxima;
 * Maturidade só tem início. Aba 4 (crescimento e churn): só da PMF em diante — antes do PMF
 * (Ideação e Validação) não há clientes pagantes para projetar; a PMF começa no lançamento previsto.
 *
 * Isto é do modelo NOVO (catálogo), separado do fases-produto.ts do plano antigo.
 */
export const FASES_LANCAMENTO = [
  { key: "ideacao", label: "Ideação" },
  { key: "validacao", label: "Validação" },
  { key: "pmf", label: "PMF" },
  { key: "tracao", label: "Tração" },
  { key: "escala", label: "Escala" },
  { key: "maturidade", label: "Maturidade" },
] as const;

export type FaseLancKey = (typeof FASES_LANCAMENTO)[number]["key"];

/** Fases que entram no crescimento/churn (aba 4): PMF em diante. */
export const FASES_CRESCIMENTO: ReadonlyArray<{ key: FaseLancKey; label: string }> = FASES_LANCAMENTO.filter((f) =>
  (["pmf", "tracao", "escala", "maturidade"] as string[]).includes(f.key),
) as ReadonlyArray<{ key: FaseLancKey; label: string }>;

export type FasesDatas = Partial<Record<FaseLancKey, string | null>>;
export type TesteProduto = {
  beta_testers?: number | null;
  inicio?: string | null;
  fim?: string | null;
  modelo?: "pago" | "gratuito";
  valor?: number | null;
};
export type CrescimentoFase = { novos_mes?: number | null; churn_pct?: number | null };
export type CrescimentoFases = Partial<Record<FaseLancKey, CrescimentoFase>>;
