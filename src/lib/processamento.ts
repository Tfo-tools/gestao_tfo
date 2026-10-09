/**
 * Custo de processamento por funcionalidade. Na arquitetura da TFO o custo está nos jobs de
 * back-end que enriquecem o banco (não no login): recebe dado diário e reprocessa por período.
 * Custo/mês = execuções no mês × fração do volume reprocessada × GB do cliente × R$/GB processado.
 */
export type PeriodoProc =
  | "diario" | "semanal" | "mensal" | "bimestral" | "trimestral" | "quadrimestral"
  | "dias_semana" | "dias_mes";

export const PERIODOS: { value: PeriodoProc; label: string; pedeDias?: "semana" | "mes" }[] = [
  { value: "diario", label: "Diário" },
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "bimestral", label: "Bimestral" },
  { value: "trimestral", label: "Trimestral" },
  { value: "quadrimestral", label: "Quadrimestral" },
  { value: "dias_semana", label: "Dias por semana", pedeDias: "semana" },
  { value: "dias_mes", label: "Dias por mês", pedeDias: "mes" },
];

const SEMANAS_MES = 52 / 12; // ≈ 4,333

/** Execuções por mês de um período. Retorna null quando não há período definido (usa o fallback). */
export function execucoesMes(periodo?: string | null, dias?: number | null): number | null {
  if (!periodo) return null;
  const d = Number(dias) || 0;
  switch (periodo as PeriodoProc) {
    case "diario": return 30;
    case "semanal": return SEMANAS_MES;
    case "mensal": return 1;
    case "bimestral": return 0.5;
    case "trimestral": return 1 / 3;
    case "quadrimestral": return 0.25;
    case "dias_semana": return d * SEMANAS_MES;
    case "dias_mes": return d;
    default: return null;
  }
}

/**
 * Custo mensal de processamento de uma funcionalidade para um cliente.
 * Com período definido, usa o modelo de reprocessamento; senão, cai no valor fixo (custo_processamento_mes).
 */
export function custoProcFuncionalidade(
  b: { proc_periodo?: string | null; proc_dias?: number | null; proc_fracao_volume?: number | null; custo_processamento_mes?: number | null },
  gbCliente: number,
  reaisPorGbProcessado: number,
): number {
  const exec = execucoesMes(b.proc_periodo, b.proc_dias);
  if (exec == null) return Number(b.custo_processamento_mes) || 0;
  const fracao = b.proc_fracao_volume == null ? 1 : Math.max(0, Number(b.proc_fracao_volume));
  return exec * fracao * Math.max(0, gbCliente) * Math.max(0, reaisPorGbProcessado);
}
