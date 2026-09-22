import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  calcularDemandaPorCargo,
  type CanalFunilInput,
  type FaseProdutoInput,
  type FunilPremissaInput,
  type SimulacaoMesInput,
  cargoChave,
} from "@/lib/necessidade-contratacao";
import type { FaseValue } from "@/lib/fases";
import { NecessidadeTabelas } from "./necessidade-tabelas";
import type { PassoRoteiro } from "./roteiro-canal-direto";
import { horasAtendimentoPorProduto, horasCsProativoPorProduto } from "@/lib/cogs";
import { PremissasVendas, type PremissaVendasProduto } from "./premissas-vendas";

export default async function NecessidadeContratacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string; cargo?: string }>;
}) {
  const { cenario, cargo: cargoParam } = await searchParams;
  // Atalhos vindos do Plano de Custos abrem direto na aba do cargo (S&M -> SDR, COGS -> Suporte).
  const cargoInicial = (["sdr", "vendedor", "coordenador", "suporte", "cs"] as const).find((c) => c === cargoParam) ?? "sdr";
  const supabase = await createClient();

  const { data: cenarios } = await supabase.from("cenarios").select("id, nome, is_base").order("created_at");
  const cenarioAtual = cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";

  if (!cenarioAtual) {
    return (
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Necessidade de Contratação</h1>
        <p className="mt-2 text-[13px] text-text-muted">Crie um cenário primeiro.</p>
      </div>
    );
  }

  const { data: fasesRaw } = await supabase
    .from("fases_produto")
    .select("id, produto_id, fase, data_inicio, data_fim")
    .eq("cenario_id", cenarioAtual);

  const faseIds = (fasesRaw ?? []).map((f) => f.id);
  const faseById = new Map((fasesRaw ?? []).map((f) => [f.id, f]));

  const [{ data: funisRaw }, { data: simulacaoRaw }, { data: modelos }, { data: alocacoes }] = await Promise.all([
    faseIds.length > 0
      ? supabase
          .from("premissas_funil")
          .select("fase_produto_id, capacidade_vendedor_mes, span_of_control, horas_suporte_por_cliente_mes, reunioes_por_oportunidade")
          .in("fase_produto_id", faseIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("simulacao_mensal")
      .select("produto_id, mes_referencia, novos_clientes, clientes_ativos, receita_bruta, novos_direto, novos_representante, novos_associacao, novos_acoes, cogs_suporte_reativo, cogs_cs_proativo")
      .eq("cenario_id", cenarioAtual),
    supabase.from("modelos_contratacao").select("*").order("cargo"),
    supabase.from("alocacao_modelo_contratacao").select("*").eq("cenario_id", cenarioAtual),
  ]);

  // Tabela de custo/hora por perfil (cargo × CLT/PJ × senioridade) — é dela que sai o custo do
  // Suporte e do CS na regra de COGS, e é ela que a tela oferece pra comparar PJ e CLT.
  const { data: perfisHora } = await supabase
    .from("tabela_custo_hora")
    .select("cargo, tipo_contratacao, senioridade, valor_hora")
    .order("cargo");

  const fasesPorProduto: FaseProdutoInput[] = (fasesRaw ?? []).map((f) => ({
    produtoId: f.produto_id,
    fase: f.fase as FaseValue,
    data_inicio: f.data_inicio,
    data_fim: f.data_fim,
  }));

  const funis: FunilPremissaInput[] = (funisRaw ?? [])
    .map((f) => {
      const fase = faseById.get(f.fase_produto_id);
      if (!fase) return null;
      return {
        produtoId: fase.produto_id,
        fase: fase.fase as FaseValue,
        capacidade_vendedor_mes: f.capacidade_vendedor_mes,
        span_of_control: f.span_of_control,
        reunioes_por_oportunidade: f.reunioes_por_oportunidade,
        horas_suporte_por_cliente_mes: f.horas_suporte_por_cliente_mes,
      };
    })
    .filter((f): f is FunilPremissaInput => f !== null);

  const simulacao: SimulacaoMesInput[] = (simulacaoRaw ?? []).map((s) => ({
    produtoId: s.produto_id,
    mes_referencia: s.mes_referencia,
    novos_clientes: Number(s.novos_clientes),
    clientes_ativos: Number(s.clientes_ativos),
    novos_direto: s.novos_direto != null ? Number(s.novos_direto) : undefined,
    novos_representante: s.novos_representante != null ? Number(s.novos_representante) : undefined,
    novos_associacao: s.novos_associacao != null ? Number(s.novos_associacao) : undefined,
    novos_acoes: s.novos_acoes != null ? Number(s.novos_acoes) : undefined,
  }));

  const { data: canaisRaw } = await supabase
    .from("canais_aquisicao")
    .select("id, tipo_canal, modelo_contratacao_id, canal_produto(produto_id, percentual_mix, taxa_fechamento)")
    .eq("cenario_id", cenarioAtual);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualificacaoPorModelo = new Map((modelos ?? []).map((m) => [m.id, (m.parametros as any)?.taxa_qualificacao ?? null]));
  const canais: CanalFunilInput[] = (canaisRaw ?? []).flatMap((c) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((c.canal_produto ?? []) as any[]).map((cp) => ({
      produtoId: cp.produto_id,
      tipo_canal: c.tipo_canal as CanalFunilInput["tipo_canal"],
      percentual_mix: Number(cp.percentual_mix),
      taxa_fechamento: cp.taxa_fechamento,
      taxa_qualificacao: c.modelo_contratacao_id ? (qualificacaoPorModelo.get(c.modelo_contratacao_id) ?? null) : null,
    })),
  );

  const { data: cogsRaw } = await supabase.from("cogs_premissas").select("produto_id, parametros").eq("cenario_id", cenarioAtual);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const horasSuportePorProduto = horasAtendimentoPorProduto((cogsRaw ?? []) as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const horasCsPorProduto = horasCsProativoPorProduto((cogsRaw ?? []) as any);
  const demanda = calcularDemandaPorCargo({ fasesPorProduto, funis, canais, simulacao, horasSuportePorProduto, horasCsPorProduto });
  // Receita média por cliente, por mês e produto — base da comissão % na comparação de vendedor.
  const arpuPorProdutoMes: Record<string, Record<string, number>> = {};
  for (const s of simulacaoRaw ?? []) {
    const clientes = Number(s.clientes_ativos ?? 0);
    if (clientes <= 0) continue;
    (arpuPorProdutoMes[s.mes_referencia] ??= {})[s.produto_id] = Number(s.receita_bruta ?? 0) / clientes;
  }

  // Premissas do time de vendas por produto (lê a primeira fase com valor; grava em todas).
  const { data: produtosRaw } = await supabase.from("produtos").select("id, nome").order("nome");
  const premissasVendas: PremissaVendasProduto[] = (produtosRaw ?? []).map((p) => {
    const f = funis.find((x) => x.produtoId === p.id && x.capacidade_vendedor_mes != null) ?? funis.find((x) => x.produtoId === p.id);
    return {
      produto_id: p.id,
      nome: p.nome,
      capacidade_vendedor_mes: f?.capacidade_vendedor_mes ?? null,
      reunioes_por_oportunidade: f?.reunioes_por_oportunidade ?? null,
      span_of_control: f?.span_of_control ?? null,
    };
  });

  // O que faz o SDR virar custo é a ALOCAÇÃO — o custo e as ligações saem do modelo alocado, não
  // do vínculo em Canais de Aquisição (aquele campo só diz quem prospecta; nenhum número lê ele).
  // Checar o vínculo aqui fazia a tela acusar "falta a taxa de qualificação" com a taxa preenchida.
  const modelosSdr = (modelos ?? []).filter((m) => cargoChave(m.cargo) === "sdr");
  const alocacoesSdr = (alocacoes ?? []).filter((a) => cargoChave(a.cargo) === "sdr");
  const modelosEmUso = alocacoesSdr
    .map((a) => modelosSdr.find((m) => m.id === a.modelo_id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const temTaxa = (m: any) => m?.parametros?.taxa_qualificacao != null || m?.parametros?.taxa_qualificacao_estimada != null;
  const temQualificacao = (modelosEmUso.length > 0 ? modelosEmUso : modelosSdr).some(temTaxa);
  const temAlocacao = alocacoesSdr.length > 0;

  const passosCanalDireto: PassoRoteiro[] = [
    {
      titulo: "Cadastrar o modelo que faz a prospecção",
      explicacao:
        "Em Modelos de Contratação, crie (ou edite) o modelo de SDR — CLT, PJ, agência ou IA — e preencha a taxa de qualificação lead → reunião. É ela que diz quantas ligações custa cada reunião agendada.",
      feito: temQualificacao,
      href: "/contratacoes/modelos",
      linkLabel: "Modelos de Contratação",
    },
    {
      titulo: "Alocar o modelo por um período",
      explicacao:
        "Aqui embaixo, na aba SDR, use \u201c+ Alocar\u201d informando quantidade e datas. É esse lançamento que vira custo mensal e entra no CAC — o modelo cadastrado sozinho não gera despesa nenhuma.",
      feito: temAlocacao,
      href: "/contratacoes/necessidade",
      linkLabel: "Rolar até a tabela de SDR",
    },
  ];

  // Suporte e CS são pagos pela regra de COGS enquanto não houver alocação — sem mostrar esse
  // valor, a tabela parece dizer que o mês não custa nada.
  const custoRegraPorMes: Record<string, Record<string, { suporte: number; cs: number }>> = {};
  for (const r of simulacaoRaw ?? []) {
    const doMes = (custoRegraPorMes[r.mes_referencia] ??= {});
    doMes[r.produto_id] = {
      suporte: Number((r as Record<string, unknown>).cogs_suporte_reativo ?? 0),
      cs: Number((r as Record<string, unknown>).cogs_cs_proativo ?? 0),
    };
  }

  const semDados = demanda.sdr.length === 0 && demanda.coordenador.length === 0 && demanda.suporte.length === 0 && demanda.cs.length === 0;

  return (
    <div>
      <div className="mb-2">
        <Link href="/contratacoes" className="text-[12.5px] text-text-muted">
          ← Contratações
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Necessidade de Contratação</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Demanda de SDR, Coordenador e Suporte derivada das premissas de funil (em{" "}
            <Link href="/produtos" className="text-primary-deep underline">
              Produtos
            </Link>
            , dentro de cada fase) e do crescimento de clientes já calculado — compare o custo de cada{" "}
            <Link href="/contratacoes/modelos" className="text-primary-deep underline">
              modelo de contratação
            </Link>{" "}
            pra cobrir essa demanda
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <select name="cenario" defaultValue={cenarioAtual} className="input">
            {(cenarios ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
            Filtrar
          </button>
        </form>
      </div>

      {/* O roteiro é do canal DIRETO (SDR) — desceu pra dentro daquela aba. No topo, ele aparecia
          pra quem tinha vindo ver Suporte ou Vendedor e falava de outro cargo. */}
      <div className="mb-4 flex flex-col gap-3">
        <PremissasVendas cenarioId={cenarioAtual} produtos={premissasVendas} />
      </div>

      {/* As abas e o formulário de alocação aparecem SEMPRE. Esconder tudo quando não há demanda
          calculada deixava a pessoa sem caminho pra escolher o modelo — cada aba já mostra seu
          próprio aviso de "sem demanda" no lugar da tabela. */}
      {semDados && (
        <div className="mb-4 rounded-lg border border-dashed border-border bg-surface px-4 py-3 text-[12px] text-text-muted">
          Nenhuma demanda calculada ainda para este cenário — confira as premissas de Funil em Produtos e recalcule a
          projeção. Você já pode registrar as alocações abaixo; elas passam a gerar custo assim que a demanda existir.
        </div>
      )}
      <NecessidadeTabelas
        cenarioId={cenarioAtual}
        porProduto={demanda.porProduto}
        arpuPorProdutoMes={arpuPorProdutoMes}
        produtos={(produtosRaw ?? []).filter((p) => fasesPorProduto.some((f) => f.produtoId === p.id))}
        modelos={modelos ?? []}
        alocacoes={alocacoes ?? []}
        perfisHora={(perfisHora ?? []).map((t) => ({ ...t, valor_hora: Number(t.valor_hora) }))}
        custoRegraPorMes={custoRegraPorMes}
        cargoInicial={cargoInicial}
        passosCanalDireto={passosCanalDireto}
      />
    </div>
  );
}
