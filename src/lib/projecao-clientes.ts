/**
 * Projeção de clientes/assinaturas por módulo (etapa 3 do plano de produto).
 * Função pura: para cada fase (duração em meses, novos clientes por mês, churn mensal), caminha mês a
 * mês a partir do início do módulo; a última fase continua até o horizonte. Soma por mês do calendário,
 * respeitando a data de início de cada módulo, dá o total da plataforma.
 */
export type FaseCrescimento = { nome: string; meses: number; novos_mes: number; churn_pct: number };

export const CRESCIMENTO_PADRAO: FaseCrescimento[] = [
  { nome: "Lançamento", meses: 3, novos_mes: 2, churn_pct: 2 },
  { nome: "Tração", meses: 9, novos_mes: 4, churn_pct: 3 },
  { nome: "Escala", meses: 12, novos_mes: 8, churn_pct: 3 },
  { nome: "Maturidade", meses: 12, novos_mes: 5, churn_pct: 4 },
];

/** Clientes ativos do módulo, mês a mês desde o seu início (índice 0 = primeiro mês), por `horizonte` meses. */
export function projetarModulo(fases: FaseCrescimento[], horizonte = 36): number[] {
  const curva = fases.length > 0 ? fases : CRESCIMENTO_PADRAO;
  const ativos: number[] = [];
  let cur = 0;
  let m = 0;
  for (const f of curva) {
    const meses = Math.max(0, Math.round(f.meses));
    for (let i = 0; i < meses && m < horizonte; i++, m++) {
      cur = cur * (1 - (Number(f.churn_pct) || 0) / 100) + (Number(f.novos_mes) || 0);
      ativos.push(cur);
    }
  }
  const ultima = curva[curva.length - 1];
  while (m < horizonte) {
    cur = cur * (1 - (Number(ultima?.churn_pct) || 0) / 100) + (Number(ultima?.novos_mes) || 0);
    ativos.push(cur);
    m++;
  }
  return ativos;
}

export type ModuloProjetado = { codigo: string; nome: string; fases: FaseCrescimento[]; offsetMes: number };

/**
 * Total da plataforma mês a mês do calendário. `offsetMes` é quantos meses depois do início mais cedo
 * aquele módulo começa (vem da data de início dos testes). Retorna também por módulo.
 */
export function projetarPlataforma(modulos: ModuloProjetado[], horizonte = 36): { total: number[]; porModulo: { codigo: string; nome: string; curva: number[] }[] } {
  const porModulo = modulos.map((m) => {
    const propria = projetarModulo(m.fases, Math.max(0, horizonte - m.offsetMes));
    const curva = new Array<number>(horizonte).fill(0);
    for (let i = 0; i < propria.length && m.offsetMes + i < horizonte; i++) curva[m.offsetMes + i] = propria[i];
    return { codigo: m.codigo, nome: m.nome, curva };
  });
  const total = new Array<number>(horizonte).fill(0);
  for (const pm of porModulo) for (let i = 0; i < horizonte; i++) total[i] += pm.curva[i];
  return { total, porModulo };
}

/** Diferença em meses entre duas datas ISO (aaaa-mm-dd), nunca negativa. */
export function mesesEntre(aIso: string | null, bIso: string | null): number {
  if (!aIso || !bIso) return 0;
  const a = new Date(aIso), b = new Date(bIso);
  const d = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.max(0, d);
}
