import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarTaxasVigentes } from "@/lib/taxas-pagamento";
import type { BasesDoPlano, Bloco, Modulo, ParametrosPrecificacao } from "@/lib/precificacao";

/**
 * Bases que a proposta lê do Gestão (uma fonte só): catálogo, parâmetros, taxas vigentes e, do
 * cenário Base no mês da proposta, custo fixo de infraestrutura, clientes previstos, custo da hora
 * de suporte e o pacote de implantação (etapas × horas × R$/h). Nada de preço digitado.
 */
export type BasesProposta = {
  modulos: Modulo[];
  blocos: Bloco[];
  params: ParametrosPrecificacao;
  bases: BasesDoPlano;
  /** nome do cenário usado (deve ser o Base) e o mês de referência AAAA-MM */
  cenario: { id: string; nome: string } | null;
  mes: string;
  avisos: string[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export async function carregarBasesProposta(supabase: Db, mesIso = new Date().toISOString().slice(0, 7)): Promise<BasesProposta> {
  const avisos: string[] = [];
  const mes01 = `${mesIso}-01`;
  const [{ data: modulosRaw }, { data: blocosRaw }, { data: paramsRaw }, { data: cenarioBase }, taxas] = await Promise.all([
    supabase.from("catalogo_modulos").select("*").order("ordem"),
    supabase.from("catalogo_blocos").select("*").order("ordem"),
    supabase.from("parametros_precificacao").select("valor").eq("id", 1).maybeSingle(),
    supabase.from("cenarios").select("id, nome").eq("is_base", true).maybeSingle(),
    carregarTaxasVigentes(supabase, `${mesIso}-01`),
  ]);
  const params = (paramsRaw?.valor ?? {}) as ParametrosPrecificacao;
  if (!paramsRaw) avisos.push("Parâmetros de precificação não cadastrados.");
  if (taxas.length === 0) avisos.push("Nenhuma taxa de meio de pagamento vigente (Configurações).");

  let custo_fixo_infra_mes = 0, clientes_previstos_mes = 0, custo_implantacao_padrao = 0, horas_implantacao_padrao = 0;
  if (cenarioBase) {
    const [{ data: fases }, { data: sim }, { data: etapas }] = await Promise.all([
      supabase.from("fases_produto").select("id, produto_id, fase, data_inicio, data_fim").eq("cenario_id", cenarioBase.id),
      supabase.from("simulacao_mensal").select("clientes_ativos").eq("cenario_id", cenarioBase.id).eq("mes_referencia", mes01),
      supabase.from("implementacao_etapas").select("horas, valor_hora").eq("cenario_id", cenarioBase.id),
    ]);
    // Fase vigente de cada produto no mês → custos fixos de infraestrutura (conta 1.1.1) dessas fases
    const vigentes = ((fases ?? []) as { id: string; data_inicio: string | null; data_fim: string | null }[]).filter(
      (f) => (!f.data_inicio || f.data_inicio <= mes01) && (!f.data_fim || f.data_fim >= mes01),
    );
    if (vigentes.length > 0) {
      const { data: fixos } = await supabase
        .from("plano_custos_fixos")
        .select("quantidade, valor_unitario, plano_contas:plano_contas_id(codigo)")
        .in("fase_produto_id", vigentes.map((f) => f.id));
      for (const c of (fixos ?? []) as { quantidade: number; valor_unitario: number; plano_contas: { codigo: string } | { codigo: string }[] | null }[]) {
        const pc = Array.isArray(c.plano_contas) ? c.plano_contas[0] : c.plano_contas;
        if (pc?.codigo?.startsWith("1.1.1")) custo_fixo_infra_mes += Number(c.quantidade) * Number(c.valor_unitario);
      }
    }
    clientes_previstos_mes = ((sim ?? []) as { clientes_ativos: number }[]).reduce((s, r) => s + Number(r.clientes_ativos ?? 0), 0);
    for (const e of (etapas ?? []) as { horas: number; valor_hora: number }[]) {
      horas_implantacao_padrao += Number(e.horas);
      custo_implantacao_padrao += Number(e.horas) * Number(e.valor_hora);
    }
    if (horas_implantacao_padrao === 0) avisos.push("O cenário Base não tem etapas de implantação cadastradas (Produtos → implantação).");
  } else {
    avisos.push("Nenhum cenário marcado como Base.");
  }

  // Custo da hora do cargo de suporte (média do negócio)
  let custo_hora_suporte = 0;
  if (params.suporte) {
    const { data: hora } = await supabase
      .from("tabela_custo_hora")
      .select("valor_hora")
      .eq("cargo", params.suporte.cargo)
      .eq("tipo_contratacao", params.suporte.tipo_contratacao)
      .eq("senioridade", params.suporte.senioridade)
      .maybeSingle();
    custo_hora_suporte = Number(hora?.valor_hora ?? 0);
    if (!hora) avisos.push(`Sem custo da hora para ${params.suporte.cargo} (${params.suporte.senioridade}, ${params.suporte.tipo_contratacao}) na tabela de custo/hora.`);
  }

  const aliquota_imposto = params.imposto?.aliquota_fixa ?? 0.06;

  return {
    modulos: ((modulosRaw ?? []) as Modulo[]),
    blocos: ((blocosRaw ?? []) as Bloco[]).map((b) => ({ ...b, peso_pct: Number(b.peso_pct), adesao_pct: Number(b.adesao_pct), custo_processamento_mes: Number(b.custo_processamento_mes ?? 0), regra_perfil: (b.regra_perfil ?? {}) as Bloco["regra_perfil"] })),
    params,
    bases: { custo_fixo_infra_mes, clientes_previstos_mes, custo_hora_suporte, custo_implantacao_padrao, horas_implantacao_padrao, aliquota_imposto, taxas },
    cenario: cenarioBase ? { id: cenarioBase.id, nome: cenarioBase.nome } : null,
    mes: mesIso,
    avisos,
  };
}

// ── Projeção de clientes a partir das curvas de crescimento (etapa 3/4) ──────────────────────────
import { projetarPlataforma, type FaseCrescimento } from "@/lib/projecao-clientes";

/** Clientes ativos previstos na plataforma ao fim do mês informado (padrão: 12 = 1º ano). */
export async function carregarClientesProjetados(supabase: Db, mesAlvo = 12): Promise<number> {
  const [{ data: mods }, { data: params }] = await Promise.all([
    supabase.from("catalogo_modulos").select("codigo, nome, crescimento, data_inicio_testes").eq("ativo", true).order("ordem"),
    supabase.from("parametros_precificacao").select("valor").eq("id", 1).maybeSingle(),
  ]);
  const padrao = ((params?.valor as { crescimento_padrao?: FaseCrescimento[] } | null)?.crescimento_padrao ?? []);
  const linhas = ((mods ?? []) as { codigo: string; nome: string; crescimento: FaseCrescimento[] | null; data_inicio_testes: string | null }[]);
  const datas = linhas.map((m) => m.data_inicio_testes).filter(Boolean) as string[];
  const base = datas.length ? datas.sort()[0] : null;
  const offset = (d: string | null) => {
    if (!base || !d) return 0;
    const a = new Date(base), b = new Date(d);
    return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
  };
  const horizonte = Math.max(mesAlvo, 12);
  const { total } = projetarPlataforma(
    linhas.map((m) => ({ codigo: m.codigo, nome: m.nome, fases: (m.crescimento && m.crescimento.length ? m.crescimento : padrao), offsetMes: offset(m.data_inicio_testes) })),
    horizonte,
  );
  return total[Math.min(horizonte - 1, mesAlvo - 1)] ?? 0;
}
