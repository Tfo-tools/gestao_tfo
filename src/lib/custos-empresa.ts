import type { FaseValue } from "@/lib/fases";

export type TipoCustoEmpresa = "fixo" | "escalonado" | "cronograma" | "variavel_receita" | "variavel_cliente";

export type FaixaEscalonada = { minimo: number; maximo: number | null; valor: number };
export type FaixaPorFase = { fase: FaseValue; valor: number };

export type ParametrosCustoEmpresa = {
  // escalonado
  faixas?: FaixaEscalonada[];
  faixasPorFase?: FaixaPorFase[];
  baseado_em?: "receita" | "clientes" | "fase";
  /** Produto cuja fase serve de referência pro estágio da empresa, quando baseado_em = "fase". */
  produto_referencia_id?: string;
  // cronograma
  mes_inicio?: string; // "YYYY-MM-01"
  valores_mensais?: number[];
  // variavel_receita
  percentual?: number;
  // variavel_cliente
  valor_por_cliente?: number;
};

export type CustoEmpresaInput = {
  tipo_custo: TipoCustoEmpresa;
  valor_mensal: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  parametros: ParametrosCustoEmpresa;
};

function mesesEntre(inicio: Date, mes: Date): number {
  return (mes.getFullYear() - inicio.getFullYear()) * 12 + (mes.getMonth() - inicio.getMonth());
}

/**
 * Custo mensal da empresa (não ligado a um produto específico) num determinado mês.
 * `faseReferencia` só é necessário quando o custo é escalonado por fase — é a fase em que o
 * produto de referência está naquele mês (calculada por quem chama, a partir das fases dele).
 */
export function custoEmpresaNoMes(
  custo: CustoEmpresaInput,
  mes: Date,
  receitaTotal: number,
  clientesTotal: number,
  faseReferencia?: FaseValue | null,
): number {
  if (custo.data_inicio) {
    const inicio = new Date(custo.data_inicio + "T00:00:00");
    if (mes < new Date(inicio.getFullYear(), inicio.getMonth(), 1)) return 0;
  }
  if (custo.data_fim) {
    const fim = new Date(custo.data_fim + "T00:00:00");
    if (mes > fim) return 0;
  }

  switch (custo.tipo_custo) {
    case "fixo":
      return custo.valor_mensal ?? 0;
    case "escalonado": {
      if (custo.parametros.baseado_em === "fase") {
        if (!faseReferencia) return 0;
        return (custo.parametros.faixasPorFase ?? []).find((f) => f.fase === faseReferencia)?.valor ?? 0;
      }
      const base = custo.parametros.baseado_em === "clientes" ? clientesTotal : receitaTotal;
      const faixa = (custo.parametros.faixas ?? []).find((f) => base >= f.minimo && (f.maximo == null || base <= f.maximo));
      return faixa?.valor ?? 0;
    }
    case "cronograma": {
      if (!custo.parametros.mes_inicio || !custo.parametros.valores_mensais) return 0;
      const inicio = new Date(custo.parametros.mes_inicio + "T00:00:00");
      const idx = mesesEntre(new Date(inicio.getFullYear(), inicio.getMonth(), 1), mes);
      if (idx < 0 || idx >= custo.parametros.valores_mensais.length) return 0;
      return custo.parametros.valores_mensais[idx] ?? 0;
    }
    case "variavel_receita":
      return receitaTotal * (custo.parametros.percentual ?? 0);
    case "variavel_cliente":
      return clientesTotal * (custo.parametros.valor_por_cliente ?? 0);
  }
}

/** Determina a fase ativa de um produto num mês, a partir das janelas de data das fases. */
export function faseDoProdutoNoMes(
  fases: { fase: FaseValue; data_inicio: string | null; data_fim: string | null }[],
  mes: Date,
): FaseValue | null {
  // Quando duas fases têm limite no mesmo mês civil, preferimos a que começou por último — ela
  // rege a maior parte do mês (ver mesma correção em simulacao.ts::faseParaMes).
  const dentro = fases
    .filter((f) => {
      if (!f.data_inicio || !f.data_fim) return false;
      const inicio = new Date(f.data_inicio + "T00:00:00");
      const fim = new Date(f.data_fim + "T00:00:00");
      return mes >= new Date(inicio.getFullYear(), inicio.getMonth(), 1) && mes <= fim;
    })
    .sort((a, b) => (a.data_inicio! < b.data_inicio! ? 1 : -1));
  if (dentro[0]) return dentro[0].fase;

  const passadas = fases
    .filter((f) => f.data_inicio && new Date(f.data_inicio + "T00:00:00") <= mes)
    .sort((a, b) => (a.data_inicio! < b.data_inicio! ? 1 : -1));
  return passadas[0]?.fase ?? null;
}
