/**
 * Simulação tributária — Simples Nacional, Anexo III (serviços com Fator R ≥ 28%) e Anexo V
 * (Fator R < 28%). Tabelas oficiais 2024, valores em R$. Fonte: planilha "Simulacao_Tributaria_SaaS"
 * (Vanessa) — confere com a LC 123/2006 vigente. Regimes pós-reforma tributária (IBS/CBS) e Lucro
 * Presumido/Real ficam pra quando a empresa migrar de regime; hoje a TFO está no Simples.
 */

export type FaixaSimples = { limite: number; aliquota: number; deducao: number };

export const ANEXO_III: FaixaSimples[] = [
  { limite: 180_000, aliquota: 0.06, deducao: 0 },
  { limite: 360_000, aliquota: 0.112, deducao: 9_360 },
  { limite: 720_000, aliquota: 0.135, deducao: 17_640 },
  { limite: 1_800_000, aliquota: 0.16, deducao: 35_640 },
  { limite: 3_600_000, aliquota: 0.21, deducao: 125_640 },
  { limite: 4_800_000, aliquota: 0.33, deducao: 648_000 },
];

export const ANEXO_V: FaixaSimples[] = [
  { limite: 180_000, aliquota: 0.155, deducao: 0 },
  { limite: 360_000, aliquota: 0.18, deducao: 4_500 },
  { limite: 720_000, aliquota: 0.195, deducao: 9_900 },
  { limite: 1_800_000, aliquota: 0.205, deducao: 17_100 },
  { limite: 3_600_000, aliquota: 0.23, deducao: 62_100 },
  { limite: 4_800_000, aliquota: 0.305, deducao: 540_000 },
];

function faixaSimples(rbt12: number, tabela: FaixaSimples[]): FaixaSimples {
  return tabela.find((f) => rbt12 <= f.limite) ?? tabela[tabela.length - 1];
}

/** Alíquota efetiva = (RBT12 × alíquota nominal da faixa − parcela a deduzir) / RBT12. */
export function aliquotaEfetivaSimples(rbt12: number, tabela: FaixaSimples[]): number {
  if (rbt12 <= 0) return tabela[0].aliquota;
  const faixa = faixaSimples(rbt12, tabela);
  return Math.max(0, (rbt12 * faixa.aliquota - faixa.deducao) / rbt12);
}

export type ResultadoSimples = {
  anexo: "III" | "V";
  fatorR: number;
  aliquotaEfetiva: number;
  impostoMensal: number;
};

/**
 * DAS mensal pelo Simples Nacional. Fator R = folha de pagamento + pró-labore acumulados nos
 * últimos 12 meses, dividido pelo RBT12 — decide o anexo (III se ≥28%, senão V, sempre mais caro).
 */
export function calcularImpostoSimples(receitaMensal: number, rbt12: number, fatorR: number): ResultadoSimples {
  const anexo: "III" | "V" = fatorR >= 0.28 ? "III" : "V";
  const tabela = anexo === "III" ? ANEXO_III : ANEXO_V;
  const aliquotaEfetiva = aliquotaEfetivaSimples(rbt12, tabela);
  return { anexo, fatorR, aliquotaEfetiva, impostoMensal: receitaMensal * aliquotaEfetiva };
}

// ─────────────────────────── Depois do Simples ───────────────────────────
// Acima de R$ 4,8 mi de faturamento no ano a empresa sai do Simples (LC 123, art. 30). Daí em
// diante o app modela lucro presumido: impostos sobre a receita (ISS, PIS/COFINS até 2026 e, na
// reforma, CBS + IBS com crédito) acima da margem bruta, e IRPJ/CSLL abaixo do EBITDA. Todas as
// alíquotas são estimativas editáveis em Configurações — validar com o contador.

export type ParametrosTributarios = {
  iss_pct: number;
  pis_pct: number;
  cofins_pct: number;
  /** Alíquota de referência estimada da CBS (federal) — ainda não fixada em definitivo. */
  cbs_pct: number;
  /** Alíquota cheia estimada do IBS (estadual + municipal), aplicada pelo cronograma da transição. */
  ibs_pct: number;
  /** Presunção de lucro para serviços (32%). */
  presuncao_pct: number;
  irpj_pct: number;
  /** Adicional de IRPJ sobre a base presumida acima de R$ 20 mil/mês. */
  irpj_adicional_pct: number;
  csll_pct: number;
  /** Quanto dos custos creditáveis de fato gera crédito (1 = 100%). Fornecedor no Simples, por
   *  exemplo, gera crédito menor. */
  credito_fator: number;
};

export const PARAMETROS_TRIBUTARIOS_PADRAO: ParametrosTributarios = {
  iss_pct: 0.05,
  pis_pct: 0.0065,
  cofins_pct: 0.03,
  cbs_pct: 0.088,
  ibs_pct: 0.177,
  presuncao_pct: 0.32,
  irpj_pct: 0.15,
  irpj_adicional_pct: 0.1,
  csll_pct: 0.09,
  credito_fator: 1,
};

export const LIMITE_SIMPLES_ANUAL = 4_800_000;

/** Lê a linha de parametros_tributarios (numeric vem como texto do banco); o que faltar usa o padrão. */
export function parametrosTributariosDe(row: Record<string, unknown> | null | undefined): ParametrosTributarios {
  const p = { ...PARAMETROS_TRIBUTARIOS_PADRAO };
  if (!row) return p;
  for (const k of Object.keys(p) as (keyof ParametrosTributarios)[]) {
    const v = row[k];
    if (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))) p[k] = Number(v);
  }
  return p;
}

/**
 * Cronograma da reforma tributária (EC 132/2023, LC 214/2025) para serviços:
 * até 2026 PIS/COFINS; de 2027 em diante CBS no lugar deles; o IBS entra aos poucos de 2029 a 2032
 * (10%, 20%, 30%, 40%) enquanto o ISS sai na mesma proporção, e a partir de 2033 só IBS + CBS.
 * O IBS de teste de 0,1% em 2026–2028 é compensável e fica de fora.
 */
export function transicaoReforma(ano: number): { issFator: number; ibsFator: number; cbs: boolean; pisCofins: boolean } {
  if (ano <= 2026) return { issFator: 1, ibsFator: 0, cbs: false, pisCofins: true };
  if (ano <= 2028) return { issFator: 1, ibsFator: 0, cbs: true, pisCofins: false };
  if (ano >= 2033) return { issFator: 0, ibsFator: 1, cbs: true, pisCofins: false };
  const ibs = (ano - 2028) / 10;
  return { issFator: 1 - ibs, ibsFator: ibs, cbs: true, pisCofins: false };
}

export type ResultadoPosSimples = {
  /** Impostos sobre a receita, já líquidos do crédito — ficam acima da margem bruta. */
  deducoes: number;
  aliquotaEfetiva: number;
  /** Crédito de CBS/IBS sobre o que a empresa compra de fornecedores. */
  credito: number;
  /** IRPJ + CSLL do lucro presumido — abaixo do EBITDA. */
  irpjCsll: number;
};

/** Tributos de um mês fora do Simples. Os custos creditáveis são compras de fornecedor (nuvem, LLM,
 *  software, gateway, mídia, agências) — folha e pró-labore não geram crédito. */
export function calcularTributosPosSimples(
  receitaMensal: number,
  custosCreditaveis: number,
  ano: number,
  p: ParametrosTributarios,
): ResultadoPosSimples {
  const t = transicaoReforma(ano);
  const iss = receitaMensal * p.iss_pct * t.issFator;
  const pisCofins = t.pisCofins ? receitaMensal * (p.pis_pct + p.cofins_pct) : 0;
  const aliquotaIva = (t.cbs ? p.cbs_pct : 0) + p.ibs_pct * t.ibsFator;
  const ivaBruto = receitaMensal * aliquotaIva;
  const credito = Math.min(ivaBruto, Math.max(0, custosCreditaveis) * aliquotaIva * p.credito_fator);
  const deducoes = iss + pisCofins + ivaBruto - credito;
  const basePresumida = receitaMensal * p.presuncao_pct;
  const irpj = basePresumida * p.irpj_pct + Math.max(0, basePresumida - 20_000) * p.irpj_adicional_pct;
  const csll = basePresumida * p.csll_pct;
  return { deducoes, aliquotaEfetiva: receitaMensal > 0 ? deducoes / receitaMensal : 0, credito, irpjCsll: irpj + csll };
}
