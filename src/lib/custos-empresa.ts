export type TipoCustoEmpresa = "fixo" | "escalonado" | "cronograma" | "variavel_receita" | "variavel_cliente";

export type FaixaEscalonada = { minimo: number; maximo: number | null; valor: number };

export type ParametrosCustoEmpresa = {
  // escalonado
  faixas?: FaixaEscalonada[];
  baseado_em?: "receita" | "clientes";
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

/** Custo mensal da empresa (não ligado a um produto específico) num determinado mês. */
export function custoEmpresaNoMes(custo: CustoEmpresaInput, mes: Date, receitaTotal: number, clientesTotal: number): number {
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
