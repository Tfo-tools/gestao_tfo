import { FASES, type FaseValue } from "@/lib/fases";

/**
 * Plano pela receita — o modelo de planejamento por fase de vida do produto.
 *
 * No modelo anterior ("trimestral") o cenário dizia quantos % da base entravam de cliente novo por
 * bloco de 3 meses. Aqui o cenário diz quanto a RECEITA cresce e qual o churn, por fase:
 * - cada fase tem um alvo (o valor no último mês dela); a curva começa onde a fase anterior terminou
 *   e cai até o alvo — mais rápido no começo, suavizando no fim (curva de aprendizado de vendas);
 * - na maturidade, crescimento e churn são anuais; o churn oscila ±5% ao longo do ano;
 * - a venda de cada mês segue a sazonalidade do produto (o total do ano não muda);
 * - clientes = receita ÷ preço (já com o desconto de combo), em número inteiro.
 *
 * Cenário "importado" (modelo trimestral) continua calculando como sempre até ser editado aqui.
 */

export type ModeloPlano = "trimestral" | "receita";

export type FasePlanoReceita = {
  fase: FaseValue;
  /** De onde a curva de crescimento parte. Nulo = alvo da fase anterior. */
  cresc_inicio: number | null;
  /** Crescimento mensal da receita no fim da fase. Na maturidade, ANUAL. */
  cresc_alvo: number | null;
  churn_inicio: number | null;
  /** Churn mensal no fim da fase. Na maturidade, ANUAL. */
  churn_alvo: number | null;
};

export const FASES_PLANO = FASES.filter((f) => f.value !== "ideacao");

/** Quão rápido a curva cai: 3 = cai ~2/3 do caminho no primeiro terço da fase. */
export const CURVA_K = 3;
/** Oscilação do churn na maturidade ao longo do ano (pico em janeiro, vale em julho). */
export const OSCILACAO_MATURIDADE = 0.05;

/** 1 no início da fase, 0 no último mês: quanto do caminho até o alvo ainda falta. */
export function decaimento(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return (Math.exp(-CURVA_K * q) - Math.exp(-CURVA_K)) / (1 - Math.exp(-CURVA_K));
}

export const churnAnualParaMensal = (a: number) => 1 - Math.pow(1 - Math.min(0.999, Math.max(0, a)), 1 / 12);
export const churnMensalParaAnual = (m: number) => 1 - Math.pow(1 - m, 12);
export const crescAnualParaMensal = (a: number) => Math.pow(1 + Math.max(-0.99, a), 1 / 12) - 1;
export const crescMensalParaAnual = (m: number) => Math.pow(1 + m, 12) - 1;

/** Índice de vendas do mês (0 = janeiro), normalizado pra média 1 — o total do ano não muda. */
export function indiceSazonal(saz: number[] | null | undefined, mes0: number): number {
  if (!saz || saz.length !== 12) return 1;
  const media = saz.reduce((s, v) => s + Number(v || 0), 0) / 12;
  if (media <= 0) return 1;
  return Number(saz[mes0] || 0) / media;
}

export type TaxasDoMes = { crescimento: number; churn: number };

/** Meses consecutivos de uma mesma fase, na ordem em que acontecem. */
function segmentos(mesesComFase: { mes: string; fase: FaseValue }[]) {
  const saida: { fase: FaseValue; meses: string[] }[] = [];
  for (const m of mesesComFase) {
    const ultimo = saida.at(-1);
    if (ultimo && ultimo.fase === m.fase) ultimo.meses.push(m.mes);
    else saida.push({ fase: m.fase, meses: [m.mes] });
  }
  return saida;
}

/**
 * Crescimento e churn de cada mês. `mesesComFase` precisa ir até o fim de cada fase (mesmo depois
 * do fim do cenário) — é o comprimento da fase que define a velocidade da curva.
 */
export function curvasDoPlano(
  mesesComFase: { mes: string; fase: FaseValue }[],
  plano: FasePlanoReceita[],
): Map<string, TaxasDoMes> {
  const porFase = new Map(plano.map((p) => [p.fase, p]));
  const saida = new Map<string, TaxasDoMes>();
  let crescAnterior: number | null = null;
  let churnAnterior: number | null = null;
  for (const seg of segmentos(mesesComFase)) {
    const p = porFase.get(seg.fase);
    if (seg.fase === "maturidade") {
      const crescMensal = p?.cresc_alvo != null ? crescAnualParaMensal(p.cresc_alvo) : (crescAnterior ?? 0);
      const churnMensal = p?.churn_alvo != null ? churnAnualParaMensal(p.churn_alvo) : (churnAnterior ?? 0);
      for (const mes of seg.meses) {
        const m0 = Number(mes.slice(5, 7)) - 1;
        saida.set(mes, {
          crescimento: crescMensal,
          churn: churnMensal * (1 + OSCILACAO_MATURIDADE * Math.cos((2 * Math.PI * m0) / 12)),
        });
      }
      continue;
    }
    const cAlvo: number = p?.cresc_alvo ?? crescAnterior ?? 0;
    const cIni: number = p?.cresc_inicio ?? crescAnterior ?? cAlvo;
    const chAlvo: number = p?.churn_alvo ?? churnAnterior ?? 0;
    const chIni: number = p?.churn_inicio ?? churnAnterior ?? chAlvo;
    const n = seg.meses.length;
    seg.meses.forEach((mes, k) => {
      const d = decaimento((k + 1) / n);
      saida.set(mes, {
        crescimento: cAlvo + (cIni - cAlvo) * d,
        churn: Math.max(0, chAlvo + (chIni - chAlvo) * d),
      });
    });
    if (seg.fase !== "ideacao" || p?.cresc_alvo != null) crescAnterior = cAlvo;
    if (seg.fase !== "ideacao" || p?.churn_alvo != null) churnAnterior = chAlvo;
  }
  return saida;
}

// ── Conversão do modelo trimestral ─────────────────────────────────────────────────────────────

/** Acha o alvo de uma fase para que, partindo de `inicio`, o crescimento acumulado nos `m` meses
 *  medidos seja o mesmo do plano atual (`c` ao mês, em média). */
function resolverAlvo(inicio: number, c: number, n: number, m: number): number {
  const alvoProduto = Math.pow(1 + c, m);
  const f = (e: number) => {
    let p = 1;
    for (let k = 1; k <= m; k++) p *= 1 + e + (inicio - e) * decaimento(k / n);
    return p - alvoProduto;
  };
  let lo = -0.3;
  let hi = 2;
  if (f(lo) > 0) return lo;
  if (f(hi) < 0) return hi;
  for (let i = 0; i < 60; i++) {
    const meio = (lo + hi) / 2;
    if (f(meio) < 0) lo = meio;
    else hi = meio;
  }
  return (lo + hi) / 2;
}

const arred = (v: number, casas = 4) => Math.round(v * 10 ** casas) / 10 ** casas;

/**
 * Traduz o plano atual (modelo trimestral) para o plano pela receita, sem mudar a história:
 * - churn: o que o plano aplicava no começo e no fim de cada fase (na maturidade, a média do
 *   primeiro ano, anualizada);
 * - crescimento: o crescimento real da receita recorrente (MRR) que o plano produzia em cada fase,
 *   com o alvo escolhido pra que a curva nova acumule o mesmo crescimento.
 */
export function converterDoModeloTrimestral(opts: {
  mesesComFase: { mes: string; fase: FaseValue }[];
  taxaLegada: (fase: FaseValue, mes: string) => TaxasDoMes;
  mrrPorMes: Map<string, number>;
}): FasePlanoReceita[] {
  const saida: FasePlanoReceita[] = [];
  let crescAnterior: number | null = null;
  let churnAnterior: number | null = null;
  const todosMeses = opts.mesesComFase.map((m) => m.mes);

  for (const seg of segmentos(opts.mesesComFase)) {
    if (seg.fase === "ideacao") continue;
    if (saida.some((s) => s.fase === seg.fase)) continue;

    // Churn
    const churns = seg.meses.map((mes) => opts.taxaLegada(seg.fase, mes).churn);
    let churn_inicio: number | null = null;
    let churn_alvo: number;
    if (seg.fase === "maturidade") {
      const ano = churns.slice(0, 12);
      const media = ano.reduce((s, v) => s + v, 0) / Math.max(1, ano.length);
      churn_alvo = churnMensalParaAnual(media);
    } else {
      const primeiro = churns.find((v) => v > 0) ?? 0;
      churn_alvo = churns.at(-1) ?? 0;
      if (churnAnterior == null || Math.abs(primeiro - churnAnterior) > 0.00005) churn_inicio = primeiro;
      churnAnterior = churn_alvo;
    }

    // Crescimento da receita: medido no próprio plano.
    const idx0 = todosMeses.indexOf(seg.meses[0]);
    const mesAntes = idx0 > 0 ? todosMeses[idx0 - 1] : null;
    let baseMes: string | null = mesAntes && (opts.mrrPorMes.get(mesAntes) ?? 0) > 0 ? mesAntes : null;
    if (!baseMes) baseMes = seg.meses.find((m) => (opts.mrrPorMes.get(m) ?? 0) > 0) ?? null;
    const comDado = seg.meses.filter((m) => opts.mrrPorMes.has(m));
    const fimMes = comDado.at(-1) ?? null;
    let c: number | null = null;
    let medidos = 0;
    if (baseMes && fimMes && fimMes > baseMes) {
      medidos = todosMeses.indexOf(fimMes) - todosMeses.indexOf(baseMes);
      const base = opts.mrrPorMes.get(baseMes)!;
      const fim = opts.mrrPorMes.get(fimMes) ?? 0;
      if (medidos > 0 && base > 0 && fim > 0) c = Math.pow(fim / base, 1 / medidos) - 1;
    }

    const cresc_inicio: number | null = null;
    let cresc_alvo: number;
    if (seg.fase === "maturidade") {
      cresc_alvo =
        c != null
          ? crescMensalParaAnual(c)
          : Math.min(0.3, crescMensalParaAnual(crescAnterior ?? 0) * 0.5);
    } else if (c == null) {
      cresc_alvo = (crescAnterior ?? 0) * 0.8;
    } else if (crescAnterior == null) {
      cresc_alvo = c;
    } else {
      // Os meses medidos são os do fim da fase quando a base só aparece no meio dela.
      const n = seg.meses.length;
      cresc_alvo = resolverAlvo(crescAnterior, c, n, Math.min(n, medidos));
    }
    if (seg.fase !== "maturidade") crescAnterior = cresc_alvo;

    saida.push({
      fase: seg.fase,
      cresc_inicio: cresc_inicio,
      cresc_alvo: arred(cresc_alvo),
      churn_inicio: churn_inicio != null ? arred(churn_inicio) : null,
      churn_alvo: arred(churn_alvo),
    });
  }
  return saida;
}

// ── Meta de receita do cenário ────────────────────────────────────────────────────────────────

/** Quanto cada fase pesa no crescimento: produto jovem cresce mais rápido que o maduro. */
export const FATOR_FASE: Record<FaseValue, number> = {
  ideacao: 0,
  validacao: 2,
  pmf: 1.6,
  tracao: 1.3,
  escala: 1,
  maturidade: 0.5,
};

/** Fator do ano: a média do fator das fases em que o produto passa cada mês do ano. */
export function fatorDoAno(fasesDosMeses: (FaseValue | null)[]): number {
  const validos = fasesDosMeses.filter((f): f is FaseValue => f != null);
  if (validos.length === 0) return 0;
  return validos.reduce((s, f) => s + FATOR_FASE[f], 0) / validos.length;
}

/**
 * Distribui a meta de crescimento do MRR total entre os produtos: cada um cresce proporcional ao
 * fator da fase em que está, e a soma ponderada pelo peso de cada um bate com a meta.
 */
export function sugerirMetas(
  meta: number,
  itens: { id: string; peso: number; fator: number }[],
): Record<string, number> {
  const somaPesos = itens.reduce((s, i) => s + Math.max(0, i.peso), 0);
  const ponderado = itens.reduce((s, i) => s + (Math.max(0, i.peso) / (somaPesos || 1)) * i.fator, 0);
  const saida: Record<string, number> = {};
  for (const i of itens) saida[i.id] = ponderado > 0 ? (meta * i.fator) / ponderado : meta;
  return saida;
}

/** Soma ponderada das metas por produto — tem que bater com a meta do cenário. */
export function somaPonderada(metas: Record<string, number>, pesos: Record<string, number>): number {
  const soma = Object.values(pesos).reduce((s, p) => s + Math.max(0, p), 0) || 1;
  return Object.entries(metas).reduce((s, [id, m]) => s + ((pesos[id] ?? 0) / soma) * m, 0);
}

// ── Calibração ─────────────────────────────────────────────────────────────────────────────────

/**
 * Acha o crescimento de cada fase fazendo o próprio motor rodar, fase a fase, em ordem:
 * - o alvo (fim da fase) faz a receita recorrente (MRR) do último mês da fase — dentro do
 *   cenário — bater com a do plano atual;
 * - quando há um dezembro no meio da fase, o começo da curva faz bater também esse ponto, pra
 *   curva ter o mesmo formato de hoje e não só o mesmo ponto final.
 * Assim a conversão guarda o resultado de hoje mesmo com lançamento de nível, parceiro e beta no
 * meio do caminho. O churn vem pronto em `base` (da conversão); aqui só o crescimento é ajustado.
 */
export function calibrarCrescimento(opts: {
  simular: (fases: FasePlanoReceita[]) => { mes_referencia: string; mrr: number }[];
  mesesComFase: { mes: string; fase: FaseValue }[];
  mrrAlvo: Map<string, number>;
  base: FasePlanoReceita[];
  /** Último mês do cenário (AAAA-MM-01). */
  fim: string;
}): FasePlanoReceita[] {
  const plano = opts.base.map((f) => ({ ...f, cresc_inicio: null, cresc_alvo: null }) as FasePlanoReceita);
  const primeiraReceita = [...opts.mrrAlvo.entries()]
    .filter(([, v]) => v > 0)
    .map(([m]) => m)
    .sort()[0];
  const bissecao = (f: (x: number) => number, meta: number, lo: number, hi: number, passos: number) => {
    if (f(lo) >= meta) return lo;
    if (f(hi) <= meta) return hi;
    for (let i = 0; i < passos; i++) {
      const meio = (lo + hi) / 2;
      if (f(meio) < meta) lo = meio;
      else hi = meio;
    }
    return (lo + hi) / 2;
  };
  let anterior: number | null = null;
  for (const seg of segmentos(opts.mesesComFase)) {
    if (seg.fase === "ideacao") continue;
    const idx = plano.findIndex((p) => p.fase === seg.fase);
    if (idx < 0 || plano[idx].cresc_alvo != null) continue;
    const mat = seg.fase === "maturidade";
    const noCenario = seg.meses.filter((m) => m <= opts.fim && (opts.mrrAlvo.get(m) ?? 0) > 0);
    const mesAlvo = noCenario.at(-1);
    const medivel =
      !!mesAlvo && !!primeiraReceita && mesAlvo > primeiraReceita && noCenario.length >= (mat ? 3 : 1);
    if (!medivel) {
      plano[idx].cresc_alvo = mat ? arred(Math.min(0.3, crescMensalParaAnual(anterior ?? 0) * 0.5)) : anterior;
      continue;
    }
    const meta = opts.mrrAlvo.get(mesAlvo!)!;
    const mrrEm = (mes: string, ini: number | null, e: number) => {
      const tentativa = plano.map((p, i) => (i === idx ? { ...p, cresc_inicio: ini, cresc_alvo: e } : p));
      return opts.simular(tentativa).find((r) => r.mes_referencia === mes)?.mrr ?? 0;
    };
    const [lo, hi] = mat ? [-0.5, 5] : [-0.3, 1.5];
    // Ponto do meio: o último dezembro antes do fim da fase (é o número que o relatório anual
    // mostra), com pelo menos 3 meses de cada lado — perto da borda, o começo da curva viraria um
    // número sem sentido (30%+ ao mês) só pra acertar um mês.
    const iAlvo = noCenario.length - 1;
    const iMeio = noCenario.findLastIndex((m, i) => m.endsWith("-12-01") && i >= 3 && iAlvo - i >= 3);
    let ini: number | null = null;
    let e: number;
    if (!mat && iMeio >= 0) {
      const mesMeio = noCenario[iMeio];
      const metaMeio = opts.mrrAlvo.get(mesMeio)!;
      const alvoPara = (x: number) => bissecao((y) => mrrEm(mesAlvo!, x, y), meta, lo, hi, 22);
      ini = bissecao((x) => mrrEm(mesMeio, x, alvoPara(x)), metaMeio, lo, hi, 20);
      e = alvoPara(ini);
    } else {
      e = bissecao((y) => mrrEm(mesAlvo!, null, y), meta, lo, hi, 28);
    }
    plano[idx].cresc_inicio = ini != null ? arred(ini) : null;
    plano[idx].cresc_alvo = arred(e);
    if (!mat) anterior = plano[idx].cresc_alvo;
  }
  return plano;
}
