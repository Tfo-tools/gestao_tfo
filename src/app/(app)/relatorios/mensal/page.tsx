import Link from "next/link";
import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import { custoEmpresaNoMes, faseDoProdutoNoMes, type CustoEmpresaInput } from "@/lib/custos-empresa";
import { custoMensalModelo, type ParametrosModelo, type TipoModelo } from "@/lib/modelos-contratacao";
import { subgrupoDeConta, subgrupoDeCargo, type SubgrupoConta } from "@/lib/subgrupo-conta";
import { calcularDemandaPorCargo, type FaseProdutoInput, type FunilPremissaInput, type SimulacaoMesInput } from "@/lib/necessidade-contratacao";
import type { FaseValue } from "@/lib/fases";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function formatMes(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}
function formatPct(v: number | null) {
  return v != null ? `${(v * 100).toFixed(1)}%` : "—";
}

type Linha = {
  mes_referencia: string;
  novos_clientes: number;
  clientes_ativos: number;
  churn_pct: number | null;
  receita_bruta: number;
  suporte: number;
  infraestrutura: number;
  outros_cogs: number;
  marketing: number;
  vendas: number;
  outros_sm: number;
  pd: number;
  ga: number;
};

const COLUNAS_CONSOLIDADO: { chave: keyof Linha; label: string }[] = [
  { chave: "suporte", label: "Suporte (COGS)" },
  { chave: "infraestrutura", label: "Infra (COGS)" },
  { chave: "outros_cogs", label: "Outros (COGS)" },
  { chave: "marketing", label: "Marketing" },
  { chave: "vendas", label: "Vendas" },
  { chave: "outros_sm", label: "Outros (S&M)" },
  { chave: "pd", label: "P&D" },
  { chave: "ga", label: "G&A" },
];

const COLUNAS_FILTRADO: { chave: keyof Linha; label: string }[] = [
  { chave: "suporte", label: "Suporte (COGS)" },
  { chave: "infraestrutura", label: "Infra (COGS)" },
  { chave: "outros_cogs", label: "Outros (COGS)" },
  { chave: "vendas", label: "Vendas" },
];

export default async function RelatoriosMensalPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string; produto?: string }>;
}) {
  const { cenario, produto } = await searchParams;
  const supabase = await createClient();

  const { data: cenarios } = await supabase.from("cenarios").select("id, nome, is_base").order("created_at");
  const cenarioAtual = cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";
  const produtoFiltro = produto ?? "";

  const { data: produtos } = await supabase.from("produtos").select("id, nome").order("nome");

  let query = supabase
    .from("simulacao_mensal")
    .select(
      "produto_id, mes_referencia, novos_clientes, clientes_ativos, churn_pct, receita_bruta, cogs_suporte, cogs_infraestrutura, cogs_outros, sm_marketing, sm_vendas, sm_outros, opex_pd, opex_ga",
    )
    .eq("cenario_id", cenarioAtual)
    .order("mes_referencia");
  if (produtoFiltro) query = query.eq("produto_id", produtoFiltro);
  const { data: simRaw } = cenarioAtual ? await query : { data: [] };

  const porMes = new Map<string, Linha>();
  for (const row of simRaw ?? []) {
    const atual = porMes.get(row.mes_referencia) ?? {
      mes_referencia: row.mes_referencia,
      novos_clientes: 0,
      clientes_ativos: 0,
      churn_pct: null,
      receita_bruta: 0,
      suporte: 0,
      infraestrutura: 0,
      outros_cogs: 0,
      marketing: 0,
      vendas: 0,
      outros_sm: 0,
      pd: 0,
      ga: 0,
    };
    atual.novos_clientes += Number(row.novos_clientes);
    atual.clientes_ativos += Number(row.clientes_ativos);
    atual.receita_bruta += Number(row.receita_bruta);
    atual.suporte += Number(row.cogs_suporte);
    atual.infraestrutura += Number(row.cogs_infraestrutura);
    atual.outros_cogs += Number(row.cogs_outros);
    atual.marketing += Number(row.sm_marketing);
    atual.vendas += Number(row.sm_vendas);
    atual.outros_sm += Number(row.sm_outros);
    atual.pd += Number(row.opex_pd);
    atual.ga += Number(row.opex_ga);
    porMes.set(row.mes_referencia, atual);
  }

  // Custos compartilhados da empresa entram só na visão consolidada (sem filtro de produto).
  if (!produtoFiltro && cenarioAtual) {
    const [{ data: custosEmpresaRaw }, { data: alocacoesRaw }, { data: modelosRaw }, { data: fasesRaw }] = await Promise.all([
      supabase.from("custos_empresa").select("*, plano_contas:plano_contas_id(codigo, tipo)").eq("cenario_id", cenarioAtual),
      supabase.from("alocacao_modelo_contratacao").select("*").eq("cenario_id", cenarioAtual),
      supabase.from("modelos_contratacao").select("*"),
      supabase.from("fases_produto").select("id, produto_id, fase, data_inicio, data_fim").eq("cenario_id", cenarioAtual),
    ]);
    const fasesPorProduto = new Map<string, { fase: FaseValue; data_inicio: string | null; data_fim: string | null }[]>();
    for (const f of (fasesRaw ?? []) as { produto_id: string; fase: FaseValue; data_inicio: string | null; data_fim: string | null }[]) {
      const atual = fasesPorProduto.get(f.produto_id) ?? [];
      atual.push(f);
      fasesPorProduto.set(f.produto_id, atual);
    }

    // Demanda real de SDR/Coordenador/Suporte por mês — alimenta o custo dos modelos variáveis
    // (PJ, agência créditos/híbrido) com a demanda de verdade; CLT e pacote fechado continuam
    // usando a quantidade alocada (decisão discreta, não sensível à demanda flutuar).
    const faseIds = (fasesRaw ?? []).map((f: { id: string }) => f.id);
    const { data: funisRaw } =
      faseIds.length > 0
        ? await supabase
            .from("premissas_funil")
            .select("fase_produto_id, taxa_conversao, capacidade_vendedor_mes, span_of_control, horas_suporte_por_cliente_mes")
            .in("fase_produto_id", faseIds)
        : { data: [] };
    const faseById = new Map<string, { id: string; produto_id: string; fase: FaseValue }>(
      (fasesRaw ?? []).map((f: { id: string; produto_id: string; fase: FaseValue }) => [f.id, f]),
    );
    const fasesPorProdutoInput: FaseProdutoInput[] = (fasesRaw ?? []).map(
      (f: { produto_id: string; fase: FaseValue; data_inicio: string | null; data_fim: string | null }) => ({
        produtoId: f.produto_id,
        fase: f.fase,
        data_inicio: f.data_inicio,
        data_fim: f.data_fim,
      }),
    );
    const funisInput: FunilPremissaInput[] = (
      (funisRaw ?? []) as {
        fase_produto_id: string;
        taxa_conversao: number | null;
        capacidade_vendedor_mes: number | null;
        span_of_control: number | null;
        horas_suporte_por_cliente_mes: number | null;
      }[]
    )
      .map((f) => {
        const fase = faseById.get(f.fase_produto_id);
        if (!fase) return null;
        return {
          produtoId: fase.produto_id,
          fase: fase.fase,
          taxa_conversao: f.taxa_conversao,
          capacidade_vendedor_mes: f.capacidade_vendedor_mes,
          span_of_control: f.span_of_control,
          horas_suporte_por_cliente_mes: f.horas_suporte_por_cliente_mes,
        };
      })
      .filter((f): f is FunilPremissaInput => f !== null);
    const simulacaoInput: SimulacaoMesInput[] = (
      (simRaw ?? []) as { produto_id: string; mes_referencia: string; novos_clientes: number; clientes_ativos: number }[]
    ).map((s) => ({
      produtoId: s.produto_id,
      mes_referencia: s.mes_referencia,
      novos_clientes: Number(s.novos_clientes),
      clientes_ativos: Number(s.clientes_ativos),
    }));
    const demandaPorCargo = calcularDemandaPorCargo({ fasesPorProduto: fasesPorProdutoInput, funis: funisInput, simulacao: simulacaoInput });
    const demandaPorCargoMes: Record<"sdr" | "coordenador" | "suporte", Map<string, number>> = {
      sdr: new Map(demandaPorCargo.sdr.map((d) => [d.mes_referencia, d.demanda])),
      coordenador: new Map(demandaPorCargo.coordenador.map((d) => [d.mes_referencia, d.demanda])),
      suporte: new Map(demandaPorCargo.suporte.map((d) => [d.mes_referencia, d.demanda])),
    };
    function demandaCargoNoMes(cargo: string, mes: string): number {
      const chave = cargo.trim().toLowerCase();
      if (chave === "sdr") return demandaPorCargoMes.sdr.get(mes) ?? 0;
      if (chave === "coordenador") return demandaPorCargoMes.coordenador.get(mes) ?? 0;
      if (chave === "suporte") return demandaPorCargoMes.suporte.get(mes) ?? 0;
      return 0;
    }

    const modeloById = new Map(
      ((modelosRaw ?? []) as { id: string; cargo: string; tipo_modelo: string; categoria: "pd" | "sm" | "ga"; parametros: ParametrosModelo }[]).map((m) => [
        m.id,
        m,
      ]),
    );

    for (const linha of porMes.values()) {
      const mesDate = new Date(linha.mes_referencia + "T00:00:00");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (custosEmpresaRaw ?? []) as any[]) {
        const produtoRefId = c.parametros?.produto_referencia_id as string | undefined;
        const faseReferencia = produtoRefId ? faseDoProdutoNoMes(fasesPorProduto.get(produtoRefId) ?? [], mesDate) : null;
        const valor = custoEmpresaNoMes(c as CustoEmpresaInput, mesDate, linha.receita_bruta, linha.clientes_ativos, faseReferencia);
        if (valor === 0) continue;
        const sub: SubgrupoConta = c.plano_contas ? subgrupoDeConta(c.plano_contas.codigo, c.plano_contas.tipo) : "outros";
        somarNaLinha(linha, sub, valor);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of (alocacoesRaw ?? []) as any[]) {
        const mes = linha.mes_referencia;
        const inicio = a.data_inicio ? new Date(a.data_inicio + "T00:00:00") : null;
        const fim = a.data_fim ? new Date(a.data_fim + "T00:00:00") : null;
        const mesD = new Date(mes + "T00:00:00");
        const iniciouAntes = !inicio || new Date(inicio.getFullYear(), inicio.getMonth(), 1) <= mesD;
        const aindaAtiva = !fim || fim >= mesD;
        if (!iniciouAntes || !aindaAtiva) continue;
        const modelo = modeloById.get(a.modelo_id);
        if (!modelo) continue;
        const tipo = modelo.tipo_modelo as TipoModelo;
        const quantidade = Number(a.quantidade);
        const demanda =
          tipo === "clt" || tipo === "empresa_fixo_escopo"
            ? quantidade * (modelo.parametros.capacidade_unidade_mes ?? 1)
            : demandaCargoNoMes(a.cargo, mes);
        const custo = custoMensalModelo(tipo, modelo.parametros, demanda).custoMensal;
        somarNaLinha(linha, subgrupoDeCargo(modelo.cargo, modelo.categoria), custo);
      }
    }
  }

  const linhas = [...porMes.values()].sort((a, b) => (a.mes_referencia < b.mes_referencia ? -1 : 1));

  // Recalcula churn ponderado direto das linhas brutas (por produto), já que a soma acima não pondera.
  const churnPorMes = new Map<string, { soma: number; base: number }>();
  for (const row of simRaw ?? []) {
    const c = churnPorMes.get(row.mes_referencia) ?? { soma: 0, base: 0 };
    if (row.churn_pct != null) {
      c.soma += Number(row.churn_pct) * Number(row.clientes_ativos);
      c.base += Number(row.clientes_ativos);
    }
    churnPorMes.set(row.mes_referencia, c);
  }
  for (const l of linhas) {
    const c = churnPorMes.get(l.mes_referencia);
    l.churn_pct = c && c.base > 0 ? c.soma / c.base : null;
  }

  const colunas = produtoFiltro ? COLUNAS_FILTRADO : COLUNAS_CONSOLIDADO;
  const nomeProdutoFiltro = (produtos ?? []).find((p) => p.id === produtoFiltro)?.nome;
  const semDados = linhas.length === 0;

  return (
    <div>
      <div className="mb-2">
        <Link href="/relatorios" className="text-[12.5px] text-text-muted">
          ← Relatórios
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Detalhamento Mensal</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {produtoFiltro
              ? `${nomeProdutoFiltro} — só custos diretos desse produto (sem marketing/S&M geral, G&A e P&D, que são compartilhados)`
              : "Consolidado dos produtos, incluindo custos compartilhados da empresa"}
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
          <select name="produto" defaultValue={produtoFiltro} className="input">
            <option value="">Todos os produtos (consolidado)</option>
            {(produtos ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
            Filtrar
          </button>
        </form>
      </div>

      {semDados ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-text-muted">
            Nenhuma projeção calculada nesse cenário/produto ainda — recalcule em Produtos primeiro.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-text-muted">
                  <td className="px-2 py-1.5 font-medium">Mês</td>
                  <td className="px-2 py-1.5 text-right font-medium">Ativos</td>
                  <td className="px-2 py-1.5 text-right font-medium">Novos</td>
                  <td className="px-2 py-1.5 text-right font-medium">Churn</td>
                  <td className="border-r border-border-soft px-2 py-1.5 text-right font-medium">Faturamento</td>
                  {colunas.map((c) => (
                    <td key={c.chave} className="px-2 py-1.5 text-right font-medium">
                      {c.label}
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.mes_referencia} className="border-t border-border-soft">
                    <td className="px-2 py-1.5 capitalize">{formatMes(l.mes_referencia)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.clientes_ativos.toLocaleString("pt-BR")}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.novos_clientes.toLocaleString("pt-BR")}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatPct(l.churn_pct)}</td>
                    <td className="border-r border-border-soft px-2 py-1.5 text-right font-mono font-semibold">{formatBRL(l.receita_bruta)}</td>
                    {colunas.map((c) => (
                      <td key={c.chave} className="px-2 py-1.5 text-right font-mono">
                        {formatBRL(l[c.chave] as number)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function somarNaLinha(linha: Linha, sub: SubgrupoConta, valor: number) {
  if (sub === "suporte") linha.suporte += valor;
  else if (sub === "infraestrutura") linha.infraestrutura += valor;
  else if (sub === "outros_cogs") linha.outros_cogs += valor;
  else if (sub === "marketing") linha.marketing += valor;
  else if (sub === "vendas") linha.vendas += valor;
  else if (sub === "outros_sm") linha.outros_sm += valor;
  else if (sub === "pd") linha.pd += valor;
  else if (sub === "ga") linha.ga += valor;
}
