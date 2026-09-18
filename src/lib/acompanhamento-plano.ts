import { agregarPorCenario, type Agregado } from "@/lib/relatorios-cenario";
import { subgrupoDeConta } from "@/lib/subgrupo-conta";

/**
 * Acompanhamento do plano oficial: realizado × plano, mês a mês.
 *
 * O Base é o plano oficial da empresa e vai sendo substituído pelo realizado: mês FECHADO no Extrato
 * é realizado; daí em diante, plano. O plano é vigente (revisável a qualquer momento), mas mês passado
 * não muda — ao fechar o mês, o plano dele é guardado (plano_mensal_congelado) e o comparativo usa
 * esse número pra sempre.
 *
 * Os dois lados passam pela MESMA classificação de conta (subgrupoDeConta, a da simulação) — senão a
 * comparação compara grupos diferentes. Por isso as contas de Marca (2.4) entram em G&A aqui: é onde
 * o plano as coloca, já que a simulação não tem uma linha própria de Marca.
 */

export type Valores = { receita: number; impostos: number; cogs: number; sm: number; pd: number; ga: number; ebitda: number };

export const VAZIO: Valores = { receita: 0, impostos: 0, cogs: 0, sm: 0, pd: 0, ga: 0, ebitda: 0 };

export type StatusMes = "realizado" | "aberto" | "plano";

export type MesAcompanhamento = {
  mes: string; // AAAA-MM-01
  status: StatusMes;
  plano: Valores;
  /** Presente nos meses que já começaram (fechados ou em aberto). */
  real: Valores | null;
  /** O plano deste mês é o guardado no fechamento (não muda mais). */
  planoCongelado: boolean;
};

type DespesaReal = { data_gasto: string; valor_total: number; plano_contas: { codigo: string; tipo: string } | null };

/** Realizado por mês, classificado como a simulação classifica. Receita real ainda não existe (Vendas). */
export function realizadoPorMes(despesas: DespesaReal[]): Map<string, Valores> {
  const porMes = new Map<string, Valores>();
  for (const d of despesas) {
    if (!d.plano_contas) continue;
    const sub = subgrupoDeConta(d.plano_contas.codigo, d.plano_contas.tipo);
    if (sub === "outros") continue; // financeiro, ativo, capital: fora da DRE operacional
    const mes = `${d.data_gasto.slice(0, 7)}-01`;
    const v = porMes.get(mes) ?? { ...VAZIO };
    const valor = Number(d.valor_total);
    if (sub === "suporte" || sub === "infraestrutura" || sub === "outros_cogs") v.cogs += valor;
    else if (sub === "marketing" || sub === "vendas" || sub === "outros_sm") v.sm += valor;
    else if (sub === "pd") v.pd += valor;
    else v.ga += valor;
    porMes.set(mes, v);
  }
  for (const v of porMes.values()) v.ebitda = v.receita - v.impostos - v.cogs - v.sm - v.pd - v.ga;
  return porMes;
}

/** O plano de um mês a partir da linha agregada da simulação. */
export function valoresDoPlano(l: Agregado | undefined): Valores {
  if (!l) return { ...VAZIO };
  return {
    receita: l.receita,
    impostos: l.impostoMensal,
    cogs: l.cogs,
    sm: l.smMarketing + l.smVendas + l.smOutros,
    pd: l.opexPd,
    ga: l.opexGa,
    ebitda: l.ebitda,
  };
}

const proximoMes = (iso: string) => {
  const [a, m] = iso.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
};

/**
 * Monta os meses do período: fechado → realizado × plano guardado (ou o vigente, se não houver
 * registro); já começou mas não fechou → "em aberto" (realizado parcial × plano vigente); futuro →
 * só plano.
 */
export function montarAcompanhamento(opts: {
  inicio: string;
  fim: string;
  mesAtual: string;
  fechados: Set<string>;
  planoVigente: Map<string, Valores>;
  planoCongelado: Map<string, Valores>;
  realizado: Map<string, Valores>;
}): MesAcompanhamento[] {
  const saida: MesAcompanhamento[] = [];
  for (let mes = opts.inicio; mes <= opts.fim; mes = proximoMes(mes)) {
    const fechado = opts.fechados.has(mes);
    const congelado = fechado ? opts.planoCongelado.get(mes) : undefined;
    const status: StatusMes = fechado ? "realizado" : mes <= opts.mesAtual ? "aberto" : "plano";
    saida.push({
      mes,
      status,
      plano: congelado ?? opts.planoVigente.get(mes) ?? { ...VAZIO },
      real: status === "plano" ? null : (opts.realizado.get(mes) ?? { ...VAZIO }),
      planoCongelado: !!congelado,
    });
  }
  return saida;
}

/** O mês seguinte ao último fechado — onde o plano "começa" hoje. Sem mês fechado, o mês que vem. */
export function mesSeguinteAoFechado(fechados: string[], hojeIso: string): string {
  const ultimo = [...fechados].sort().at(-1);
  return proximoMes(ultimo ?? `${hojeIso.slice(0, 7)}-01`);
}

export const somar = (lista: Valores[]): Valores =>
  lista.reduce(
    (s, v) => ({
      receita: s.receita + v.receita,
      impostos: s.impostos + v.impostos,
      cogs: s.cogs + v.cogs,
      sm: s.sm + v.sm,
      pd: s.pd + v.pd,
      ga: s.ga + v.ga,
      ebitda: s.ebitda + v.ebitda,
    }),
    { ...VAZIO },
  );

// ── Com banco ─────────────────────────────────────────────────────────────────────────────────

/**
 * Guarda o plano do Base para o mês que acabou de ser fechado. Não sobrescreve: se o mês já tinha
 * plano guardado (fechou, reabriu e fechou de novo), vale o primeiro — mês passado não muda.
 */
export async function congelarPlanoDoMes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  mesIso: string,
  usuarioId: string | null,
): Promise<void> {
  const { data: base } = await supabase.from("cenarios").select("id").eq("is_base", true).maybeSingle();
  if (!base) return;
  const resumo = await agregarPorCenario(supabase, base.id);
  const linha = resumo.linhas.find((l: Agregado) => l.mes_referencia === mesIso);
  const v = valoresDoPlano(linha);
  await supabase.from("plano_mensal_congelado").upsert(
    {
      cenario_id: base.id,
      mes: mesIso,
      ...v,
      clientes: linha?.clientes ?? 0,
      novos_clientes: linha?.novosClientes ?? 0,
      congelado_por: usuarioId,
    },
    { onConflict: "cenario_id,mes", ignoreDuplicates: true },
  );
}

/** Tudo o que a tela de acompanhamento precisa, para um cenário (o Base, em Relatórios). */
export async function carregarAcompanhamento(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cenarioId: string,
  hojeIso: string,
): Promise<{ meses: MesAcompanhamento[]; ultimoFechado: string | null; inicio: string; fim: string }> {
  const [{ data: cenario }, resumo, { data: fechadosRaw }, { data: congeladosRaw }, { data: despesas }] = await Promise.all([
    supabase.from("cenarios").select("data_inicio, data_fim").eq("id", cenarioId).single(),
    agregarPorCenario(supabase, cenarioId),
    supabase.from("meses_fechados").select("mes"),
    supabase.from("plano_mensal_congelado").select("*").eq("cenario_id", cenarioId),
    supabase.from("despesas").select("data_gasto, valor_total, plano_contas:plano_contas_id(codigo, tipo)"),
  ]);
  const fechados = ((fechadosRaw ?? []) as { mes: string }[]).map((f) => `${f.mes.slice(0, 7)}-01`);
  const planoVigente = new Map<string, Valores>(
    (resumo.linhas as Agregado[]).map((l) => [l.mes_referencia, valoresDoPlano(l)]),
  );
  const planoCongelado = new Map<string, Valores>(
    ((congeladosRaw ?? []) as (Valores & { mes: string })[]).map((c) => [
      `${c.mes.slice(0, 7)}-01`,
      {
        receita: Number(c.receita),
        impostos: Number(c.impostos),
        cogs: Number(c.cogs),
        sm: Number(c.sm),
        pd: Number(c.pd),
        ga: Number(c.ga),
        ebitda: Number(c.ebitda),
      },
    ]),
  );
  const inicio = `${String(cenario?.data_inicio ?? hojeIso).slice(0, 7)}-01`;
  const fim = `${String(cenario?.data_fim ?? hojeIso).slice(0, 7)}-01`;
  const meses = montarAcompanhamento({
    inicio,
    fim,
    mesAtual: `${hojeIso.slice(0, 7)}-01`,
    fechados: new Set(fechados),
    planoVigente,
    planoCongelado,
    realizado: realizadoPorMes((despesas ?? []) as DespesaReal[]),
  });
  return { meses, ultimoFechado: [...fechados].sort().at(-1) ?? null, inicio, fim };
}
