import type { createClient } from "@/lib/supabase/server";
import type { FaseValue } from "@/lib/fases";
import { datasTravadas, produtosDoCenario } from "@/lib/fases-produto";
import { calcularSimulacao, faseParaMes, taxasDoMes, type FaseInput } from "@/lib/simulacao";
import { montarEntradaSimulacao } from "@/lib/simulacao-produto";
import {
  calibrarCrescimento,
  churnMensalParaAnual,
  converterDoModeloTrimestral,
  FASES_PLANO,
  type FasePlanoReceita,
  type ModeloPlano,
} from "@/lib/plano-receita";

/**
 * Tudo o que a tela "Plano de crescimento e churn" precisa de um cenário. Num cenário ainda no
 * modelo trimestral (importado), as premissas por fase vêm convertidas do plano atual — só pra
 * mostrar; nada é gravado até alguém salvar.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type FaseTela = FasePlanoReceita & {
  label: string;
  data_inicio: string | null;
  data_fim: string | null;
};

export type ProdutoPlanoReceita = {
  id: string;
  nome: string;
  /** Produto iniciado: as datas das fases não mudam mais. */
  datasTravadas: boolean;
  fases: FaseTela[];
  sazonalidade: number[] | null;
  /** Projeção atual, por mês (AAAA-MM-01). */
  mrrPorMes: Record<string, number>;
  clientesPorMes: Record<string, number>;
  /** Fase de cada mês do período do cenário. */
  fasePorMes: Record<string, FaseValue>;
};

export type AnoMeta = {
  ano: number;
  /** Meta de crescimento do MRR total, dez contra dez (fração). */
  crescimento: number | null;
  metasProduto: Record<string, number>;
};

export type DadosPlanoReceita = {
  modelo: ModeloPlano;
  pctVendasCombo: number | null;
  combo: { nome: string; desconto: number; produtos: string[] } | null;
  pesos: Record<string, number>;
  /** Participação de cada produto no MRR de dezembro anterior ao primeiro ano da meta. */
  pesosCalculados: Record<string, number>;
  anos: AnoMeta[];
  produtos: ProdutoPlanoReceita[];
  inicio: string;
  fim: string;
  /** Outros cenários — pra "índice sobre outro cenário": pega o crescimento QUE ELE já entrega em
   *  cada ano e você aplica uma fração/múltiplo em cima, em vez de calcular a fórmula na mão. */
  outrosCenarios: CenarioReferencia[];
  /** Churn médio anual DESTE cenário hoje, total e por produto — baseline pra "índice de churn"
   *  saber quanto deslocar (mesma lógica de crescHoje, só que pro churn). */
  churnAtualPorAno: Record<number, number>;
  churnAtualPorAnoPorProduto: Record<string, Record<number, number>>;
};

export type CenarioReferencia = {
  id: string;
  nome: string;
  /** Crescimento do MRR total dez/dez desse cenário, por ano — mesma base da seção 1 daqui. */
  crescimentoPorAno: Record<number, number>;
  /** O mesmo, por produto — pra tabela de trajetória abrir o detalhe (Mind/Price/Skills). */
  crescimentoPorAnoPorProduto: Record<string, Record<number, number>>;
  /** Churn médio do ano desse cenário, anualizado: consolidado ponderado pelos clientes ativos
   *  (a mesma conta do card de Indicadores, que mostra a taxa MENSAL); por produto, média dos
   *  meses em que o produto tem cliente. */
  churnAnualPorAno: Record<number, number>;
  churnAnualPorAnoPorProduto: Record<string, Record<number, number>>;
  /** MRR e clientes de dezembro, em valor absoluto — é nisso que o índice se ancora ("X × o que
   *  ELE entrega"), não no ritmo aplicado ao ponto de partida daqui, que pode ser outro. */
  mrrDezPorAno: Record<number, number>;
  clientesDezPorAno: Record<number, number>;
  mrrDezPorAnoPorProduto: Record<string, Record<number, number>>;
};

const mesIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const somarMeses = (iso: string, n: number) => {
  const d = new Date(iso.slice(0, 7) + "-01T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
};

export type FaseLinha = {
  fase: string;
  taxa_crescimento_mensal: number | null;
  taxa_churn_mensal: number | null;
  plano_cresc_inicio: number | null;
  plano_cresc_alvo: number | null;
  plano_churn_inicio: number | null;
  plano_churn_alvo: number | null;
  fases_trimestres: { indice: number; taxa_crescimento_mensal: number | null; taxa_churn_mensal: number | null }[] | null;
};

const num = (v: unknown) => (v != null ? Number(v) : null);

/** Fases como o motor as vê: datas do produto, taxas do modelo trimestral do cenário. */
export function fasesDoMotor(
  linhas: FaseLinha[],
  datas: { fase: string; data_inicio: string | null; data_fim: string | null }[],
): FaseInput[] {
  return linhas.map((f) => {
    const d = datas.find((x) => x.fase === f.fase);
    return {
      fase: f.fase as FaseValue,
      data_inicio: d?.data_inicio ?? null,
      data_fim: d?.data_fim ?? null,
      taxa_crescimento_mensal: num(f.taxa_crescimento_mensal),
      taxa_churn_mensal: num(f.taxa_churn_mensal),
      trimestres: (f.fases_trimestres ?? []).map((t) => ({
        indice: Number(t.indice),
        taxa_crescimento_mensal: num(t.taxa_crescimento_mensal),
        taxa_churn_mensal: num(t.taxa_churn_mensal),
      })),
    };
  });
}

/** Meses com a fase de cada um, do início da primeira fase até `ate` (inclusive). */
export function mesesComFase(fases: FaseInput[], ate: string): { mes: string; fase: FaseValue }[] {
  const inicio = fases
    .map((f) => f.data_inicio)
    .filter((d): d is string => !!d)
    .sort()[0];
  if (!inicio) return [];
  const saida: { mes: string; fase: FaseValue }[] = [];
  for (let i = 0; i < 400; i++) {
    const m = somarMeses(inicio, i);
    const iso = mesIso(m);
    if (iso > ate) break;
    const f = faseParaMes(fases, m);
    if (f) saida.push({ mes: iso, fase: f.fase });
  }
  return saida;
}

/** Até onde as curvas precisam ir: o fim da última fase fechada ou o fim do cenário + 1 ano. */
export function horizonte(fases: FaseInput[], fimCenario: string): string {
  const fimFases = fases
    .map((f) => f.data_fim)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  const maisUmAno = mesIso(somarMeses(fimCenario, 12));
  return fimFases && fimFases > maisUmAno ? `${fimFases.slice(0, 7)}-01` : maisUmAno;
}

/**
 * Traduz o plano trimestral de um produto para o plano pela receita: churn das próprias taxas e
 * crescimento calibrado no motor, pra que a receita no fim de cada fase continue a de hoje.
 */
export async function converterProduto(
  supabase: Supabase,
  produtoId: string,
  cenarioId: string,
  motor: FaseInput[],
  meses: { mes: string; fase: FaseValue }[],
  fim: string,
): Promise<FasePlanoReceita[]> {
  const churn = converterDoModeloTrimestral({
    mesesComFase: meses,
    taxaLegada: (fase, mes) => {
      const f = motor.find((x) => x.fase === fase);
      return f ? taxasDoMes(f, new Date(mes + "T00:00:00")) : { crescimento: 0, churn: 0 };
    },
    mrrPorMes: new Map(),
  });
  const entrada = await montarEntradaSimulacao(supabase, produtoId, cenarioId, null, true);
  if (!("input" in entrada)) return churn;
  const legado = calcularSimulacao(entrada.input);
  const [{ data: cen }, { data: prod }] = await Promise.all([
    supabase.from("cenarios").select("pct_vendas_combo").eq("id", cenarioId).single(),
    supabase.from("produtos").select("sazonalidade_vendas").eq("id", produtoId).single(),
  ]);
  const pct = cen?.pct_vendas_combo != null ? Number(cen.pct_vendas_combo) : null;
  const saz = Array.isArray(prod?.sazonalidade_vendas) ? (prod.sazonalidade_vendas as unknown[]).map(Number) : null;
  // A mesma entrada, agora pela receita: combo do cenário e sazonalidade do produto.
  const receita = await montarEntradaSimulacao(supabase, produtoId, cenarioId, {
    fases: churn,
    sazonalidade: saz,
    pctVendasCombo: pct,
  });
  if (!("input" in receita)) return churn;
  return calibrarCrescimento({
    simular: (fases) => calcularSimulacao({ ...receita.input, planoReceita: { fases, sazonalidade: saz } }),
    mesesComFase: meses,
    mrrAlvo: new Map(legado.map((r) => [r.mes_referencia, r.mrr])),
    base: churn,
    fim,
  });
}

export async function carregarPlanoReceita(supabase: Supabase, cenarioId: string): Promise<DadosPlanoReceita | null> {
  const { data: cenario } = await supabase
    .from("cenarios")
    .select("id, data_inicio, data_fim, modelo_plano, pct_vendas_combo, pesos_receita")
    .eq("id", cenarioId)
    .single();
  if (!cenario) return null;
  const modelo: ModeloPlano = cenario.modelo_plano === "receita" ? "receita" : "trimestral";
  const inicio = `${String(cenario.data_inicio ?? "").slice(0, 7)}-01`;
  const fim = `${String(cenario.data_fim ?? "").slice(0, 7)}-01`;

  const doCenario = await produtosDoCenario(supabase, cenarioId);
  const ids = doCenario.map((p) => p.id);
  if (ids.length === 0)
    return {
      modelo, pctVendasCombo: null, combo: null, pesos: {}, pesosCalculados: {}, anos: [], produtos: [], inicio, fim,
      outrosCenarios: [], churnAtualPorAno: {}, churnAtualPorAnoPorProduto: {},
    };

  const [{ data: fasesRaw }, { data: simRaw }, { data: produtosRaw }, { data: metasRaw }, { data: itensCombo }] =
    await Promise.all([
      supabase
        .from("fases_produto")
        .select(
          "produto_id, fase, taxa_crescimento_mensal, taxa_churn_mensal, plano_cresc_inicio, plano_cresc_alvo, plano_churn_inicio, plano_churn_alvo, fases_trimestres(indice, taxa_crescimento_mensal, taxa_churn_mensal)",
        )
        .eq("cenario_id", cenarioId)
        .in("produto_id", ids),
      supabase
        .from("simulacao_mensal")
        .select("produto_id, mes_referencia, mrr, clientes_ativos")
        .eq("cenario_id", cenarioId)
        .in("produto_id", ids)
        .order("mes_referencia"),
      supabase.from("produtos").select("id, sazonalidade_vendas").in("id", ids),
      supabase.from("cenario_meta_receita").select("ano, crescimento_pct, metas_produto").eq("cenario_id", cenarioId),
      supabase.from("combo_produtos_itens").select("combo_id, produto_id").in("produto_id", ids),
    ]);

  // Combo: o primeiro que junta produtos deste cenário (hoje só existe o Price + Skills).
  let combo: DadosPlanoReceita["combo"] = null;
  const comboId = (itensCombo ?? [])[0]?.combo_id as string | undefined;
  if (comboId) {
    const { data: c } = await supabase.from("combos_produtos").select("nome, desconto_pct").eq("id", comboId).single();
    const nomes = (itensCombo ?? [])
      .filter((i) => i.combo_id === comboId)
      .map((i) => doCenario.find((p) => p.id === i.produto_id)?.nome)
      .filter((n): n is string => !!n);
    if (c) combo = { nome: c.nome, desconto: Number(c.desconto_pct ?? 0), produtos: nomes };
  }

  const produtos: ProdutoPlanoReceita[] = [];
  for (const p of doCenario) {
    const linhas = ((fasesRaw ?? []) as (FaseLinha & { produto_id: string })[]).filter((f) => f.produto_id === p.id);
    const motor = fasesDoMotor(linhas, p.fases);
    const sim = (simRaw ?? []).filter((s) => s.produto_id === p.id);
    const mrrPorMes: Record<string, number> = {};
    const clientesPorMes: Record<string, number> = {};
    for (const s of sim) {
      mrrPorMes[s.mes_referencia] = Number(s.mrr ?? 0);
      clientesPorMes[s.mes_referencia] = Number(s.clientes_ativos ?? 0);
    }
    const meses = mesesComFase(motor, horizonte(motor, fim));
    const fasePorMes: Record<string, FaseValue> = {};
    for (const m of meses) if (m.mes >= inicio && m.mes <= fim) fasePorMes[m.mes] = m.fase;

    // Premissas já guardadas (cenário convertido, ou importado com a tradução salva) valem como
    // estão. Sem elas, o plano atual é traduzido na hora: churn direto das taxas, crescimento
    // calibrado rodando o motor — nada é gravado.
    const salvo = linhas.some((l) => l.plano_cresc_alvo != null || l.plano_churn_alvo != null);
    const convertidas = salvo
      ? null
      : await converterProduto(supabase, p.id, cenarioId, motor, meses, fim);

    const fases: FaseTela[] = FASES_PLANO.map((f) => {
      const d = p.fases.find((x) => x.fase === f.value);
      const l = linhas.find((x) => x.fase === f.value);
      const c = convertidas?.find((x) => x.fase === f.value);
      return {
        fase: f.value,
        label: f.label,
        data_inicio: d?.data_inicio ?? null,
        data_fim: d?.data_fim ?? null,
        cresc_inicio: convertidas ? (c?.cresc_inicio ?? null) : num(l?.plano_cresc_inicio),
        cresc_alvo: convertidas ? (c?.cresc_alvo ?? null) : num(l?.plano_cresc_alvo),
        churn_inicio: convertidas ? (c?.churn_inicio ?? null) : num(l?.plano_churn_inicio),
        churn_alvo: convertidas ? (c?.churn_alvo ?? null) : num(l?.plano_churn_alvo),
      };
    });
    const saz = (produtosRaw ?? []).find((x) => x.id === p.id)?.sazonalidade_vendas;
    produtos.push({
      id: p.id,
      nome: p.nome,
      datasTravadas: datasTravadas(p.status),
      fases,
      sazonalidade: Array.isArray(saz) && saz.length === 12 ? saz.map(Number) : null,
      mrrPorMes,
      clientesPorMes,
      fasePorMes,
    });
  }

  // Anos da meta: do primeiro ano que já parte de um dezembro com receita até o fim do cenário.
  const mrrTotal = (mes: string) => produtos.reduce((s, p) => s + (p.mrrPorMes[mes] ?? 0), 0);
  const anoIni = Number(inicio.slice(0, 4));
  const anoFim = Number(fim.slice(0, 4));
  const anos: AnoMeta[] = [];
  let primeiroAno: number | null = null;
  for (let a = anoIni; a <= anoFim; a++) {
    if (mrrTotal(`${a - 1}-12-01`) <= 0) continue;
    primeiroAno ??= a;
    const salvo = (metasRaw ?? []).find((m) => m.ano === a);
    anos.push({
      ano: a,
      crescimento: salvo?.crescimento_pct != null ? Number(salvo.crescimento_pct) : null,
      metasProduto: ((salvo?.metas_produto as Record<string, number> | null) ?? {}) as Record<string, number>,
    });
  }
  const pesosCalculados: Record<string, number> = {};
  if (primeiroAno != null) {
    const dez = `${primeiroAno - 1}-12-01`;
    const total = mrrTotal(dez);
    for (const p of produtos) pesosCalculados[p.id] = total > 0 ? (p.mrrPorMes[dez] ?? 0) / total : 0;
  }

  const todasAsCurvas = await carregarTodosCenariosComCurvas(supabase, cenarioId, anoIni, anoFim);
  const self = todasAsCurvas.find((c) => c.id === cenarioId);
  const outrosCenarios = todasAsCurvas.filter((c) => c.id !== cenarioId);

  return {
    modelo,
    pctVendasCombo: cenario.pct_vendas_combo != null ? Number(cenario.pct_vendas_combo) : null,
    combo,
    pesos: (cenario.pesos_receita as Record<string, number> | null) ?? {},
    pesosCalculados,
    anos,
    produtos,
    inicio,
    fim,
    outrosCenarios,
    churnAtualPorAno: self?.churnAnualPorAno ?? {},
    churnAtualPorAnoPorProduto: self?.churnAnualPorAnoPorProduto ?? {},
  };
}

/**
 * Crescimento dez/dez, por ano, dos demais cenários — pra tela oferecer "quero X% do que o
 * cenário Y entrega", em vez de a pessoa calcular a fórmula (1+cresc)×índice−1 na mão. Não usa
 * cenario_origem_id como referência: aquele campo é só a árvore de "clonado de", que troca de
 * cenário pra cenário sem relação nenhuma com "qual é o meu cenário-base pra comparar receita" —
 * ela escolhe explicitamente qual comparar.
 */
/** Inclui o PRÓPRIO cenário na lista — quem chama separa "self" dos "outros" depois. Assim o
 *  churn de hoje (baseline pra deslocar as fases) sai da mesma conta, sem duplicar a query. */
async function carregarTodosCenariosComCurvas(
  supabase: Supabase,
  cenarioId: string,
  anoIni: number,
  anoFim: number,
): Promise<CenarioReferencia[]> {
  const { data: cenarios } = await supabase.from("cenarios").select("id, nome").order("nome");
  const lista = cenarios ?? [];
  if (lista.length === 0) return [];

  // MRR só precisa do dezembro de cada ano (é o que define o crescimento dez/dez). Churn precisa
  // dos 12 meses — a régua da fase varia mês a mês, um só mês não representa o ano.
  const { data: simRaw } = await supabase
    .from("simulacao_mensal")
    .select("cenario_id, produto_id, mes_referencia, mrr, clientes_ativos, churn_pct")
    .in(
      "cenario_id",
      lista.map((c) => c.id),
    )
    .gte("mes_referencia", `${anoIni - 1}-01-01`)
    .lte("mes_referencia", `${anoFim}-12-01`);

  const mrrDez = new Map<string, number>();
  const mrrDezProduto = new Map<string, number>();
  const clientesDez = new Map<string, number>();
  const churnSoma = new Map<string, { soma: number; n: number }>();
  const churnSomaProduto = new Map<string, { soma: number; n: number }>();
  const acumChurn = (mapa: Map<string, { soma: number; n: number }>, chave: string, v: number) => {
    const atual = mapa.get(chave) ?? { soma: 0, n: 0 };
    mapa.set(chave, { soma: atual.soma + v, n: atual.n + 1 });
  };
  const acumChurnPeso = (mapa: Map<string, { soma: number; n: number }>, chave: string, v: number, peso: number) => {
    const atual = mapa.get(chave) ?? { soma: 0, n: 0 };
    mapa.set(chave, { soma: atual.soma + v * peso, n: atual.n + peso });
  };
  for (const s of simRaw ?? []) {
    const ano = s.mes_referencia.slice(0, 4);
    if (s.mes_referencia.slice(5, 7) === "12") {
      clientesDez.set(`${s.cenario_id}|${ano}`, (clientesDez.get(`${s.cenario_id}|${ano}`) ?? 0) + Number(s.clientes_ativos ?? 0));
      mrrDez.set(`${s.cenario_id}|${ano}`, (mrrDez.get(`${s.cenario_id}|${ano}`) ?? 0) + Number(s.mrr ?? 0));
      mrrDezProduto.set(
        `${s.cenario_id}|${s.produto_id}|${ano}`,
        (mrrDezProduto.get(`${s.cenario_id}|${s.produto_id}|${ano}`) ?? 0) + Number(s.mrr ?? 0),
      );
    }
    if (s.churn_pct != null) {
      const cli = Number(s.clientes_ativos ?? 0);
      // consolidado: peso = clientes ativos do produto no mês (mesma conta do card de Indicadores)
      if (cli > 0) acumChurnPeso(churnSoma, `${s.cenario_id}|${ano}`, Number(s.churn_pct), cli);
      // por produto: só os meses em que o produto tem cliente — antes do lançamento não há churn
      if (cli > 0) acumChurn(churnSomaProduto, `${s.cenario_id}|${s.produto_id}|${ano}`, Number(s.churn_pct));
    }
  }

  const produtoIds = [...new Set((simRaw ?? []).map((s) => s.produto_id))];

  return lista.map((c) => {
    const crescimentoPorAno: Record<number, number> = {};
    const crescimentoPorAnoPorProduto: Record<string, Record<number, number>> = {};
    const churnAnualPorAno: Record<number, number> = {};
    const churnAnualPorAnoPorProduto: Record<string, Record<number, number>> = {};
    const mrrDezPorAno: Record<number, number> = {};
    const clientesDezPorAno: Record<number, number> = {};
    const mrrDezPorAnoPorProduto: Record<string, Record<number, number>> = {};
    for (const pid of produtoIds) crescimentoPorAnoPorProduto[pid] = {};
    for (const pid of produtoIds) churnAnualPorAnoPorProduto[pid] = {};
    for (const pid of produtoIds) mrrDezPorAnoPorProduto[pid] = {};

    for (let a = anoIni; a <= anoFim; a++) {
      const antes = mrrDez.get(`${c.id}|${a - 1}`) ?? 0;
      const dez = mrrDez.get(`${c.id}|${a}`) ?? 0;
      // Só registra quando os DOIS pontos existem — sem isso, um ano fora do intervalo do cenário
      // de referência (ex.: pedir 2032 a um cenário que termina em 2030) virava um "-100%" falso
      // (dez=0 por falta de dado, não por queda real), e a trajetória estimada zerava a partir dali.
      if (antes > 0 && dez > 0) crescimentoPorAno[a] = dez / antes - 1;
      if (dez > 0) {
        mrrDezPorAno[a] = dez;
        clientesDezPorAno[a] = clientesDez.get(`${c.id}|${a}`) ?? 0;
      }

      for (const pid of produtoIds) {
        const antesP = mrrDezProduto.get(`${c.id}|${pid}|${a - 1}`) ?? 0;
        const dezP = mrrDezProduto.get(`${c.id}|${pid}|${a}`) ?? 0;
        if (antesP > 0 && dezP > 0) crescimentoPorAnoPorProduto[pid][a] = dezP / antesP - 1;
        if (dezP > 0) mrrDezPorAnoPorProduto[pid][a] = dezP;
      }

      const chAno = churnSoma.get(`${c.id}|${a}`);
      if (chAno && chAno.n > 0) churnAnualPorAno[a] = churnMensalParaAnual(chAno.soma / chAno.n);
      for (const pid of produtoIds) {
        const chP = churnSomaProduto.get(`${c.id}|${pid}|${a}`);
        if (chP && chP.n > 0) churnAnualPorAnoPorProduto[pid][a] = churnMensalParaAnual(chP.soma / chP.n);
      }
    }
    return {
      id: c.id, nome: c.nome,
      crescimentoPorAno, crescimentoPorAnoPorProduto, churnAnualPorAno, churnAnualPorAnoPorProduto,
      mrrDezPorAno, clientesDezPorAno, mrrDezPorAnoPorProduto,
    };
  });
}

