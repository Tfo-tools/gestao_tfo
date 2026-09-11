import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { agregarPorCenario, computeMetricas } from "@/lib/relatorios-cenario";
import { MetasHeader } from "../../metas-header";
import { CATEGORIAS_LANCAMENTO, categoriaDeConta, labelCategoriaNegocio } from "@/lib/categoria-negocio";
import type { CustoDerivado } from "./custos-derivados";
import { CogsPremissasForm, type ProdutoCogs, type PerfilHora } from "./cogs-premissas-form";
import { TabelaCustos, type LinhaCustos } from "./tabela-custos";
import { CustosCategoriaCard, type CustoFixoRow, type CustoVariavelRow } from "./custos-categoria-card";
import { AvisoTelaGrande } from "@/components/aviso-tela-grande";
import { FeirasEventos, type ProdutoPlanos } from "./feiras-eventos";
import type { AcaoMarketing } from "@/lib/acoes-marketing";

// Salvar uma feira/evento recalcula a projeção de todos os produtos — leva alguns segundos.
export const maxDuration = 60;

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Categorias onde faz sentido comparar os produtos lado a lado (custo varia por produto ou é
// compartilhado entre eles). O resto (taxas, estrutura, viagem, prestadores, imprensa, financeiro)
// é custo de empresa mesmo — continua na lista simples de sempre.
const CATEGORIAS_MATRIZ = new Set(["csp", "marketing", "vendas", "desenvolvimento", "marca"]);

export default async function PlanoCustosPage({ params }: { params: Promise<{ cenarioId: string }> }) {
  const { cenarioId } = await params;
  const supabase = await createClient();

  const [{ data: cenario }, { data: produtos }, { data: planoContas }] = await Promise.all([
    supabase
      .from("cenarios")
      .select("id, nome, data_inicio, data_fim, meta_receita_mensal, meta_cac, meta_ltv, meta_roi_pct, meta_tir_pct")
      .eq("id", cenarioId)
      .single(),
    supabase.from("produtos").select("id, nome").order("nome"),
    supabase.from("plano_contas").select("id, codigo, conta, tipo").in("tipo", ["cogs", "opex", "financeiro"]).order("codigo"),
  ]);
  if (!cenario) notFound();

  const resumo = await agregarPorCenario(supabase, cenarioId);
  // Tudo nesta tela fala do período do cenário — o que a simulação calcula antes do início é
  // preparação, não entra nos indicadores nem nos totais apresentados.
  const metricas = computeMetricas(resumo.linhasPeriodo, resumo.totalInvestido, resumo.aportes.capitalNovoPorMes);
  const ultimaLinha = resumo.linhasPeriodo[resumo.linhasPeriodo.length - 1];

  const [{ data: fixosRaw }, { data: variaveisRaw }, { data: custosEmpresaRaw }] = await Promise.all([
    supabase
      .from("plano_custos_fixos")
      .select(
        "id, item, quantidade, valor_unitario, plano_contas_id, plano_contas:plano_contas_id(codigo, conta), fase_produto_id, fases_produto!inner(produto_id, fase, cenario_id, produtos:produto_id(nome))",
      )
      .eq("fases_produto.cenario_id", cenarioId),
    supabase
      .from("plano_custos_variaveis")
      .select(
        "id, item, tipo_calculo, valor_base, percentual, valor_por_unidade, plano_contas_id, plano_contas:plano_contas_id(codigo, conta), fase_produto_id, fases_produto!inner(produto_id, fase, cenario_id, produtos:produto_id(nome))",
      )
      .eq("fases_produto.cenario_id", cenarioId),
    supabase
      .from("custos_empresa")
      .select("id, item, valor_mensal, tipo_custo, parametros, data_inicio, data_fim, plano_contas_id, plano_contas:plano_contas_id(codigo, conta)")
      .eq("cenario_id", cenarioId),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fixos = (fixosRaw ?? []) as any as CustoFixoRow[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variaveis = (variaveisRaw ?? []) as any as CustoVariavelRow[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const custosEmpresa = (custosEmpresaRaw ?? []) as any[];

  // Clientes ativos por produto no mês mais recente da simulação — usado só pro rateio automático
  // de custos compartilhados (não muda nenhum total do DRE, é só a régua de divisão exibida).
  const { data: simRowsTodas } = await supabase
    .from("simulacao_mensal")
    .select("produto_id, mes_referencia, clientes_ativos, receita_bruta, sm_vendas, cogs_outros, cogs_infraestrutura, cogs_suporte, cogs_llm, cogs_software, cogs_gateway, cogs_cs_proativo, cogs_suporte_reativo, novos_representante, novos_associacao")
    .eq("cenario_id", cenarioId)
    .order("mes_referencia", { ascending: false });
  const dentroDoPeriodo = (mes: string) =>
    (!cenario.data_inicio || mes >= cenario.data_inicio) && (!cenario.data_fim || mes <= cenario.data_fim);
  const simRows = (simRowsTodas ?? []).filter((r) => dentroDoPeriodo(r.mes_referencia));
  const clientesPorProduto: Record<string, number> = {};
  const receitaPorProduto: Record<string, number> = {};
  for (const row of simRows ?? []) {
    if (clientesPorProduto[row.produto_id] === undefined) {
      clientesPorProduto[row.produto_id] = Number(row.clientes_ativos ?? 0);
      receitaPorProduto[row.produto_id] = Number(row.receita_bruta ?? 0);
    }
  }

  // Custos que o motor deriva e que não vivem em nenhuma das tabelas lidas acima. Sem mostrá-los,
  // a tela aparenta zero enquanto o CAC do topo já os está contando.
  const somaSim = (campo: "sm_vendas" | "cogs_outros" | "novos_representante" | "novos_associacao") =>
    (simRows ?? []).reduce((s, r) => s + Number((r as Record<string, unknown>)[campo] ?? 0), 0);

  // Premissas de COGS por produto + perfis de custo/hora + níveis (pro seletor do LLM).
  const [{ data: cogsRaw }, { data: perfisRaw }, { data: modulosRaw }, { data: planosRaw }, { data: acoesRaw }, { data: produtosCenario }] = await Promise.all([
    supabase.from("cogs_premissas").select("produto_id, parametros").eq("cenario_id", cenarioId),
    supabase.from("tabela_custo_hora").select("cargo, tipo_contratacao, senioridade, valor_hora").order("cargo"),
    // Só os níveis deste cenário — sem o filtro, cada cenário espelhado repetia os níveis na lista.
    supabase.from("modulos_produto").select("produto_id, nome, preco").eq("cenario_id", cenarioId).order("data_disponibilidade"),
    supabase.from("planos_precificacao").select("produto_id, nome_plano, tipo_cobranca, preco").eq("cenario_id", cenarioId),
    supabase.from("acoes_marketing").select("*").eq("cenario_id", cenarioId).order("created_at"),
    supabase.from("produtos").select("id, nome").or(`cenario_id.is.null,cenario_id.eq.${cenarioId}`).order("nome"),
  ]);
  const produtosPlanos: ProdutoPlanos[] = (produtosCenario ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    planos: (planosRaw ?? [])
      .filter((pl) => pl.produto_id === p.id)
      .map((pl) => ({ nome: pl.nome_plano ?? pl.tipo_cobranca, preco: Number(pl.preco) })),
    niveis: (modulosRaw ?? []).filter((m) => m.produto_id === p.id).map((m) => ({ nome: m.nome, preco: Number(m.preco) })),
  }));
  const somaSimProduto = (produtoId: string, campo: string) =>
    (simRows ?? []).filter((r) => r.produto_id === produtoId).reduce((s, r) => s + Number((r as Record<string, unknown>)[campo] ?? 0), 0);
  const produtosCogs: ProdutoCogs[] = (produtos ?? []).map((p) => {
    const llm = somaSimProduto(p.id, "cogs_llm");
    const software = somaSimProduto(p.id, "cogs_software");
    const gateway = somaSimProduto(p.id, "cogs_gateway");
    return {
      id: p.id,
      nome: p.nome,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      premissas: ((cogsRaw ?? []).find((c) => c.produto_id === p.id)?.parametros as any) ?? {},
      niveis: (modulosRaw ?? []).filter((m) => m.produto_id === p.id).map((m) => m.nome),
      totais: {
        infra: somaSimProduto(p.id, "cogs_infraestrutura"),
        llm,
        suporte: somaSimProduto(p.id, "cogs_suporte_reativo"),
        cs: somaSimProduto(p.id, "cogs_cs_proativo"),
        software,
        gateway,
        // cogs_outros junta implementação + LLM + software + gateway; o que sobra é a implementação.
        implementacao: Math.max(0, somaSimProduto(p.id, "cogs_outros") - llm - software - gateway),
      },
    };
  });
  const perfisHora: PerfilHora[] = (perfisRaw ?? []).map((t) => ({ ...t, valor_hora: Number(t.valor_hora) }));

  const custoCanais = somaSim("sm_vendas");
  const novosRepres = somaSim("novos_representante");
  const novosAssoc = somaSim("novos_associacao");

  const somaResumo = (campo: keyof (typeof resumo.linhas)[number]) => resumo.linhasPeriodo.reduce((s, l) => s + Number(l[campo] ?? 0), 0);
  const alocComercial = somaResumo("alocacaoSdr") + somaResumo("alocacaoVendedor") + somaResumo("alocacaoCoordenador");
  const alocSuporte = somaResumo("alocacaoSuporte");

  const derivados: CustoDerivado[] = [
    {
      categoria: "vendas",
      rotulo: "Equipe comercial alocada",
      grupo: "S&M — Vendas",
      total: alocComercial,
      detalhe: `SDR ${formatBRL(somaResumo("alocacaoSdr"))} · vendedor ${formatBRL(somaResumo("alocacaoVendedor"))} · coordenador ${formatBRL(somaResumo("alocacaoCoordenador"))} — custo dos modelos alocados em Necessidade de Contratação, mês a mês pela demanda.`,
      href: "/contratacoes/necessidade?cenario={cenarioId}&cargo=sdr",
      ondeEditar: "Necessidade de Contratação",
    },
    {
      categoria: "csp",
      rotulo: "Suporte alocado",
      grupo: "COGS — 1.1.3",
      total: alocSuporte,
      detalhe: "Custo do modelo de suporte alocado em Necessidade de Contratação, pelas horas que a base exige em cada mês.",
      href: "/contratacoes/necessidade?cenario={cenarioId}&cargo=suporte",
      ondeEditar: "Necessidade de Contratação",
    },
    {
      categoria: "vendas",
      rotulo: "Aquisição via parceiros",
      grupo: "S&M — Vendas",
      total: custoCanais,
      detalhe: `Comissão, valor fixo de fechamento e crédito ao parceiro — ${Math.round(novosRepres)} clientes por representantes e ${Math.round(novosAssoc)} por associações no período.`,
      href: "/plano/{cenarioId}/vendas",
      ondeEditar: "Canais de Aquisição",
    },
    {
      categoria: "taxas",
      rotulo: "Filiação a associações",
      grupo: "G&A — Taxas (2.3.5.1) · fora do CAC",
      total: resumo.linhasPeriodo.reduce((acc, l) => acc + l.gaTaxasFiliacao, 0),
      detalhe: "Mensalidade por associação filiada × parceiros ativos no mês. É custo de estrutura, não de aquisição — por isso não entra no CAC.",
      href: "/plano/{cenarioId}/vendas",
      ondeEditar: "Canais de Aquisição",
    },
  ];

  // Onde o custo de PESSOAS de cada grupo é configurado: não é lançamento manual, é dimensionamento
  // pela demanda (reuniões, clientes) em Necessidade de Contratação — cada card aponta pra sua aba.
  const atalhosPorCategoria: Record<string, { label: string; descricao: string; href: string }[]> = {
    vendas: [
      {
        label: "Equipe comercial: SDR e vendedor",
        descricao: "Quantas reuniões a meta exige, o custo de cada modelo de contratação e a alocação escolhida por período.",
        href: `/contratacoes/necessidade?cenario=${cenarioId}&cargo=sdr`,
      },
    ],
    csp: [
      {
        label: "Suporte necessário",
        descricao: "Horas de suporte que a base de clientes exige mês a mês e o custo de cobrir isso com cada modelo.",
        href: `/contratacoes/necessidade?cenario=${cenarioId}&cargo=suporte`,
      },
    ],
  };

  // Tabela mês a mês: soma dos produtos (simulacao_mensal) + consolidação (alocações, empresa, impostos).
  const simPorMes = new Map<string, Record<string, number>>();
  for (const r of simRows ?? []) {
    const m = simPorMes.get(r.mes_referencia) ?? {};
    for (const k of ["cogs_infraestrutura", "cogs_llm", "cogs_suporte_reativo", "cogs_cs_proativo", "cogs_gateway", "cogs_software", "cogs_outros", "sm_vendas", "sm_marketing"]) {
      m[k] = (m[k] ?? 0) + Number((r as Record<string, unknown>)[k] ?? 0);
    }
    simPorMes.set(r.mes_referencia, m);
  }
  const linhasCustos: LinhaCustos[] = resumo.linhasPeriodo.map((l) => {
    const m = simPorMes.get(l.mes_referencia) ?? {};
    const llm = m.cogs_llm ?? 0, software = m.cogs_software ?? 0, gateway = m.cogs_gateway ?? 0;
    return {
      mes_referencia: l.mes_referencia,
      receita: l.receita,
      clientes: l.clientes,
      infra: m.cogs_infraestrutura ?? 0,
      llm,
      suporteCs: (m.cogs_suporte_reativo ?? 0) + (m.cogs_cs_proativo ?? 0),
      gateway,
      implementacao: Math.max(0, (m.cogs_outros ?? 0) - llm - software - gateway),
      empresaCogs: l.empresaCogs,
      parceiros: m.sm_vendas ?? 0,
      midia: m.sm_marketing ?? 0,
      equipeVariavel: l.alocacaoVariavel,
      equipeFixa: l.alocacaoFixa,
      empresaGa: l.empresaGa,
      empresaPd: l.empresaPd,
      empresaSm: l.empresaSm,
      impostos: l.impostoMensal,
      feiras: l.smFeirasEventos,
      marketingLancado: l.empresaMarketingLancado,
      equipeComercial: l.alocacaoSm,
      // "Vendas lançado" fecha o S&M: tudo que não é mídia, feiras, marketing lançado, parceiros ou equipe.
      vendasLancado: l.smMarketing + l.smVendas + l.smOutros - (m.sm_marketing ?? 0) - l.smFeirasEventos - l.empresaMarketingLancado - (m.sm_vendas ?? 0) - l.alocacaoSm,
      marca: l.empresaMarca,
    };
  });

  const categoriaPorConta = (codigo: string | undefined) => (codigo ? categoriaDeConta({ codigo }) : undefined);

  const totalGeral =
    fixos.reduce((s, f) => s + Number(f.quantidade) * Number(f.valor_unitario), 0) +
    variaveis.reduce((s, v) => s + (Number(v.valor_base) || 0), 0) +
    custosEmpresa.reduce((s, c) => s + (Number(c.valor_mensal) || 0), 0);

  return (
    <div>
      <div className="mb-2">
        <Link href={`/plano/${cenarioId}`} className="text-[12.5px] text-text-muted">
          ← {cenario.nome}
        </Link>
      </div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Plano de Custos — {cenario.nome}</h1>
          <p className="mt-1 text-[13px] text-text-muted">Um card por tipo de custo — a mesma linguagem usada em Lançamentos.</p>
        </div>
        <span className="font-mono text-[15px] font-semibold">{formatBRL(totalGeral)}<span className="ml-1 text-[11px] font-normal text-text-faint">/mês (soma dos fixos)</span></span>
      </div>

      <AvisoTelaGrande />

      <MetasHeader
        metas={cenario}
        atuais={{
          receitaMensal: ultimaLinha?.receita ?? null,
          cac: metricas.cacMedio,
          ltv: metricas.ltvMedio,
          roiPct: metricas.roiPct,
          tirPct: metricas.tirAnualPct,
        }}
      />

      <p className="mb-4 text-[11.5px] text-text-muted">
        Custos da empresa (administrativo, jurídico, contábil — não ligados a um produto) aparecem aqui pra contexto; pra adicionar ou
        editar esses, use{" "}
        <Link href={`/plano-de-custos/empresa?cenario=${cenarioId}`} className="font-medium text-primary-deep underline">
          Custos da Empresa
        </Link>
        .
      </p>

      <div className="flex flex-col gap-4">
        {CATEGORIAS_LANCAMENTO.map((chave) => {
          const fixosDaCategoria = fixos.filter((f) => categoriaPorConta(f.plano_contas?.codigo) === chave);
          const variaveisDaCategoria = variaveis.filter((v) => categoriaPorConta(v.plano_contas?.codigo) === chave);
          const empresaDaCategoria = custosEmpresa.filter((c) => categoriaPorConta(c.plano_contas?.codigo) === chave);
          const contasDaCategoria = (planoContas ?? []).filter((c) => categoriaDeConta(c) === chave);

          return (
            <CustosCategoriaCard
              key={chave}
              categoria={chave}
              label={labelCategoriaNegocio(chave)}
              cenarioId={cenarioId}
              produtos={produtos ?? []}
              planoContas={contasDaCategoria}
              fixos={fixosDaCategoria}
              variaveis={variaveisDaCategoria}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              custosEmpresa={empresaDaCategoria as any}
              matrizPorProduto={CATEGORIAS_MATRIZ.has(chave)}
              clientesPorProduto={clientesPorProduto}
              receitaPorProduto={receitaPorProduto}
              derivados={derivados.filter((d) => d.categoria === chave)}
              atalhos={atalhosPorCategoria[chave] ?? []}
              painel={
                chave === "csp" ? (
                  <CogsPremissasForm cenarioId={cenarioId} produtos={produtosCogs} perfis={perfisHora} />
                ) : chave === "marketing" ? (
                  <FeirasEventos cenarioId={cenarioId} acoes={(acoesRaw ?? []) as AcaoMarketing[]} produtos={produtosPlanos} />
                ) : undefined
              }
            />
          );
        })}
      </div>

      <div className="mt-6">
        <TabelaCustos linhas={linhasCustos} cenarioId={cenarioId} />
      </div>
    </div>
  );
}
