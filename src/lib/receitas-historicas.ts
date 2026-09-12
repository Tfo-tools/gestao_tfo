/**
 * Receita já realizada ANTES de o produto existir — o caso da consultoria a R$ 4.500/mês, que
 * validou a metodologia antes de haver software.
 *
 * Fica de propósito FORA da simulação: não entra em MRR, ARR, preço médio, CAC, churn nem no EBITDA
 * projetado. Misturar receita de serviço já realizada com a projeção de assinatura distorceria todos
 * esses indicadores — e é justamente o contrário do que se quer mostrar. Aqui ela é contexto: tração
 * antes do produto, que a banca lê como prova de que a metodologia já era vendida.
 *
 * Cada registro tem um interruptor (`mostrar`): desligado, desaparece da tela e da planilha sem ser
 * apagado — dá pra ligar, olhar o resultado e decidir se apresenta.
 */

export type ReceitaHistorica = {
  id: string;
  descricao: string;
  valor_mensal: number;
  data_inicio: string;
  data_fim: string | null;
  mostrar: boolean;
  observacoes: string | null;
};

/** Quantos meses o registro cobre (limites inclusivos). Sem data fim, vai até `fimPadrao`. */
export function mesesDaReceita(r: Pick<ReceitaHistorica, "data_inicio" | "data_fim">, fimPadrao: string | null): number {
  const inicio = r.data_inicio.slice(0, 7);
  const fim = (r.data_fim ?? fimPadrao ?? r.data_inicio).slice(0, 7);
  if (fim < inicio) return 0;
  const [ai, mi] = inicio.split("-").map(Number);
  const [af, mf] = fim.split("-").map(Number);
  return (af - ai) * 12 + (mf - mi) + 1;
}

export type ResumoReceitaHistorica = {
  /** Só os registros com o interruptor ligado. */
  ativos: ReceitaHistorica[];
  /** Soma de tudo o que os registros ligados representam, do começo ao fim de cada um. */
  total: number;
  /** A parte que cai dentro do período do cenário — normalmente pequena, porque é receita passada. */
  totalNoPeriodo: number;
  /** Primeiro e último mês cobertos pelos registros ligados. */
  primeiroMes: string | null;
  ultimoMes: string | null;
};

/**
 * Resume os registros ligados. `inicioPeriodo`/`fimPeriodo` são o recorte do cenário, usados só pra
 * dizer quanto da receita histórica cai dentro dele — o total não depende do recorte, porque o valor
 * do argumento é o histórico inteiro.
 */
export function resumirReceitasHistoricas(
  registros: ReceitaHistorica[],
  periodo: { inicio: string | null; fim: string | null },
): ResumoReceitaHistorica {
  const ativos = registros.filter((r) => r.mostrar);
  let total = 0;
  let totalNoPeriodo = 0;
  let primeiroMes: string | null = null;
  let ultimoMes: string | null = null;

  for (const r of ativos) {
    const meses = mesesDaReceita(r, periodo.fim);
    total += Number(r.valor_mensal) * meses;

    const inicio = r.data_inicio.slice(0, 7);
    const fim = (r.data_fim ?? periodo.fim ?? r.data_inicio).slice(0, 7);
    if (primeiroMes == null || inicio < primeiroMes) primeiroMes = inicio;
    if (ultimoMes == null || fim > ultimoMes) ultimoMes = fim;

    // Interseção com o período do cenário, mês a mês.
    const de = periodo.inicio ? (inicio > periodo.inicio.slice(0, 7) ? inicio : periodo.inicio.slice(0, 7)) : inicio;
    const ate = periodo.fim ? (fim < periodo.fim.slice(0, 7) ? fim : periodo.fim.slice(0, 7)) : fim;
    if (de <= ate) {
      const [ai, mi] = de.split("-").map(Number);
      const [af, mf] = ate.split("-").map(Number);
      totalNoPeriodo += Number(r.valor_mensal) * ((af - ai) * 12 + (mf - mi) + 1);
    }
  }

  return { ativos, total, totalNoPeriodo, primeiroMes, ultimoMes };
}

/** Texto pronto pra planilha e para o material: o argumento em uma frase. */
export function frasePreProduto(resumo: ResumoReceitaHistorica): string | null {
  if (resumo.ativos.length === 0 || resumo.total <= 0) return null;
  const mes = (iso: string | null) =>
    iso ? new Date(iso + "-01T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "";
  return `${resumo.ativos.map((r) => r.descricao).join(", ")}: R$ ${Math.round(resumo.total).toLocaleString("pt-BR")} entre ${mes(
    resumo.primeiroMes,
  )} e ${mes(resumo.ultimoMes)} — receita realizada antes do produto, fora da projeção.`;
}
