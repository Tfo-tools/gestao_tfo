import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { agregarPorCenario, computeMetricas } from "@/lib/relatorios-cenario";
import { MetasHeader } from "../../metas-header";
import { RecalcularProjecao } from "../recalcular-projecao";
import { CATEGORIAS_LANCAMENTO, categoriaDeConta, labelCategoriaNegocio } from "@/lib/categoria-negocio";
import type { CustoDerivado } from "./custos-derivados";
import { CogsPremissasForm, type ProdutoCogs, type PerfilHora } from "./cogs-premissas-form";
import { TabelaCustos, type LinhaCustos } from "./tabela-custos";
import { CustosCategoriaCard, type CustoFixoRow, type CustoVariavelRow } from "./custos-categoria-card";
import { AvisoTelaGrande } from "@/components/aviso-tela-grande";
import { FeirasEventos, type ProdutoPlanos } from "./feiras-eventos";
import { CoberturaCanalDireto, type LinhaCobertura } from "./cobertura-canal-direto";
import { custoAcaoPorMes, vendasAcaoPorMes } from "@/lib/acoes-marketing";
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

export default async function PlanoCustosPage({
  params,
  searchParams,
}: {
  params: Promise<{ cenarioId: string }>;
  // ?card=marketing abre esse card já expandido; a âncora #card-marketing rola até ele. É o que
  // faz o atalho de um indicador cair exatamente no lugar onde se edita o número.
  searchParams?: Promise<{ card?: string }>;
}) {
  const { cenarioId } = await params;
  const { card: cardAberto } = (await searchParams) ?? {};
  const supabase = await createClient();

  const [{ data: cenario }, { data: produtos }, { data: planoContas }] = await Promise.all([
    supabase
      .from("cenarios")
      .select("id, nome, data_inicio, data_fim, meta_receita_mensal, meta_cac, meta_ltv, meta_margem_bruta_pct, meta_tir_pct")
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
    .select("produto_id, mes_referencia, clientes_ativos, receita_bruta, novos_clientes, novos_direto, sm_vendas, sm_marketing, sm_outros, cogs_outros, cogs_infraestrutura, cogs_suporte, cogs_llm, cogs_software, cogs_gateway, cogs_cs_proativo, cogs_suporte_reativo, novos_representante, novos_associacao")
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
      rotulo: "Suporte e CS alocados",
      grupo: "COGS — 1.1.3",
      total: alocSuporte,
      detalhe: "Custo dos modelos de Suporte e de CS alocados em Necessidade de Contratação, pelas horas que a base exige em cada mês. Onde há alocação, ela substitui a regra de COGS do produto.",
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
        descricao: "Horas de suporte reativo que a base exige mês a mês e o custo de cobrir isso com cada modelo de contratação.",
        href: `/contratacoes/necessidade?cenario=${cenarioId}&cargo=suporte`,
      },
      {
        label: "CS proativo necessário",
        descricao: "Horas da régua de relacionamento mês a mês. Sem alocação, o CS é pago pela regra abaixo com um perfil só do início ao fim; alocando, o modelo muda por período.",
        href: `/contratacoes/necessidade?cenario=${cenarioId}&cargo=cs`,
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
  // COGS de cada produto no mês — a aba COGS da tabela filtra por produto.
  const cogsPorProdutoMes = new Map<string, Record<string, { receita: number; clientes: number; infra: number; llm: number; suporteCs: number; gateway: number; implementacao: number }>>();
  for (const r of simRows ?? []) {
    const rr = r as Record<string, unknown>;
    const n = (k: string) => Number(rr[k] ?? 0);
    const llm = n("cogs_llm"), software = n("cogs_software"), gateway = n("cogs_gateway");
    const porProduto = cogsPorProdutoMes.get(r.mes_referencia) ?? {};
    porProduto[r.produto_id] = {
      receita: n("receita_bruta"),
      clientes: n("clientes_ativos"),
      infra: n("cogs_infraestrutura"),
      llm,
      suporteCs: n("cogs_suporte_reativo") + n("cogs_cs_proativo"),
      gateway,
      implementacao: Math.max(0, n("cogs_outros") - llm - software - gateway),
    };
    cogsPorProdutoMes.set(r.mes_referencia, porProduto);
  }
  const semResiduo = (v: number) => (Math.abs(v) < 0.005 ? 0 : v);
  const linhasCustos: LinhaCustos[] = resumo.linhasPeriodo.map((l) => {
    const m = simPorMes.get(l.mes_referencia) ?? {};
    const llm = m.cogs_llm ?? 0, software = m.cogs_software ?? 0, gateway = m.cogs_gateway ?? 0;
    // Suporte + CS como o Relatório e a planilha exportada contam: a regra que sobrou depois da
    // substituição pela equipe alocada, mais a própria equipe. Antes a aba somava só a regra
    // crua da simulação e ficava R$ 49/mês abaixo do export a partir de fev/27 (alocação de
    // Suporte PJ com R$ 50 de estrutura) — na apresentação, tela e planilha precisam bater.
    const suporteCsConsolidado = (l.cogsSuporteRegra ?? 0) + (l.cogsCsRegra ?? 0) + (l.alocacaoSuporte ?? 0);
    const porProdutoBruto = cogsPorProdutoMes.get(l.mes_referencia) ?? {};
    const receitaTotalMes = Object.values(porProdutoBruto).reduce((s, p) => s + p.receita, 0);
    const linhasDoMes = (simRows ?? []).filter((r) => r.mes_referencia === l.mes_referencia) as Record<string, unknown>[];
    const brutoSup = linhasDoMes.reduce((s, r) => s + Number(r.cogs_suporte_reativo ?? 0), 0);
    const brutoCs = linhasDoMes.reduce((s, r) => s + Number(r.cogs_cs_proativo ?? 0), 0);
    const cogsPorProduto = Object.fromEntries(
      Object.entries(porProdutoBruto).map(([pid, p]) => {
        const rr = linhasDoMes.find((r) => r.produto_id === pid);
        // A regra que sobrou é rateada na proporção da regra crua de cada produto; a equipe
        // alocada, na proporção da receita.
        const supRegra = brutoSup > 0 ? (Number(rr?.cogs_suporte_reativo ?? 0) / brutoSup) * (l.cogsSuporteRegra ?? 0) : 0;
        const csRegra = brutoCs > 0 ? (Number(rr?.cogs_cs_proativo ?? 0) / brutoCs) * (l.cogsCsRegra ?? 0) : 0;
        const fatia = receitaTotalMes > 0 ? p.receita / receitaTotalMes : 0;
        return [pid, { ...p, suporteCs: supRegra + csRegra + (l.alocacaoSuporte ?? 0) * fatia }];
      }),
    );
    return {
      mes_referencia: l.mes_referencia,
      receita: l.receita,
      clientes: l.clientes,
      cogsPorProduto,
      infra: m.cogs_infraestrutura ?? 0,
      llm,
      suporteCs: suporteCsConsolidado,
      gateway,
      implementacao: Math.max(0, (m.cogs_outros ?? 0) - llm - software - gateway),
      empresaCogs: l.empresaCogs,
      parceiros: m.sm_vendas ?? 0,
      midia: m.sm_marketing ?? 0,
      marketing: (m.sm_marketing ?? 0) + l.smFeirasEventos + l.empresaMarketingLancado,
      equipeVariavel: l.alocacaoVariavel,
      equipeFixa: l.alocacaoFixa,
      empresaGa: l.empresaGa,
      empresaPd: l.empresaPd,
      empresaSm: l.empresaSm,
      vendasFixo: semResiduo(l.empresaSm - l.smFeirasEventos - l.empresaMarketingLancado),
      impostos: l.impostoMensal,
      feiras: l.smFeirasEventos,
      marketingLancado: l.empresaMarketingLancado,
      equipeComercial: l.alocacaoSm,
      equipeSdr: l.alocacaoSdr,
      equipeVendedor: l.alocacaoVendedor,
      equipeCoordenador: semResiduo(l.alocacaoSm - l.alocacaoSdr - l.alocacaoVendedor),
      // "Vendas lançado" fecha o S&M: tudo que não é mídia, feiras, marketing lançado, parceiros ou equipe.
      vendasLancado: l.smMarketing + l.smVendas + l.smOutros - (m.sm_marketing ?? 0) - l.smFeirasEventos - l.empresaMarketingLancado - (m.sm_vendas ?? 0) - l.alocacaoSm,
      marca: l.empresaMarca,
    };
  });

  // CAC por produto: o que dá pra atribuir a cada produto — canais de parceiro, mídia do
  // self-service, outros S&M do produto e a equipe comercial que trabalha nele — ÷ clientes novos.
  // Marketing e vendas da empresa (feiras, campanhas, marketing lançado, CRM) ficam à parte.
  const periodoIni = resumo.linhasPeriodo[0]?.mes_referencia ?? "";
  const periodoFim = resumo.linhasPeriodo[resumo.linhasPeriodo.length - 1]?.mes_referencia ?? "";
  const equipePorProduto: Record<string, number> = {};
  const marketingPorProduto: Record<string, number> = {};
  for (const l of resumo.linhasPeriodo) {
    for (const [pid, v] of Object.entries(l.equipePorProduto)) equipePorProduto[pid] = (equipePorProduto[pid] ?? 0) + v;
    for (const [pid, v] of Object.entries(l.marketingPorProduto)) marketingPorProduto[pid] = (marketingPorProduto[pid] ?? 0) + v;
  }
  const cacProdutos = (produtosCenario ?? [])
    .map((p) => {
      const rows = (simRows ?? []).filter((r) => r.produto_id === p.id && r.mes_referencia >= periodoIni && r.mes_referencia <= periodoFim);
      const novos = rows.reduce((s, r) => s + Number(r.novos_clientes ?? 0), 0);
      const canais = rows.reduce((s, r) => s + Number(r.sm_marketing ?? 0) + Number(r.sm_vendas ?? 0) + Number(r.sm_outros ?? 0), 0);
      const equipe = equipePorProduto[p.id] ?? 0;
      const marketing = marketingPorProduto[p.id] ?? 0;
      return {
        id: p.id,
        nome: p.nome,
        novos,
        canais,
        marketing,
        equipe,
        cac: novos > 0 ? (canais + marketing + equipe) / novos : null,
      };
    })
    .filter((x) => x.novos > 0 || x.canais + x.marketing + x.equipe > 0);
  // Só o que sobrou sem produto: ação de marketing sem retorno cadastrado e equipe não atribuída.
  const smEmpresa =
    (marketingPorProduto[""] ?? 0) +
    (equipePorProduto[""] ?? 0) +
    resumo.linhasPeriodo.reduce((s, l) => s + l.empresaVendasLancado, 0);
  const novosPeriodo = cacProdutos.reduce((s, x) => s + x.novos, 0);

  // Cobertura do canal direto: a meta de clientes diretos (crescimento das fases) × o que as ações de
  // marketing explicam. O custo de cada ação vai pros produtos pelos clientes que ela traz a cada um.
  const acoesLista = (acoesRaw ?? []) as AcaoMarketing[];
  const fimCenario = (cenario as { data_fim?: string | null }).data_fim ?? null;
  const noPeriodoCobertura = (m: string) => m >= periodoIni && m <= periodoFim;
  const nomeDoProduto = new Map((produtosCenario ?? []).map((p) => [p.id, p.nome]));
  const coberturaMapa = new Map<string, LinhaCobertura>();
  const semRetornoPorAno: Record<string, number> = {};
  const linhaCobertura = (ano: string, pid: string) => {
    const k = `${ano}|${pid}`;
    let l = coberturaMapa.get(k);
    if (!l) {
      l = { ano, produto: nomeDoProduto.get(pid) ?? "Produto", meta: 0, previstos: 0, custo: 0 };
      coberturaMapa.set(k, l);
    }
    return l;
  };
  for (const r of simRows ?? []) {
    const d = Number((r as { novos_direto?: number | null }).novos_direto ?? 0);
    if (d > 0 && noPeriodoCobertura(r.mes_referencia)) linhaCobertura(r.mes_referencia.slice(0, 4), r.produto_id).meta += d;
  }
  for (const a of acoesLista) {
    const vendas = [...new Set((a.retorno ?? []).map((x) => x.produto_id).filter(Boolean))].map((pid) => ({ pid, linhas: vendasAcaoPorMes(a, pid, fimCenario) }));
    const clientesDaAcao = vendas.reduce((s, v) => s + v.linhas.reduce((t, x) => t + x.clientes, 0), 0);
    for (const v of vendas) for (const x of v.linhas) if (noPeriodoCobertura(x.mes)) linhaCobertura(x.mes.slice(0, 4), v.pid).previstos += x.clientes;
    for (const [mes, valor] of custoAcaoPorMes(a, fimCenario)) {
      if (!noPeriodoCobertura(mes)) continue;
      const ano = mes.slice(0, 4);
      if (clientesDaAcao <= 0) {
        semRetornoPorAno[ano] = (semRetornoPorAno[ano] ?? 0) + valor;
        continue;
      }
      for (const v of vendas) {
        const parte = v.linhas.reduce((t, x) => t + x.clientes, 0) / clientesDaAcao;
        if (parte > 0) linhaCobertura(ano, v.pid).custo += valor * parte;
      }
    }
  }
  const cobertura = [...coberturaMapa.values()].sort((a, b) => a.ano.localeCompare(b.ano) || a.produto.localeCompare(b.produto));

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

      {/* Ajusta o custo no card, recalcula aqui mesmo e olha a tabela — o ciclo da tela de Vendas. */}
      <div className="mb-4 flex items-center justify-end">
        <RecalcularProjecao cenarioId={cenarioId} />
      </div>

      <MetasHeader
        metas={cenario}
        atuais={{
          receitaMensal: ultimaLinha?.receita ?? null,
          cac: metricas.cacMedio,
          ltv: metricas.ltvMedio,
          margemBrutaPct: metricas.margemBruta,
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
            <div key={chave} id={`card-${chave}`} className="scroll-mt-24">
            <CustosCategoriaCard
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
                  <>
                    <FeirasEventos cenarioId={cenarioId} acoes={acoesLista} produtos={produtosPlanos} fimCenario={fimCenario} />
                    <CoberturaCanalDireto linhas={cobertura} semRetornoPorAno={semRetornoPorAno} />
                  </>
                ) : undefined
              }
              comecarAberto={chave === cardAberto}
            />
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <TabelaCustos linhas={linhasCustos} cenarioId={cenarioId} produtos={(produtosCenario ?? []).map((p) => ({ id: p.id, nome: p.nome }))} />
      </div>

      {cacProdutos.length > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-1 font-heading text-[13px] font-semibold">CAC por produto no período</h2>
          <p className="mb-3 text-[11.5px] text-text-muted">
            O que é de cada produto: canais de parceiro, mídia do self-service, o marketing atribuído a ele (ação pelos clientes que
            promete; custo lançado pelo rateio — por receita quando não há rateio definido) e a equipe comercial que trabalha nele. O que
            não dá pra atribuir fica na última linha.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="px-2 py-1.5 font-medium">Produto</th>
                  <th className="px-2 py-1.5 text-right font-medium">Novos clientes</th>
                  <th className="px-2 py-1.5 text-right font-medium">Canais e mídia</th>
                  <th className="px-2 py-1.5 text-right font-medium">Marketing atribuído</th>
                  <th className="px-2 py-1.5 text-right font-medium">Equipe comercial</th>
                  <th className="px-2 py-1.5 text-right font-medium">CAC do produto</th>
                </tr>
              </thead>
              <tbody>
                {cacProdutos.map((x) => (
                  <tr key={x.id} className="border-t border-border-soft">
                    <td className="px-2 py-1.5">{x.nome}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{Math.round(x.novos).toLocaleString("pt-BR")}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatBRL(x.canais)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatBRL(x.marketing)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatBRL(x.equipe)}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold">{x.cac != null ? formatBRL(x.cac) : "—"}</td>
                  </tr>
                ))}
                <tr className="border-t border-border-soft text-text-muted">
                  <td className="px-2 py-1.5">
                    Não atribuído a produto (ação sem retorno cadastrado, CRM e vendas da empresa)
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">—</td>
                  <td className="px-2 py-1.5 text-right font-mono" colSpan={3}>{formatBRL(smEmpresa)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {novosPeriodo > 0 ? `+ ${formatBRL(smEmpresa / novosPeriodo)} por cliente` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
