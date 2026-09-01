export type TipoModelo = "clt" | "pj" | "empresa_fixo_escopo" | "empresa_hibrido" | "empresa_creditos";

export type ParametrosModelo = {
  /** Quanto de demanda (contatos, vendedores supervisionados ou horas, depende do cargo) 1 unidade cobre por mês. Não se aplica a híbrido/créditos, que escalam direto com a demanda. */
  capacidade_unidade_mes?: number;
  // CLT
  horas_semanais?: number;
  salario_bruto?: number;
  aliquota_encargos?: number;
  custo_estrutura_mensal?: number;
  // PJ / Empresa (fixo por escopo)
  valor_mensal?: number;
  canal?: string;
  // Empresa híbrido
  valor_fixo_mensal?: number;
  valor_por_unidade_convertida?: number;
  // Empresa créditos
  valor_por_credito?: number;
  creditos_por_unidade?: number;
};

export const TIPO_MODELO_LABEL: Record<TipoModelo, string> = {
  clt: "CLT",
  pj: "PJ (prestador individual)",
  empresa_fixo_escopo: "Empresa — fixo por escopo",
  empresa_hibrido: "Empresa — híbrido (fixo + por resultado)",
  empresa_creditos: "Empresa — créditos / pay-per-use",
};

/** Calcula o custo mensal e a quantidade de unidades (pessoas/pacotes) necessárias pra cobrir uma demanda. */
export function custoMensalModelo(
  tipoModelo: TipoModelo,
  parametros: ParametrosModelo,
  demanda: number,
): { custoMensal: number; unidades: number } {
  switch (tipoModelo) {
    case "clt": {
      const capacidade = parametros.capacidade_unidade_mes ?? 0;
      const unidades = capacidade > 0 ? Math.ceil(demanda / capacidade) : 0;
      const custoUnitario =
        (parametros.salario_bruto ?? 0) * (1 + (parametros.aliquota_encargos ?? 0)) + (parametros.custo_estrutura_mensal ?? 0);
      return { custoMensal: unidades * custoUnitario, unidades };
    }
    case "pj": {
      // PJ é contratado só pela quantidade de horas necessária — custo proporcional à demanda
      // (fração de "unidade cheia"), sem arredondar pra cima. É por isso que, em baixo volume,
      // o PJ sai mais barato que 1 CLT inteiro; conforme o volume sobe, o CLT (que só entra
      // inteiro) passa a compensar mais.
      const capacidade = parametros.capacidade_unidade_mes ?? 0;
      const unidades = capacidade > 0 ? demanda / capacidade : 0;
      const custoEstrutura = unidades > 0 ? (parametros.custo_estrutura_mensal ?? 0) : 0;
      return { custoMensal: unidades * (parametros.valor_mensal ?? 0) + custoEstrutura, unidades };
    }
    case "empresa_fixo_escopo": {
      // Pacote de agência: compra-se em unidades inteiras de capacidade (não dá pra comprar "meio pacote").
      const capacidade = parametros.capacidade_unidade_mes ?? 0;
      const unidades = capacidade > 0 ? Math.ceil(demanda / capacidade) : 0;
      return { custoMensal: unidades * (parametros.valor_mensal ?? 0), unidades };
    }
    case "empresa_hibrido":
      return {
        custoMensal: (parametros.valor_fixo_mensal ?? 0) + demanda * (parametros.valor_por_unidade_convertida ?? 0),
        unidades: 0,
      };
    case "empresa_creditos":
      return {
        custoMensal: demanda * (parametros.creditos_por_unidade ?? 1) * (parametros.valor_por_credito ?? 0),
        unidades: 0,
      };
  }
}
