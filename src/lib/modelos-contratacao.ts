export type TipoModelo =
  | "clt"
  | "pj"
  | "empresa_fixo_escopo"
  | "empresa_hibrido"
  | "empresa_creditos"
  | "empresa_ia_atendimento";

export type ParametrosModelo = {
  /** Quanto de demanda (contatos, vendedores supervisionados ou horas, depende do cargo) 1 unidade cobre por mês. Não se aplica a híbrido/créditos, que escalam direto com a demanda. */
  capacidade_unidade_mes?: number;
  /** Estágio 1 do funil (lead → reunião): qualidade da prospecção deste modelo. Só faz sentido em
   * modelos de SDR — é o que separa um CLT com coordenador (leads quentes) de uma agência de volume. */
  taxa_qualificacao?: number;
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
  // Remuneração variável — vale pra CLT e PJ, em cima (ou no lugar) do fixo. Foi desenhada a
  // partir da operação real: a SDR CLT ganhava 1.600 fixo + 100 por reunião agendada + 0,10 por
  // ligação; a PJ não tinha fixo e cobrava o dobro nos dois variáveis. O PJ sem fixo se empenha
  // mais, o que aparece no modelo como taxa_qualificacao melhor (menos ligações por reunião).
  /** Pago por reunião efetivamente agendada (SDR) ou atendida (vendedor). */
  valor_por_reuniao?: number;
  /** Pago por ligação/contato executado — a "produtividade" combinada com o prestador. */
  valor_por_ligacao?: number;
  /** Teto de ligações/mês combinado. Com PJ dá pra combinar produtividade menor e pagar menos. */
  ligacoes_maximas_mes?: number;
  /** Comissão do vendedor sobre a receita do que ele fechou, em % do primeiro mês de contrato. */
  comissao_por_venda_pct?: number;
  /** Comissão fixa por venda fechada, quando não for percentual. */
  valor_por_venda?: number;
  // Empresa — IA de atendimento (SDR via WhatsApp/IA): capacidade_unidade_mes + valor_mensal
  // reaproveitados acima como "pacote" (0 = mensalidade única, sem teto de volume).
  /** Teto de LEADS do pacote contratado (bot). Diferente da capacidade, que é em reuniões. */
  leads_maximos_pacote?: number;
  valor_por_lead_trabalhado?: number;
  valor_por_lead_qualificado?: number;
  taxa_qualificacao_estimada?: number;
  valor_sessao_meta?: number;
  sessoes_meta_por_lead?: number;
  /** PJ com fixo mensal de contrato (ex: vendedor R$ 4.500): cobra a pessoa inteira, não a fração
   *  das horas usadas. Sem isso o PJ é proporcional à demanda (suporte por hora, SDR por reunião). */
  fixo_por_pessoa_inteira?: boolean;
  /** Só contrata quando a demanda do mês chega a este volume (na unidade do cargo). Abaixo, as
   *  sócias absorvem e o custo é zero — PJ fecha com ≥ 1 semana de trabalho (≈ ¼ da capacidade),
   *  CLT só com ≥ 1 mês (a capacidade inteira). */
  demanda_minima_mes?: number;
  /** PJ que vira CLT quando a demanda passa de N pessoas cheias: até aí paga proporcional às horas;
   *  depois contrata pessoas inteiras e só adiciona a próxima quando a demanda exige mais uma
   *  cheia (opera acima da capacidade no meio). Ex.: suporte — PJ até 2, CLT a partir da 3ª. */
  clt_apos_unidades?: number;
  /** Custo mensal de 1 pessoa CLT nesse cargo (salário + encargos + estrutura), pra regra acima. */
  clt_custo_pessoa?: number;
};

export const TIPO_MODELO_LABEL: Record<TipoModelo, string> = {
  clt: "CLT",
  pj: "PJ (prestador individual)",
  empresa_fixo_escopo: "Empresa — fixo por escopo",
  empresa_hibrido: "Empresa — híbrido (fixo + por resultado)",
  empresa_creditos: "Empresa — créditos / pay-per-use",
  empresa_ia_atendimento: "Empresa — IA de atendimento (SDR via WhatsApp)",
};

/** O que o mês pede, além do volume de entrada — usado pelos componentes variáveis da remuneração. */
export type ContextoCusto = {
  /** Reuniões do mês: agendadas, no caso do SDR; atendidas, no caso do vendedor. */
  reunioes?: number;
  /** Ligações/contatos executados no mês. Se omitido, sai de reuniões ÷ taxa_qualificacao. */
  ligacoes?: number;
  /** Vendas fechadas no mês — base da comissão do vendedor. */
  vendas?: number;
  /** Receita do primeiro mês das vendas fechadas — base da comissão percentual. */
  receitaNovasVendas?: number;
  /** Pessoas/unidades no mês — o teto de ligações combinado é por pessoa. */
  unidades?: number;
  /**
   * Leads já calculados fora, quando cada produto tem sua própria taxa de conversão: o Skills
   * converte mais fácil que o Price com o mesmo bot, então a soma dos leads não sai de uma taxa
   * única. Quando vem preenchido, substitui o cálculo interno por taxa.
   */
  leads?: number;
};

/** Bot de SDR (IA): cobra por lead e escala em pacotes — não tem teto de ligações por pessoa. */
function ehBotDeLeads(parametros: ParametrosModelo): boolean {
  return (
    parametros.leads_maximos_pacote != null ||
    parametros.valor_por_lead_trabalhado != null
  );
}

/** Ligações necessárias pra agendar as reuniões do mês, na eficiência deste modelo. Respeita o
 *  teto combinado: com PJ dá pra contratar produtividade menor e pagar menos. */
function ligacoesDoMes(
  parametros: ParametrosModelo,
  contexto: ContextoCusto,
): number {
  if (contexto.leads != null) return contexto.leads;
  if (contexto.ligacoes != null) return contexto.ligacoes;
  const reunioes = contexto.reunioes ?? 0;
  // No bot, a oportunidade é o lead QUALIFICADO — a mesma taxa que ele usa pra cobrar o
  // qualificado. Um número só, pra custo e dimensionamento não discordarem.
  const bot = ehBotDeLeads(parametros);
  const taxa = bot
    ? parametros.taxa_qualificacao_estimada || parametros.taxa_qualificacao || 0
    : (parametros.taxa_qualificacao ?? 0);
  const necessarias = taxa > 0 ? reunioes / taxa : 0;
  if (bot) return necessarias;
  const teto =
    (parametros.ligacoes_maximas_mes ?? 0) *
    Math.max(1, Math.ceil((contexto.unidades ?? 1) - 1e-9));
  return teto > 0 ? Math.min(necessarias, teto) : necessarias;
}

/** Parte variável comum a CLT e PJ: por reunião, por ligação e comissão de venda. */
function remuneracaoVariavel(
  parametros: ParametrosModelo,
  contexto: ContextoCusto,
): number {
  const porReuniao =
    (contexto.reunioes ?? 0) * (parametros.valor_por_reuniao ?? 0);
  const porLigacao =
    ligacoesDoMes(parametros, contexto) * (parametros.valor_por_ligacao ?? 0);
  const porVenda = (contexto.vendas ?? 0) * (parametros.valor_por_venda ?? 0);
  const comissao =
    (contexto.receitaNovasVendas ?? 0) *
    (parametros.comissao_por_venda_pct ?? 0);
  return porReuniao + porLigacao + porVenda + comissao;
}

/**
 * Calcula o custo mensal e a quantidade de unidades (pessoas/pacotes) necessárias pra cobrir uma demanda.
 *
 * `demanda` é o volume de ENTRADA do cargo na unidade daquele cargo — reuniões/mês para SDR e
 * vendedor, horas/mês para suporte. O `contexto` carrega o que a parte variável precisa (reuniões,
 * ligações, vendas), porque cada modelo remunera uma coisa diferente sobre o mesmo volume.
 */
export function custoMensalModelo(
  tipoModelo: TipoModelo,
  parametros: ParametrosModelo,
  demanda: number,
  contexto: ContextoCusto = {},
): { custoMensal: number; unidades: number; regime?: "clt" | "pj" } {
  const demandaConvertida = contexto.reunioes;
  // Abaixo do volume mínimo combinado ninguém é contratado: as sócias cobrem, sem custo.
  const minimo = parametros.demanda_minima_mes ?? 0;
  if (
    (tipoModelo === "clt" || tipoModelo === "pj") &&
    minimo > 0 &&
    demanda < minimo
  ) {
    return { custoMensal: 0, unidades: 0 };
  }
  switch (tipoModelo) {
    case "clt": {
      const capacidade = parametros.capacidade_unidade_mes ?? 0;
      const unidades = capacidade > 0 ? Math.ceil(demanda / capacidade) : 0;
      const custoUnitario =
        (parametros.salario_bruto ?? 0) *
          (1 + (parametros.aliquota_encargos ?? 0)) +
        (parametros.custo_estrutura_mensal ?? 0);
      // O fixo é por cabeça; o variável é do volume do mês, que já está distribuído entre elas.
      return {
        custoMensal:
          unidades * custoUnitario +
          remuneracaoVariavel(parametros, { ...contexto, unidades }),
        unidades,
      };
    }
    case "pj": {
      // PJ é contratado só pela quantidade de horas necessária — custo proporcional à demanda
      // (fração de "unidade cheia"), sem arredondar pra cima. É por isso que, em baixo volume,
      // o PJ sai mais barato que 1 CLT inteiro; conforme o volume sobe, o CLT (que só entra
      // inteiro) passa a compensar mais.
      const capacidade = parametros.capacidade_unidade_mes ?? 0;
      const unidades = capacidade > 0 ? demanda / capacidade : 0;
      // Passou do limite combinado: vira CLT em pessoas inteiras, sem fração — a próxima pessoa só
      // entra quando a demanda pede mais uma cheia (floor), então há meses acima da capacidade.
      const limiteClt = parametros.clt_apos_unidades ?? 0;
      if (
        limiteClt > 0 &&
        unidades > limiteClt &&
        (parametros.clt_custo_pessoa ?? 0) > 0
      ) {
        const pessoasClt = Math.max(limiteClt, Math.floor(unidades + 1e-9));
        return {
          custoMensal: pessoasClt * (parametros.clt_custo_pessoa ?? 0),
          unidades: pessoasClt,
          regime: "clt",
        };
      }
      const pessoas = Math.ceil(unidades - 1e-9);
      const inteiro = parametros.fixo_por_pessoa_inteira === true;
      // Estrutura (central, sistema, computador) é por pessoa trabalhando no mês.
      const custoEstrutura = pessoas * (parametros.custo_estrutura_mensal ?? 0);
      // PJ sem fixo (valor_mensal 0) fica só com o variável — é o caso da SDR que cobra por
      // reunião e produtividade, sem salário.
      const fixo =
        (inteiro ? pessoas : unidades) * (parametros.valor_mensal ?? 0);
      return {
        custoMensal:
          fixo +
          custoEstrutura +
          remuneracaoVariavel(parametros, { ...contexto, unidades: pessoas }),
        unidades: inteiro ? pessoas : unidades,
      };
    }
    case "empresa_fixo_escopo": {
      // Pacote de agência: compra-se em unidades inteiras de capacidade (não dá pra comprar "meio pacote").
      const capacidade = parametros.capacidade_unidade_mes ?? 0;
      const unidades = capacidade > 0 ? Math.ceil(demanda / capacidade) : 0;
      return {
        custoMensal: unidades * (parametros.valor_mensal ?? 0),
        unidades,
      };
    }
    case "empresa_hibrido": {
      // O "por unidade convertida" é por REUNIÃO gerada, não por lead trabalhado.
      const convertidas = demandaConvertida ?? demanda;
      return {
        custoMensal:
          (parametros.valor_fixo_mensal ?? 0) +
          convertidas * (parametros.valor_por_unidade_convertida ?? 0),
        unidades: 0,
      };
    }
    case "empresa_creditos":
      // A agência de créditos/IA cobra por REUNIÃO VALIDADA (R$150-300), não por lead disparado —
      // o volume de disparo é problema dela. Por isso multiplica a demanda em reuniões direto.
      return {
        custoMensal:
          demanda *
          (parametros.creditos_por_unidade ?? 1) *
          (parametros.valor_por_credito ?? 0),
        unidades: 0,
      };
    case "empresa_ia_atendimento": {
      // Único modelo cobrado por LEAD trabalhado — o bot dispara em volume. Como a demanda chega em
      // reuniões, os leads são derivados aqui pela eficiência dele: quanto pior a qualificação,
      // mais leads pras mesmas reuniões, mais caro.
      const leads = ligacoesDoMes(parametros, contexto) || demanda;
      // O pacote do bot é dimensionado por LEADS incluídos, não pelas reuniões que ele entrega.
      const tetoLeads = parametros.leads_maximos_pacote ?? 0;
      const unidades =
        tetoLeads > 0 ? Math.ceil(leads / tetoLeads) : leads > 0 ? 1 : 0;
      const custoBase = unidades * (parametros.valor_mensal ?? 0);
      const custoPorLead = leads * (parametros.valor_por_lead_trabalhado ?? 0);
      const custoQualificacao =
        leads *
        (parametros.taxa_qualificacao_estimada ?? 0) *
        (parametros.valor_por_lead_qualificado ?? 0);
      // Custo repassado da API oficial da Meta (cobrada por sessão de conversa de 24h) — separado
      // do valor do próprio serviço, porque a Meta cobra isso direto, não a empresa de IA.
      const custoMeta =
        leads *
        (parametros.sessoes_meta_por_lead ?? 0) *
        (parametros.valor_sessao_meta ?? 0);
      return {
        custoMensal: custoBase + custoPorLead + custoQualificacao + custoMeta,
        unidades,
      };
    }
  }
}

/** Leads/ligações que este modelo precisa trabalhar pras reuniões do mês — só pra exibir na
 *  comparação. O custo já calcula isso internamente em quem cobra por lead. */
export function leadsParaReunioes(
  parametros: ParametrosModelo,
  reunioes: number,
): number {
  return ligacoesDoMes(parametros, { reunioes });
}

/**
 * Quanto da demanda do mês uma alocação cobre — e paga.
 *
 * CLT e pacote fechado: o que você contratou (N × capacidade), independente da demanda — se sobrar,
 * fica ocioso e paga igual. PJ, agência híbrida, créditos e bot: cobram pelo volume trabalhado, mas
 * LIMITADO ao que a quantidade alocada consegue entregar (N × capacidade). O que a demanda pedir
 * além disso não vira custo — é o esforço das sócias, que o plano trata como sem custo de folha.
 * Foi assim que "1 SDR PJ captando e o resto é a gente" passou a ser representável.
 */
export function volumeCobertoPelaAlocacao(
  tipo: TipoModelo,
  parametros: ParametrosModelo,
  quantidade: number,
  demandaDoMes: number,
): { coberto: number; cobrado: number } {
  const capacidade = parametros.capacidade_unidade_mes ?? 0;
  const teto =
    quantidade > 0 && capacidade > 0 ? quantidade * capacidade : null;
  if (tipo === "clt" || tipo === "empresa_fixo_escopo") {
    const contratado = teto ?? demandaDoMes;
    return { coberto: Math.min(demandaDoMes, contratado), cobrado: contratado };
  }
  const usado = teto != null ? Math.min(demandaDoMes, teto) : demandaDoMes;
  return { coberto: usado, cobrado: usado };
}
