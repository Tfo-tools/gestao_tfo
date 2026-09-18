import type { Metricas } from "@/lib/relatorios-cenario";

/**
 * Comparação de cenários — a parte pura, sem banco, pra ser testável.
 *
 * O ponto de partida é o PERÍODO COMUM: os cenários começam e terminam em datas diferentes (o Base
 * começa em set/2026, os FUNSES em jan/2027, o Pessimista vai até 2032). Comparar a receita de um
 * cenário com 4 anos contra a de um com 6 não diz nada; por padrão a janela é a interseção, e o
 * filtro deixa mudar.
 */

export type CenarioBasico = { id: string; nome: string; is_base: boolean; data_inicio: string; data_fim: string };

export type PontoMensal = { mes: string; receita: number; ebitda: number; aportes: number };

export type DadosCenario = {
  id: string;
  nome: string;
  is_base: boolean;
  metricas: Metricas;
  meses: PontoMensal[];
};

/** Janela em que todos os cenários escolhidos têm projeção: o início mais tardio e o fim mais cedo. */
export function periodoComum(cenarios: Pick<CenarioBasico, "data_inicio" | "data_fim">[]): { inicio: string; fim: string } | null {
  if (cenarios.length === 0) return null;
  const inicio = cenarios.map((c) => c.data_inicio.slice(0, 7)).sort().at(-1)!;
  const fim = cenarios.map((c) => c.data_fim.slice(0, 7)).sort()[0];
  if (inicio > fim) return null;
  return { inicio, fim };
}

/** Caixa acumulado mês a mês: o que a operação gera (EBITDA) mais o que entra de capital. */
export function caixaAcumulado(meses: PontoMensal[]): { mes: string; valor: number }[] {
  let acc = 0;
  return meses.map((m) => {
    acc += m.ebitda + m.aportes;
    return { mes: m.mes, valor: acc };
  });
}

/**
 * A maior queima: o ponto mais baixo do EBITDA acumulado. É quanto a operação consome antes de
 * se pagar — a necessidade de capital que o cenário implica. Zero quando nunca fica negativo.
 */
export function maiorQueima(meses: PontoMensal[]): number {
  let acc = 0;
  let minimo = 0;
  for (const m of meses) {
    acc += m.ebitda;
    if (acc < minimo) minimo = acc;
  }
  return minimo;
}

export type Formato = "brl" | "pct" | "num" | "mes" | "meses" | "x" | "pctmes";

export type Indicador = {
  chave: string;
  rotulo: string;
  /** Valor numérico usado pra comparar; `texto` sobrescreve a exibição quando precisa (ex.: mês). */
  valor: (d: DadosCenario) => number | null;
  texto?: (d: DadosCenario) => string | null;
  formato: Formato;
  /** Qual lado é melhor. null = não faz sentido eleger (ex.: quanto de aporte entrou). */
  melhor: "maior" | "menor" | null;
  ajuda?: string;
};

const mesesEntre = (de: string, ate: string) =>
  (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + (Number(ate.slice(5, 7)) - Number(de.slice(5, 7)));

export const INDICADORES_COMPARACAO: Indicador[] = [
  { chave: "receita", rotulo: "Receita no período", valor: (d) => d.metricas.receitaAcumulada, formato: "brl", melhor: "maior" },
  { chave: "ebitda", rotulo: "EBITDA no período", valor: (d) => d.metricas.ebitdaAcumulado, formato: "brl", melhor: "maior" },
  { chave: "margem", rotulo: "Margem EBITDA", valor: (d) => d.metricas.margemOperacional, formato: "pct", melhor: "maior" },
  { chave: "clientes", rotulo: "Clientes ao fim", valor: (d) => d.metricas.clientesFinal, formato: "num", melhor: "maior" },
  {
    chave: "break_even",
    rotulo: "Break-even",
    // Compara pelos meses desde o início da janela: mais cedo é melhor. Sem break-even, fica fora.
    valor: (d) => (d.metricas.breakEvenMes && d.meses[0] ? mesesEntre(d.meses[0].mes, d.metricas.breakEvenMes) : null),
    texto: (d) =>
      d.metricas.breakEvenMes
        ? `${rotuloMes(d.metricas.breakEvenMes)}${d.metricas.breakEvenClientes != null ? ` · ${d.metricas.breakEvenClientes.toLocaleString("pt-BR")} clientes` : ""}`
        : "não atingido",
    formato: "mes",
    melhor: "menor",
  },
  {
    chave: "queima",
    rotulo: "Maior queima acumulada",
    valor: (d) => maiorQueima(d.meses),
    formato: "brl",
    // É negativa: a menos funda (mais perto de zero) é a melhor.
    melhor: "maior",
    ajuda: "O ponto mais baixo do EBITDA acumulado — quanto a operação consome antes de se pagar.",
  },
  { chave: "cac", rotulo: "CAC (all-in)", valor: (d) => d.metricas.cacMedio, formato: "brl", melhor: "menor" },
  { chave: "ltv", rotulo: "LTV", valor: (d) => d.metricas.ltvMedio, formato: "brl", melhor: "maior" },
  {
    chave: "ltv_cac",
    rotulo: "LTV : CAC",
    valor: (d) => (d.metricas.ltvMedio != null && d.metricas.cacMedio ? d.metricas.ltvMedio / d.metricas.cacMedio : null),
    formato: "x",
    melhor: "maior",
  },
  { chave: "churn", rotulo: "Churn médio", valor: (d) => d.metricas.churnMedio, formato: "pctmes", melhor: "menor" },
  { chave: "payback", rotulo: "Payback do capital", valor: (d) => d.metricas.paybackMeses, formato: "meses", melhor: "menor" },
  { chave: "tir", rotulo: "TIR do projeto", valor: (d) => d.metricas.tirAnualPct ?? null, formato: "pct", melhor: "maior" },
  {
    chave: "aportes",
    rotulo: "Aportes no período",
    valor: (d) => d.meses.reduce((s, m) => s + m.aportes, 0),
    formato: "brl",
    melhor: null,
    ajuda: "Todos os programas vinculados ao cenário, nas datas previstas das parcelas.",
  },
];

/** Índice do melhor valor da linha, ou null quando não há o que eleger (empate ou só um valor). */
export function indiceDoMelhor(valores: (number | null)[], direcao: "maior" | "menor" | null): number | null {
  if (!direcao) return null;
  const validos = valores.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null && Number.isFinite(x.v));
  if (validos.length < 2) return null;
  const ordenados = [...validos].sort((a, b) => (direcao === "maior" ? b.v - a.v : a.v - b.v));
  if (Math.abs(ordenados[0].v - ordenados[1].v) < 1e-9) return null;
  return ordenados[0].i;
}

/** Diferença contra o Base, em %, pra ler cada cenário em relação ao plano da empresa. */
export function variacaoContraBase(valor: number | null, base: number | null): number | null {
  if (valor == null || base == null || base === 0) return null;
  return ((valor - base) / Math.abs(base)) * 100;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function rotuloMes(iso: string): string {
  return `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
}

export function formatar(valor: number | null, formato: Formato): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  switch (formato) {
    case "brl":
      return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    case "pct":
      return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    case "pctmes":
      return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%/mês`;
    case "x":
      return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`;
    case "meses":
      return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} meses`;
    case "mes":
      return `${valor} meses`;
    default:
      return valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  }
}

/** Cores dos cenários: slot fixo pela ordem de criação — a cor segue o cenário, não a posição. */
export const CORES_CENARIO = ["#3f6fc4", "#b8456f", "#e0a100", "#1f9a8a"];
/** Codificação secundária: o traço distingue os pares que a cor sozinha não separa em daltonismo. */
export const TRACOS_CENARIO = ["", "6 3", "2 3", "10 3 2 3"];
