import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InfoTooltip } from "@/components/info-tooltip";
import { AlocacaoInvestimento } from "./alocacao-investimento";
import { custoEmpresaNoMes, faseDoProdutoNoMes, type CustoEmpresaInput } from "@/lib/custos-empresa";
import type { FaseValue } from "@/lib/fases";
import { custoMensalModelo, type ParametrosModelo, type TipoModelo } from "@/lib/modelos-contratacao";
import { calcularDemandaPorCargo, type FaseProdutoInput, type FunilPremissaInput, type SimulacaoMesInput } from "@/lib/necessidade-contratacao";
import { calcularImpostoSimples } from "@/lib/impostos";

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
  searchParams: Promise<{ aba?: string; cenario?: string; inicio?: string; fim?: string }>;
}) {
  const { aba, cenario, inicio, fim } = await searchParams;
  // "Real" só é acessível pelo menu Realizado, "Planos" só pelo menu Construção de Cenários —
  // sem seletor de aba na tela, cada entrada do menu já manda direto pro relatório certo.
  const abaAtual = aba === "planos" ? "planos" : "real";

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">{abaAtual === "real" ? "Relatórios — Realizado" : "Relatórios — Construção de Cenários"}</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          {abaAtual === "real"
            ? "O que de fato está acontecendo na empresa — custos e vendas já realizados"
            : "Planejamento — projeção de receitas e despesas mês a mês, por cenário"}
        </p>
      </div>

      {abaAtual === "real" ? <RelatorioReal /> : <RelatorioPlanos cenario={cenario} inicio={inicio} fim={fim} />}
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

type Agregado = {
  mes_referencia: string;
  receita: number;
  ebitdaProdutos: number;
  clientes: number;
  custosEmpresa: number;
  ebitda: number;
  cogs: number;
  novosClientes: number;
  cacPonderado: number;
  churnPonderado: number;
  ltvPonderado: number;
  custoCLT: number;
  impostoMensal: number;
  aliquotaEfetivaImposto: number | null;
};

type ResumoCenario = {
  linhas: Agregado[];
  totalInvestido: number;
};

type Metricas = {
  receitaAcumulada: number;
  ebitdaAcumulado: number;
  custosAcumulados: number;
  margemOperacional: number | null;
  margemBruta: number | null;
  impostosAcumulados: number;
  churnMedio: number | null;
  ltvMedio: number | null;
  clientesInicio: number;
  clientesFinal: number;
  cacMedio: number | null;
  breakEvenMes: string | null;
  breakEvenClientes: number | null;
  paybackMes: string | null;
};

/** Todas as métricas calculadas só a partir das linhas já filtradas pro período selecionado —
 * break-even e payback recomeçam do zero no início do período, não carregam saldo de fora dele. */
function computeMetricas(linhas: Agregado[], totalInvestido: number): Metricas {
  const receitaAcumulada = linhas.reduce((s, l) => s + l.receita, 0);
  const ebitdaAcumulado = linhas.reduce((s, l) => s + l.ebitda, 0);
  const custosAcumulados = receitaAcumulada - ebitdaAcumulado;
  const margemOperacional = receitaAcumulada > 0 ? (ebitdaAcumulado / receitaAcumulada) * 100 : null;
  // Margem bruta: receita (–) COGS direto dos produtos (–) deduções e impostos sobre a receita.
  // Diferente da margem operacional, que desconta TODOS os custos (inclusive S&M, P&D, G&A e os
  // custos compartilhados da empresa). Imposto = DAS do Simples Nacional (Anexo III ou V conforme
  // o Fator R), calculado mês a mês em agregarPorCenario com o RBT12 real da linha do tempo.
  const cogsAcumulado = linhas.reduce((s, l) => s + l.cogs, 0);
  const impostosAcumulados = linhas.reduce((s, l) => s + l.impostoMensal, 0);
  const margemBruta = receitaAcumulada > 0 ? ((receitaAcumulada - cogsAcumulado - impostosAcumulados) / receitaAcumulada) * 100 : null;
  const clientesInicio = linhas[0]?.clientes ?? 0;
  const clientesFinal = linhas[linhas.length - 1]?.clientes ?? 0;

  let somaCacPonderado = 0;
  let somaNovosClientes = 0;
  let somaChurnPonderado = 0;
  let somaLtvPonderado = 0;
  let somaClientesPeso = 0;
  let acumulado = 0;
  let breakEvenMes: string | null = null;
  let breakEvenClientes: number | null = null;
  let acumuladoPayback = 0;
  let paybackMes: string | null = null;

  for (const [i, l] of linhas.entries()) {
    acumulado += l.ebitda;
    if (breakEvenMes === null && acumulado >= 0 && i > 0) {
      breakEvenMes = l.mes_referencia;
      breakEvenClientes = l.clientes;
    }
    if (totalInvestido > 0 && paybackMes === null) {
      acumuladoPayback += l.ebitda;
      if (acumuladoPayback >= totalInvestido) paybackMes = l.mes_referencia;
    }
    somaCacPonderado += l.cacPonderado;
    somaNovosClientes += l.novosClientes;
    somaChurnPonderado += l.churnPonderado;
    somaLtvPonderado += l.ltvPonderado;
    somaClientesPeso += l.clientes;
  }

  return {
    receitaAcumulada,
    ebitdaAcumulado,
    custosAcumulados,
    margemOperacional,
    margemBruta,
    impostosAcumulados,
    churnMedio: somaClientesPeso > 0 ? (somaChurnPonderado / somaClientesPeso) * 100 : null,
    ltvMedio: somaClientesPeso > 0 ? somaLtvPonderado / somaClientesPeso : null,
    clientesInicio,
    clientesFinal,
    cacMedio: somaNovosClientes > 0 ? somaCacPonderado / somaNovosClientes : null,
    breakEvenMes,
    breakEvenClientes,
    paybackMes,
  };
}

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
  if (!cenarioId) return { linhas: [], totalInvestido: 0 };

  const [{ data: simRows }, { data: vinculos }, { data: custosEmpresaRaw }, { data: alocacoesRaw }, { data: modelosRaw }, { data: fasesRaw }] =
    await Promise.all([
      supabase
        .from("simulacao_mensal")
        .select("produto_id, mes_referencia, receita_bruta, ebitda, cogs, clientes_ativos, cac_all_in, novos_clientes, churn_pct, ltv")
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (simRows ?? []) as any[]) {
    const atual =
      porMes.get(row.mes_referencia) ??
      ({
        mes_referencia: row.mes_referencia,
        receita: 0,
        ebitdaProdutos: 0,
        clientes: 0,
        custosEmpresa: 0,
        ebitda: 0,
        cogs: 0,
        novosClientes: 0,
        cacPonderado: 0,
        churnPonderado: 0,
        ltvPonderado: 0,
        custoCLT: 0,
        impostoMensal: 0,
        aliquotaEfetivaImposto: null,
      } satisfies Agregado);
    atual.receita += Number(row.receita_bruta);
    atual.ebitdaProdutos += Number(row.ebitda);
    atual.clientes += Number(row.clientes_ativos);
    atual.cogs += Number(row.cogs ?? 0);
    porMes.set(row.mes_referencia, atual);

    const novos = Number(row.novos_clientes ?? 0);
    if (row.cac_all_in != null && novos > 0) {
      atual.cacPonderado += Number(row.cac_all_in) * novos;
      atual.novosClientes += novos;
    }
    // Churn e LTV ponderados pelos clientes ativos do produto naquele mês — dá a média
    // consolidada certa em vez de simplesmente somar taxas de produtos diferentes.
    const clientesRow = Number(row.clientes_ativos ?? 0);
    if (row.churn_pct != null) atual.churnPonderado += Number(row.churn_pct) * clientesRow;
    if (row.ltv != null) atual.ltvPonderado += Number(row.ltv) * clientesRow;
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
      const custoModelo = custoMensalModelo(tipo, modelo.parametros, demandaEquivalente).custoMensal;
      custosEmpresa += custoModelo;
      // Folha CLT (pra Fator R do Simples) — só enxerga CLT contratado via Modelos de Contratação
      // (SDR/Coordenador/Suporte); CLT lançado direto em Equipe Alocada/Contratações por produto
      // não entra aqui ainda, então o Fator R pode ficar subestimado se você tiver CLT só lá.
      if (tipo === "clt") atual.custoCLT += custoModelo;
    }

    atual.custosEmpresa = custosEmpresa;
    atual.ebitda = atual.ebitdaProdutos - custosEmpresa;
  }

  const linhas = [...porMes.values()].sort((a, b) => (a.mes_referencia < b.mes_referencia ? -1 : 1));

  // Simples Nacional: RBT12 e Folha+Pró-labore 12m são sempre a JANELA DOS 12 MESES ANTERIORES ao
  // mês corrente (não incluem o próprio mês — é assim que a Receita Federal calcula o DAS). Sem
  // 12 meses de histórico ainda, anualizamos a média disponível como estimativa.
  for (let i = 0; i < linhas.length; i++) {
    const janela = linhas.slice(Math.max(0, i - 12), i);
    const rbt12 =
      janela.length >= 12
        ? janela.reduce((s, l) => s + l.receita, 0)
        : janela.length > 0
          ? (janela.reduce((s, l) => s + l.receita, 0) / janela.length) * 12
          : linhas[i].receita * 12;
    const folha12 =
      janela.length >= 12
        ? janela.reduce((s, l) => s + l.custoCLT, 0)
        : janela.length > 0
          ? (janela.reduce((s, l) => s + l.custoCLT, 0) / janela.length) * 12
          : linhas[i].custoCLT * 12;
    const fatorR = rbt12 > 0 ? folha12 / rbt12 : 0;
    const resultado = calcularImpostoSimples(linhas[i].receita, rbt12, fatorR);
    linhas[i].impostoMensal = resultado.impostoMensal;
    linhas[i].aliquotaEfetivaImposto = resultado.aliquotaEfetiva;
  }

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

  return { linhas, totalInvestido };
}

async function RelatorioPlanos({ cenario, inicio, fim }: { cenario?: string; inicio?: string; fim?: string }) {
  const supabase = await createClient();

  const { data: cenarios } = await supabase.from("cenarios").select("id, nome, is_base").order("created_at");

  const cenarioId = cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";
  const nome = (cenarios ?? []).find((c) => c.id === cenarioId)?.nome ?? "—";

  const resumo = await agregarPorCenario(supabase, cenarioId);

  const { data: alocacoes } = cenarioId
    ? await supabase.from("alocacao_investimento").select("*").eq("cenario_id", cenarioId).order("created_at")
    : { data: [] };

  // Período de análise: todo o horizonte simulado por padrão, recortado pro intervalo de mês
  // escolhido — mes_referencia é sempre "AAAA-MM-01", os inputs <input type="month"> mandam
  // "AAAA-MM", então completamos com "-01" pra comparar.
  const primeiroMes = resumo.linhas[0]?.mes_referencia ?? null;
  const ultimoMes = resumo.linhas[resumo.linhas.length - 1]?.mes_referencia ?? null;
  const inicioEfetivo = inicio ? `${inicio}-01` : (primeiroMes ?? "");
  const fimEfetivo = fim ? `${fim}-01` : (ultimoMes ?? "");
  const linhasPeriodo = resumo.linhas.filter((l) => l.mes_referencia >= inicioEfetivo && l.mes_referencia <= fimEfetivo);

  const metricas = computeMetricas(linhasPeriodo, resumo.totalInvestido);

  const semDados = resumo.linhas.length === 0;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-[13px] text-text-muted">Resultado consolidado (todos os produtos) do cenário selecionado</p>
        <Link href="/relatorios/mensal" className="rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-primary-deep">
          Detalhamento Mensal por Produto
        </Link>
      </div>

      <form method="get" className="mb-6 grid grid-cols-[1fr_auto_auto_auto] items-end gap-4">
        <input type="hidden" name="aba" value="planos" />
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-text-muted">Cenário</label>
          <select name="cenario" defaultValue={cenarioId} className="input w-full">
            {(cenarios ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-text-muted">De</label>
          <input type="month" name="inicio" defaultValue={inicio ?? (primeiroMes ? primeiroMes.slice(0, 7) : "")} className="input" />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-text-muted">Até</label>
          <input type="month" name="fim" defaultValue={fim ?? (ultimoMes ? ultimoMes.slice(0, 7) : "")} className="input" />
        </div>
        <button type="submit" className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white">
          Aplicar
        </button>
      </form>

      {semDados ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-text-muted">Nenhuma projeção calculada nesse cenário ainda — recalcule em Produtos primeiro.</p>
        </div>
      ) : (
        <>
          <MetricasInvestidor nome={nome} metricas={metricas} totalInvestido={resumo.totalInvestido} />
          <ReceitaEIndicadores nome={nome} linhasPeriodo={linhasPeriodo} metricas={metricas} />
          <AlocacaoInvestimento cenarioId={cenarioId} itens={alocacoes ?? []} nomeCenario={nome} />
        </>
      )}
    </>
  );
}

function MetricasInvestidor({ nome, metricas, totalInvestido }: { nome: string; metricas: Metricas; totalInvestido: number }) {
  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 font-heading text-sm font-semibold">Métricas para investidor — {nome}</h2>
      <div className="grid grid-cols-4 gap-4">
        <Metrica
          label="Meta do período"
          valor={`${metricas.clientesFinal.toLocaleString("pt-BR")} clientes`}
          detalhe="pagantes ao fim do período"
        />
        <Metrica
          label="Break-even"
          valor={metricas.breakEvenMes ? formatMes(metricas.breakEvenMes) : "não atingido"}
          detalhe={metricas.breakEvenClientes != null ? `com ${metricas.breakEvenClientes.toLocaleString("pt-BR")} clientes` : "no período selecionado"}
        />
        <Metrica
          label="Margem operacional"
          valor={metricas.margemOperacional != null ? `${metricas.margemOperacional.toFixed(0)}%` : "—"}
          detalhe="EBITDA / receita, no período"
        />
        <Metrica
          label="Margem bruta"
          valor={metricas.margemBruta != null ? `${metricas.margemBruta.toFixed(0)}%` : "—"}
          detalhe={
            metricas.receitaAcumulada > 0
              ? `receita − COGS − ${((metricas.impostosAcumulados / metricas.receitaAcumulada) * 100).toFixed(1)}% DAS (Simples)`
              : "receita − COGS − impostos"
          }
        />
        <Metrica
          label="CAC (all-in)"
          valor={metricas.cacMedio != null ? formatBRL(metricas.cacMedio) : "—"}
          detalhe="custo médio por cliente adquirido"
        />
        <Metrica
          label="LTV"
          valor={metricas.ltvMedio != null ? formatBRL(metricas.ltvMedio) : "—"}
          detalhe="valor médio projetado por cliente"
        />
        <Metrica
          label="Churn médio"
          valor={metricas.churnMedio != null ? `${metricas.churnMedio.toFixed(1)}%/mês` : "—"}
          detalhe="ponderado pelos clientes ativos"
        />
        <Metrica
          label="Retorno do investimento"
          valor={totalInvestido > 0 ? (metricas.paybackMes ? formatMes(metricas.paybackMes) : "não recuperado no período") : "sem captação vinculada"}
          detalhe={totalInvestido > 0 ? `capital de ${formatBRL(totalInvestido)} recuperado` : "cenário sem investimento"}
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

function ReceitaEIndicadores({ nome, linhasPeriodo, metricas }: { nome: string; linhasPeriodo: Agregado[]; metricas: Metricas }) {
  const receitas = linhasPeriodo.map((l) => l.receita);
  const width = 1050;
  const height = 200;
  const min = 0;
  const max = Math.max(1, ...receitas);

  return (
    <>
      <div className="mb-5 rounded-xl border border-border bg-surface p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">Receita consolidada — {nome}</h2>
        </div>
        <svg viewBox={`0 0 ${width} ${height + 10}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
          <line x1="0" y1={height} x2={width} y2={height} stroke="var(--color-border)" strokeWidth={1} />
          <path d={buildPath(receitas, width, height, min, max)} fill="none" stroke="var(--color-primary-fill)" strokeWidth={2.5} />
        </svg>
      </div>

      <div className="mb-5 rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 font-heading text-sm font-semibold">Indicadores no período selecionado</h2>
        <table className="w-full border-collapse text-[12.5px]">
          <tbody>
            <tr className="border-t border-border-soft">
              <td className="px-2 py-2.5">Receita acumulada</td>
              <td className="px-2 py-2.5 text-right font-mono">{formatBRL(metricas.receitaAcumulada)}</td>
            </tr>
            <tr className="border-t border-border-soft">
              <td className="flex items-center px-2 py-2.5">
                (–) Custos totais (produtos + empresa)
                <InfoTooltip texto="Custos diretos dos produtos somados aos custos compartilhados da empresa (contador, jurídico, escritório, cloud, equipe comercial etc.), no período selecionado." />
              </td>
              <td className="px-2 py-2.5 text-right font-mono text-danger">− {formatBRL(metricas.custosAcumulados)}</td>
            </tr>
            <tr className="border-t border-border-soft bg-wine-soft">
              <td className="px-2 py-2.5 font-semibold">(=) EBITDA no período</td>
              <td className={`px-2 py-2.5 text-right font-mono font-semibold ${metricas.ebitdaAcumulado < 0 ? "text-danger" : "text-success"}`}>
                {formatBRL(metricas.ebitdaAcumulado)}
              </td>
            </tr>
            <tr className="border-t border-border-soft">
              <td className="flex items-center px-2 py-2.5">
                (–) DAS — Simples Nacional <span className="ml-1 text-text-faint">(só pra margem bruta acima)</span>
                <InfoTooltip texto="Simples Nacional, Anexo III (Fator R ≥ 28%) ou Anexo V (< 28%), calculado mês a mês pelo RBT12 (receita dos 12 meses anteriores) e pela folha CLT acumulada — hoje só enxerga CLT contratado via Modelos de Contratação (SDR/Coordenador/Suporte), não CLT lançado direto em Equipe Alocada por produto. Entra só no cálculo da margem bruta, não é subtraído do EBITDA acima." />
              </td>
              <td className="px-2 py-2.5 text-right font-mono text-danger">− {formatBRL(metricas.impostosAcumulados)}</td>
            </tr>
            <tr className="border-t border-border-soft">
              <td className="px-2 py-2.5">Clientes ativos (início → fim do período)</td>
              <td className="px-2 py-2.5 text-right font-mono">
                {metricas.clientesInicio.toLocaleString("pt-BR")} → {metricas.clientesFinal.toLocaleString("pt-BR")}
              </td>
            </tr>
            <tr className="border-t border-border-soft">
              <td className="flex items-center px-2 py-2.5">
                CAC médio (all-in)
                <InfoTooltip texto="CAC ponderado pelos clientes novos de cada mês — quanto custou, em média, adquirir cada cliente, dentro do período selecionado." />
              </td>
              <td className="px-2 py-2.5 text-right font-mono">{metricas.cacMedio != null ? formatBRL(metricas.cacMedio) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

