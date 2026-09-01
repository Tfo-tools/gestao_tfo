import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InfoTooltip } from "@/components/info-tooltip";
import { AlocacaoInvestimento } from "./alocacao-investimento";
import { custoEmpresaNoMes, faseDoProdutoNoMes, type CustoEmpresaInput } from "@/lib/custos-empresa";
import type { FaseValue } from "@/lib/fases";
import { custoMensalModelo, type ParametrosModelo, type TipoModelo } from "@/lib/modelos-contratacao";
import { calcularDemandaPorCargo, type FaseProdutoInput, type FunilPremissaInput, type SimulacaoMesInput } from "@/lib/necessidade-contratacao";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatMes(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function buildPath(values: number[], width: number, height: number, min: number, max: number) {
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; a?: string; b?: string; periodo?: string }>;
}) {
  const { aba, a, b, periodo } = await searchParams;
  const abaAtual = aba === "planos" ? "planos" : "real";

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Relatórios</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {abaAtual === "real"
              ? "O que de fato está acontecendo na empresa — custos e vendas já realizados"
              : "Planejamento — projeção de receitas e despesas mês a mês"}
          </p>
        </div>
        <div className="flex gap-2 rounded-lg bg-bg p-1">
          <Link
            href="/relatorios?aba=real"
            className={`rounded-md px-4 py-2 text-[12.5px] font-medium ${abaAtual === "real" ? "bg-surface shadow-sm text-primary-deep" : "text-text-muted"}`}
          >
            Real
          </Link>
          <Link
            href="/relatorios?aba=planos"
            className={`rounded-md px-4 py-2 text-[12.5px] font-medium ${abaAtual === "planos" ? "bg-surface shadow-sm text-primary-deep" : "text-text-muted"}`}
          >
            Planos
          </Link>
        </div>
      </div>

      {abaAtual === "real" ? <RelatorioReal /> : <RelatorioPlanos a={a} b={b} periodo={periodo} />}
    </div>
  );
}

const GRUPO_TOOLTIP: Record<string, string> = {
  COGS: "Cost of Goods Sold (Custo dos Produtos/Serviços Vendidos): custos diretos para entregar o produto — ex: infraestrutura, hospedagem, APIs de terceiros.",
  "S&M": "Sales & Marketing (Vendas e Marketing): custos para atrair e converter clientes — ex: anúncios, comissões, equipe comercial.",
  "P&D": "Pesquisa e Desenvolvimento: custos da equipe e ferramentas que constroem e evoluem o produto.",
  "G&A": "General & Administrative (Geral e Administrativo): custos de gestão da empresa — ex: contabilidade, jurídico, administrativo.",
};

function grupoDe(codigo: string, tipo: string): string {
  if (tipo === "cogs") return "COGS";
  if (codigo.startsWith("4.2.1")) return "S&M";
  if (codigo.startsWith("4.2.2")) return "P&D";
  if (codigo.startsWith("4.2.3") || codigo.startsWith("4.2.4")) return "G&A";
  if (tipo === "financeiro") return "Financeiro";
  if (tipo === "ativo") return "Ativos";
  return "Outros";
}

const ORDEM_GRUPOS = ["COGS", "S&M", "P&D", "G&A", "Financeiro", "Ativos", "Outros"];

async function RelatorioReal() {
  const supabase = await createClient();

  const [{ data: despesas }, { data: receitasReais }] = await Promise.all([
    supabase.from("despesas").select("data_gasto, valor_total, plano_contas:plano_contas_id(codigo, tipo)"),
    // Nenhuma tabela de receita realizada existe ainda — fica pronto pro dia em que houver vendas reais.
    Promise.resolve({ data: [] as { data_venda: string; valor: number }[] }),
  ]);

  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const porGrupo = new Map<string, { mes: number; acumulado: number }>();
  for (const g of ORDEM_GRUPOS) porGrupo.set(g, { mes: 0, acumulado: 0 });

  for (const d of despesas ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conta = d.plano_contas as any;
    if (!conta) continue;
    const grupo = grupoDe(conta.codigo, conta.tipo);
    const entry = porGrupo.get(grupo)!;
    const valor = Number(d.valor_total);
    entry.acumulado += valor;
    if (d.data_gasto.startsWith(mesAtual)) entry.mes += valor;
  }

  const receitaMes = (receitasReais ?? []).filter((r) => r.data_venda.startsWith(mesAtual)).reduce((s, r) => s + r.valor, 0);
  const receitaAcumulada = (receitasReais ?? []).reduce((s, r) => s + r.valor, 0);

  const totalCustosMes = [...porGrupo.values()].reduce((acc, g) => acc + g.mes, 0);
  const totalCustosAcumulado = [...porGrupo.values()].reduce((acc, g) => acc + g.acumulado, 0);
  const ebitdaMes = receitaMes - totalCustosMes;
  const ebitdaAcumulado = receitaAcumulada - totalCustosAcumulado;

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">Demonstrativo de Resultado — Real</h2>
        {receitaAcumulada === 0 && <span className="text-[11px] text-text-faint">receita ainda não lançada — período pré-operacional</span>}
      </div>
      <table className="mt-4 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="text-left text-text-muted">
            <th className="px-2 py-2 font-medium">Grupo</th>
            <th className="px-2 py-2 text-right font-medium">{mesAtual}</th>
            <th className="px-2 py-2 text-right font-medium">Acumulado</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border-soft">
            <td className="px-2 py-2.5">Faturamento</td>
            <td className="px-2 py-2.5 text-right font-mono">{formatBRL(receitaMes)}</td>
            <td className="px-2 py-2.5 text-right font-mono">{formatBRL(receitaAcumulada)}</td>
          </tr>
          {ORDEM_GRUPOS.filter((g) => porGrupo.get(g)!.acumulado > 0).map((g) => {
            const v = porGrupo.get(g)!;
            return (
              <tr key={g} className="border-t border-border-soft">
                <td className="flex items-center px-2 py-2.5">
                  (–) {g}
                  {GRUPO_TOOLTIP[g] && <InfoTooltip texto={GRUPO_TOOLTIP[g]} />}
                </td>
                <td className="px-2 py-2.5 text-right font-mono">{formatBRL(v.mes)}</td>
                <td className="px-2 py-2.5 text-right font-mono">{formatBRL(v.acumulado)}</td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-text bg-wine-soft">
            <td className="flex items-center px-2 py-2.5 font-bold">
              (=) EBITDA real
              <InfoTooltip texto="EBITDA = lucro antes de juros, impostos, depreciação e amortização — aqui calculado só com o que já foi de fato faturado e gasto, sem projeção." />
            </td>
            <td className={`px-2 py-2.5 text-right font-mono font-bold ${ebitdaMes < 0 ? "text-danger" : "text-success"}`}>{formatBRL(ebitdaMes)}</td>
            <td className={`px-2 py-2.5 text-right font-mono font-bold ${ebitdaAcumulado < 0 ? "text-danger" : "text-success"}`}>
              {formatBRL(ebitdaAcumulado)}
            </td>
          </tr>
        </tbody>
      </table>

      {(despesas ?? []).length === 0 && (
        <p className="mt-4 text-[13px] text-text-muted">Nenhuma despesa lançada ainda — cadastre em Custos → Lançamentos.</p>
      )}
    </div>
  );
}

type Agregado = { mes_referencia: string; receita: number; ebitdaProdutos: number; clientes: number; custosEmpresa: number; ebitda: number };

type ResumoCenario = {
  linhas: Agregado[];
  cacMedio: number | null;
  breakEvenMes: string | null;
  breakEvenClientes: number | null;
  clientes12Meses: number | null;
  paybackMes: string | null;
  totalInvestido: number;
  ebitdaAcumulado: number;
};

function ativaNoMes(mesIso: string, dataInicio: string | null, dataFim: string | null): boolean {
  const mes = new Date(mesIso + "T00:00:00");
  const inicio = dataInicio ? new Date(dataInicio + "T00:00:00") : null;
  const fim = dataFim ? new Date(dataFim + "T00:00:00") : null;
  const iniciouAntes = !inicio || new Date(inicio.getFullYear(), inicio.getMonth(), 1) <= mes;
  const aindaAtiva = !fim || fim >= mes;
  return iniciouAntes && aindaAtiva;
}

async function agregarPorCenario(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cenarioId: string,
): Promise<ResumoCenario> {
  if (!cenarioId)
    return {
      linhas: [],
      cacMedio: null,
      breakEvenMes: null,
      breakEvenClientes: null,
      clientes12Meses: null,
      paybackMes: null,
      totalInvestido: 0,
      ebitdaAcumulado: 0,
    };

  const [{ data: simRows }, { data: vinculos }, { data: custosEmpresaRaw }, { data: alocacoesRaw }, { data: modelosRaw }, { data: fasesRaw }] =
    await Promise.all([
      supabase
        .from("simulacao_mensal")
        .select("produto_id, mes_referencia, receita_bruta, ebitda, clientes_ativos, cac_all_in, novos_clientes")
        .eq("cenario_id", cenarioId)
        .order("mes_referencia"),
      supabase.from("cenario_programas").select("programa_id").eq("cenario_id", cenarioId),
      supabase.from("custos_empresa").select("*").eq("cenario_id", cenarioId),
      supabase.from("alocacao_modelo_contratacao").select("*").eq("cenario_id", cenarioId),
      supabase.from("modelos_contratacao").select("*"),
      supabase.from("fases_produto").select("id, produto_id, fase, data_inicio, data_fim").eq("cenario_id", cenarioId),
    ]);

  const fasesPorProduto = new Map<string, { fase: FaseValue; data_inicio: string | null; data_fim: string | null }[]>();
  for (const f of (fasesRaw ?? []) as { produto_id: string; fase: FaseValue; data_inicio: string | null; data_fim: string | null }[]) {
    const atual = fasesPorProduto.get(f.produto_id) ?? [];
    atual.push(f);
    fasesPorProduto.set(f.produto_id, atual);
  }

  // Demanda real de SDR/Coordenador/Suporte por mês, pra alimentar o custo de modelos de
  // contratação variáveis (agência créditos/híbrido) com a demanda de verdade, não uma
  // quantidade fixa — modelos discretos (CLT/PJ/pacote fechado) continuam usando a quantidade
  // alocada, já que ali a decisão é "quantas unidades eu contratei", não "quanto eu precisei".
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
  const funisInput: FunilPremissaInput[] = ((funisRaw ?? []) as { fase_produto_id: string; taxa_conversao: number | null; capacidade_vendedor_mes: number | null; span_of_control: number | null; horas_suporte_por_cliente_mes: number | null }[])
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
  const simulacaoInput: SimulacaoMesInput[] = ((simRows ?? []) as { produto_id: string; mes_referencia: string; novos_clientes: number; clientes_ativos: number }[]).map((s) => ({
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

  const porMes = new Map<string, Agregado>();
  let somaCacPonderado = 0;
  let somaNovosClientes = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (simRows ?? []) as any[]) {
    const atual = porMes.get(row.mes_referencia) ?? { mes_referencia: row.mes_referencia, receita: 0, ebitdaProdutos: 0, clientes: 0, custosEmpresa: 0, ebitda: 0 };
    atual.receita += Number(row.receita_bruta);
    atual.ebitdaProdutos += Number(row.ebitda);
    atual.clientes += Number(row.clientes_ativos);
    porMes.set(row.mes_referencia, atual);

    const novos = Number(row.novos_clientes ?? 0);
    if (row.cac_all_in != null && novos > 0) {
      somaCacPonderado += Number(row.cac_all_in) * novos;
      somaNovosClientes += novos;
    }
  }

  // Custos compartilhados da empresa (não ligados a um produto) — entram uma vez no EBITDA
  // consolidado, sem ratear entre produtos.
  const modeloById = new Map(((modelosRaw ?? []) as { id: string; tipo_modelo: string; parametros: ParametrosModelo }[]).map((m) => [m.id, m]));
  for (const atual of porMes.values()) {
    const mesDate = new Date(atual.mes_referencia + "T00:00:00");

    let custosEmpresa = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (custosEmpresaRaw ?? []) as any[]) {
      const produtoRefId = c.parametros?.produto_referencia_id as string | undefined;
      const faseReferencia = produtoRefId ? faseDoProdutoNoMes(fasesPorProduto.get(produtoRefId) ?? [], mesDate) : null;
      custosEmpresa += custoEmpresaNoMes(c as CustoEmpresaInput, mesDate, atual.receita, atual.clientes, faseReferencia);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (alocacoesRaw ?? []) as any[]) {
      if (!ativaNoMes(atual.mes_referencia, a.data_inicio, a.data_fim)) continue;
      const modelo = modeloById.get(a.modelo_id);
      if (!modelo) continue;
      const tipo = modelo.tipo_modelo as TipoModelo;
      const quantidade = Number(a.quantidade);
      // CLT e pacote fechado (empresa_fixo_escopo) são decisões discretas — você contratou N
      // unidades, o custo é esse independente da demanda real flutuar. PJ e os modelos pay-per-use
      // (créditos/híbrido) são cobrados pela demanda real do mês (PJ só entra pelas horas usadas).
      const demandaEquivalente =
        tipo === "clt" || tipo === "empresa_fixo_escopo"
          ? quantidade * (modelo.parametros.capacidade_unidade_mes ?? 1)
          : demandaCargoNoMes(a.cargo, atual.mes_referencia);
      custosEmpresa += custoMensalModelo(tipo, modelo.parametros, demandaEquivalente).custoMensal;
    }

    atual.custosEmpresa = custosEmpresa;
    atual.ebitda = atual.ebitdaProdutos - custosEmpresa;
  }

  const linhas = [...porMes.values()].sort((a, b) => (a.mes_referencia < b.mes_referencia ? -1 : 1));
  const cacMedio = somaNovosClientes > 0 ? somaCacPonderado / somaNovosClientes : null;

  let acumulado = 0;
  let breakEvenMes: string | null = null;
  let breakEvenClientes: number | null = null;
  for (const l of linhas) {
    acumulado += l.ebitda;
    if (breakEvenMes === null && acumulado >= 0 && l.mes_referencia !== linhas[0]?.mes_referencia) {
      breakEvenMes = l.mes_referencia;
      breakEvenClientes = l.clientes;
    }
  }
  const ebitdaAcumulado = linhas.reduce((s, l) => s + l.ebitda, 0);

  // Meta: clientes pagantes ativos no 12º mês da linha do tempo simulada (ou o último mês
  // disponível, se o cenário tiver menos de 12 meses simulados).
  const clientes12Meses = linhas.length > 0 ? (linhas[11] ?? linhas[linhas.length - 1]).clientes : null;

  const programaIds = ((vinculos ?? []) as { programa_id: string }[]).map((v) => v.programa_id);
  let totalInvestido = 0;
  if (programaIds.length > 0) {
    const { data: programas } = await supabase
      .from("programas_investimento")
      .select("valor_total")
      .in("id", programaIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    totalInvestido = ((programas ?? []) as any[]).reduce((s, p) => s + Number(p.valor_total ?? 0), 0);
  }

  // Payback: primeiro mês em que o EBITDA acumulado recupera todo o capital captado — diferente
  // do break-even (que só olha a operação ficar positiva, sem considerar o capital investido).
  let paybackMes: string | null = null;
  if (totalInvestido > 0) {
    let acumuladoPayback = 0;
    for (const l of linhas) {
      acumuladoPayback += l.ebitda;
      if (acumuladoPayback >= totalInvestido) {
        paybackMes = l.mes_referencia;
        break;
      }
    }
  }

  return { linhas, cacMedio, breakEvenMes, breakEvenClientes, clientes12Meses, paybackMes, totalInvestido, ebitdaAcumulado };
}

async function RelatorioPlanos({ a, b, periodo }: { a?: string; b?: string; periodo?: string }) {
  const supabase = await createClient();

  const { data: cenarios } = await supabase.from("cenarios").select("id, nome, is_base").order("created_at");

  const cenarioA = a ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";
  const cenarioB = b ?? (cenarios ?? []).find((c) => c.id !== cenarioA)?.id ?? "";

  const [resumoA, resumoB] = await Promise.all([agregarPorCenario(supabase, cenarioA), agregarPorCenario(supabase, cenarioB)]);

  const nomeA = (cenarios ?? []).find((c) => c.id === cenarioA)?.nome ?? "—";
  const nomeB = (cenarios ?? []).find((c) => c.id === cenarioB)?.nome ?? "—";

  const [{ data: alocacoesA }, { data: alocacoesB }] = await Promise.all([
    cenarioA ? supabase.from("alocacao_investimento").select("*").eq("cenario_id", cenarioA).order("created_at") : Promise.resolve({ data: [] }),
    cenarioB ? supabase.from("alocacao_investimento").select("*").eq("cenario_id", cenarioB).order("created_at") : Promise.resolve({ data: [] }),
  ]);

  // Período de análise pro gráfico e pros indicadores acumulados — nunca o horizonte completo
  // (60 meses) por padrão, senão os números somem diluídos numa janela grande demais pra decisão.
  const mesesPeriodo = periodo === "12" ? 12 : periodo === "36" ? 36 : periodo === "tudo" ? Infinity : 24;
  const linhasPeriodoA = resumoA.linhas.slice(0, mesesPeriodo);
  const linhasPeriodoB = resumoB.linhas.slice(0, mesesPeriodo);

  const semDados = resumoA.linhas.length === 0 && resumoB.linhas.length === 0;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-[13px] text-text-muted">Resultado consolidado (todos os produtos) de um cenário contra outro</p>
        <Link href="/relatorios/mensal" className="rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-primary-deep">
          Detalhamento Mensal por Produto
        </Link>
      </div>

      <form method="get" className="mb-6 grid grid-cols-[1fr_auto_1fr_auto] items-end gap-4">
        <input type="hidden" name="aba" value="planos" />
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-text-muted">Cenário A</label>
          <select name="a" defaultValue={cenarioA} className="input w-full">
            {(cenarios ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="pb-2.5 text-[11px] uppercase tracking-wide text-text-faint">vs.</div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-text-muted">Cenário B</label>
          <select name="b" defaultValue={cenarioB} className="input w-full">
            {(cenarios ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-text-muted">Período de análise</label>
          <select name="periodo" defaultValue={periodo ?? "24"} className="input w-full">
            <option value="12">Primeiros 12 meses</option>
            <option value="24">Primeiros 24 meses</option>
            <option value="36">Primeiros 36 meses</option>
            <option value="tudo">Horizonte completo</option>
          </select>
        </div>
        <button type="submit" className="col-span-4 rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white">
          Aplicar
        </button>
      </form>

      {semDados ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-text-muted">Nenhum dos dois cenários tem projeção calculada ainda — recalcule em Produtos primeiro.</p>
        </div>
      ) : (
        <>
          <MetricasInvestidor nome={nomeA} resumo={resumoA} />
          {cenarioB && <MetricasInvestidor nome={nomeB} resumo={resumoB} />}

          <ReceitaEIndicadores
            nomeA={nomeA}
            nomeB={nomeB}
            resumoA={resumoA}
            resumoB={resumoB}
            linhasPeriodoA={linhasPeriodoA}
            linhasPeriodoB={linhasPeriodoB}
          />

          <div className="grid grid-cols-2 items-start gap-5">
            <AlocacaoInvestimento cenarioId={cenarioA} itens={alocacoesA ?? []} nomeCenario={nomeA} />
            <AlocacaoInvestimento cenarioId={cenarioB} itens={alocacoesB ?? []} nomeCenario={nomeB} />
          </div>
        </>
      )}
    </>
  );
}

function MetricasInvestidor({ nome, resumo }: { nome: string; resumo: ResumoCenario }) {
  const totalCustos = resumo.linhas.reduce((s, l) => s + (l.receita - l.ebitda), 0);
  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 font-heading text-sm font-semibold">Métricas para investidor — {nome}</h2>
      <div className="grid grid-cols-5 gap-4">
        <Metrica
          label="Meta"
          valor={resumo.clientes12Meses != null ? `${resumo.clientes12Meses.toLocaleString("pt-BR")} clientes` : "—"}
          detalhe="pagantes em 12 meses"
        />
        <Metrica
          label="Break-even"
          valor={resumo.breakEvenMes ? formatMes(resumo.breakEvenMes) : "não atingido"}
          detalhe={resumo.breakEvenClientes != null ? `com ${resumo.breakEvenClientes.toLocaleString("pt-BR")} clientes` : "no período simulado"}
        />
        <Metrica
          label="Margem operacional"
          valor={resumo.linhas.reduce((s, l) => s + l.receita, 0) > 0 ? `${((resumo.ebitdaAcumulado / resumo.linhas.reduce((s, l) => s + l.receita, 0)) * 100).toFixed(0)}%` : "—"}
          detalhe="EBITDA / receita, todo o período"
        />
        <Metrica label="Investimento em equipe e operação" valor={formatBRL(totalCustos)} detalhe="custo total acumulado" />
        <Metrica
          label="Retorno do investimento"
          valor={resumo.totalInvestido > 0 ? (resumo.paybackMes ? formatMes(resumo.paybackMes) : "não recuperado no período") : "sem captação vinculada"}
          detalhe={resumo.totalInvestido > 0 ? `capital de ${formatBRL(resumo.totalInvestido)} recuperado` : "cenário sem investimento"}
        />
      </div>
    </div>
  );
}

function Metrica({ label, valor, detalhe }: { label: string; valor: string; detalhe: string }) {
  return (
    <div className="rounded-lg bg-bg p-3">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-text-faint">{label}</div>
      <div className="mt-1 text-[16px] font-semibold text-text">{valor}</div>
      <div className="mt-0.5 text-[10.5px] text-text-muted">{detalhe}</div>
    </div>
  );
}

function ReceitaEIndicadores({
  nomeA,
  nomeB,
  resumoA,
  resumoB,
  linhasPeriodoA,
  linhasPeriodoB,
}: {
  nomeA: string;
  nomeB: string;
  resumoA: ResumoCenario;
  resumoB: ResumoCenario;
  linhasPeriodoA: Agregado[];
  linhasPeriodoB: Agregado[];
}) {
  const receitasA = linhasPeriodoA.map((l) => l.receita);
  const receitasB = linhasPeriodoB.map((l) => l.receita);
  const width = 1050;
  const height = 200;
  const min = 0;
  const max = Math.max(1, ...receitasA, ...receitasB);

  const totalReceitaA = receitasA.reduce((s, v) => s + v, 0);
  const totalReceitaB = receitasB.reduce((s, v) => s + v, 0);
  const clientesFinalA = linhasPeriodoA[linhasPeriodoA.length - 1]?.clientes ?? 0;
  const clientesFinalB = linhasPeriodoB[linhasPeriodoB.length - 1]?.clientes ?? 0;
  const ebitdaPeriodoA = linhasPeriodoA.reduce((s, l) => s + l.ebitda, 0);
  const ebitdaPeriodoB = linhasPeriodoB.reduce((s, l) => s + l.ebitda, 0);
  const custosPeriodoA = linhasPeriodoA.reduce((s, l) => s + (l.receita - l.ebitda), 0);
  const custosPeriodoB = linhasPeriodoB.reduce((s, l) => s + (l.receita - l.ebitda), 0);

  return (
    <>
      <div className="mb-5 rounded-xl border border-border bg-surface p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">
            Receita consolidada — {nomeA} x {nomeB}
          </h2>
        </div>
        <div className="mb-3 flex items-center gap-4">
          <Legenda cor="var(--color-text-faint)" texto={nomeA} />
          <Legenda cor="var(--color-primary-fill)" texto={nomeB} />
        </div>
        <svg viewBox={`0 0 ${width} ${height + 10}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
          <line x1="0" y1={height} x2={width} y2={height} stroke="var(--color-border)" strokeWidth={1} />
          <path d={buildPath(receitasA, width, height, min, max)} fill="none" stroke="var(--color-text-faint)" strokeWidth={2.5} />
          <path d={buildPath(receitasB, width, height, min, max)} fill="none" stroke="var(--color-primary-fill)" strokeWidth={2.5} />
        </svg>
      </div>

      <div className="mb-5 rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 font-heading text-sm font-semibold">Indicadores no período selecionado</h2>
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-text-muted">
              <td className="px-2 py-1.5 font-medium">Indicador</td>
              <td className="px-2 py-1.5 text-right font-medium">{nomeA}</td>
              <td className="px-2 py-1.5 text-right font-medium">{nomeB}</td>
              <td className="px-2 py-1.5 text-right font-medium">Diferença</td>
            </tr>
          </thead>
          <tbody>
            <LinhaComparativa label="Receita acumulada" a={totalReceitaA} b={totalReceitaB} formato="brl" />
            <tr className="border-t border-border-soft">
              <td className="flex items-center px-2 py-2.5">
                (–) Custos totais (produtos + empresa)
                <InfoTooltip texto="Custos diretos dos produtos somados aos custos compartilhados da empresa (contador, jurídico, escritório, cloud, equipe comercial etc.), no período selecionado." />
              </td>
              <td className="px-2 py-2.5 text-right font-mono text-danger">− {formatBRL(custosPeriodoA)}</td>
              <td className="px-2 py-2.5 text-right font-mono text-danger">− {formatBRL(custosPeriodoB)}</td>
              <td className="px-2 py-2.5 text-right font-mono text-text-faint">—</td>
            </tr>
            <LinhaComparativa label="(=) EBITDA no período" a={ebitdaPeriodoA} b={ebitdaPeriodoB} formato="brl" />
            <tr className="border-t border-border-soft">
              <td className="px-2 py-2.5">Clientes ativos (fim do período)</td>
              <td className="px-2 py-2.5 text-right font-mono">{clientesFinalA.toLocaleString("pt-BR")}</td>
              <td className="px-2 py-2.5 text-right font-mono">{clientesFinalB.toLocaleString("pt-BR")}</td>
              <td className="px-2 py-2.5 text-right font-mono">
                {clientesFinalB - clientesFinalA >= 0 ? "+" : ""}
                {(clientesFinalB - clientesFinalA).toLocaleString("pt-BR")}
              </td>
            </tr>
            <tr className="border-t border-border-soft">
              <td className="flex items-center px-2 py-2.5">
                CAC médio (all-in)
                <InfoTooltip texto="CAC ponderado pelos clientes novos de cada mês — quanto custou, em média, adquirir cada cliente ao longo de todo o período simulado (não limitado pelo seletor de período)." />
              </td>
              <td className="px-2 py-2.5 text-right font-mono">{resumoA.cacMedio != null ? formatBRL(resumoA.cacMedio) : "—"}</td>
              <td className="px-2 py-2.5 text-right font-mono">{resumoB.cacMedio != null ? formatBRL(resumoB.cacMedio) : "—"}</td>
              <td className="px-2 py-2.5 text-right font-mono text-text-faint">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-[2px] w-3.5" style={{ background: cor }} />
      <span className="text-[11px] text-text-muted">{texto}</span>
    </div>
  );
}

function LinhaComparativa({ label, a, b, formato }: { label: string; a: number; b: number; formato: "brl" }) {
  const diff = b - a;
  const fmt = formato === "brl" ? formatBRL : (v: number) => v.toString();
  return (
    <tr className="border-t border-border-soft">
      <td className="px-2 py-2.5">{label}</td>
      <td className="px-2 py-2.5 text-right font-mono">{fmt(a)}</td>
      <td className="px-2 py-2.5 text-right font-mono">{fmt(b)}</td>
      <td className={`px-2 py-2.5 text-right font-mono ${diff >= 0 ? "text-success" : "text-danger"}`}>
        {diff >= 0 ? "+" : ""}
        {fmt(diff)}
      </td>
    </tr>
  );
}
