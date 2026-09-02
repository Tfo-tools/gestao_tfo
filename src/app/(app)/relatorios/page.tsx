import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InfoTooltip } from "@/components/info-tooltip";
import { AlocacaoInvestimento } from "./alocacao-investimento";
import { agregarPorCenario, computeMetricas, type Agregado, type Metricas } from "@/lib/relatorios-cenario";

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
          <MetricasInvestidor
            nome={nome}
            metricas={metricas}
            totalInvestido={resumo.totalInvestido}
            cenarioId={cenarioId}
            inicio={inicio ?? (primeiroMes ? primeiroMes.slice(0, 7) : "")}
            fim={fim ?? (ultimoMes ? ultimoMes.slice(0, 7) : "")}
          />
          <ReceitaEIndicadores nome={nome} linhasPeriodo={linhasPeriodo} metricas={metricas} />
          <AlocacaoInvestimento cenarioId={cenarioId} itens={alocacoes ?? []} nomeCenario={nome} />
        </>
      )}
    </>
  );
}

function MetricasInvestidor({
  nome,
  metricas,
  totalInvestido,
  cenarioId,
  inicio,
  fim,
}: {
  nome: string;
  metricas: Metricas;
  totalInvestido: number;
  cenarioId: string;
  inicio: string;
  fim: string;
}) {
  function hrefDetalhe(indicador: string) {
    return `/relatorios/detalhe?indicador=${indicador}&cenario=${cenarioId}&inicio=${inicio}&fim=${fim}`;
  }

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-sm font-semibold">Métricas para investidor — {nome}</h2>
      <p className="mb-4 text-[11px] text-text-muted">Clique num indicador pra ver o cálculo mês a mês e ajustar os lançamentos por trás dele</p>
      <div className="grid grid-cols-4 gap-4">
        <Metrica
          href={hrefDetalhe("meta")}
          label="Meta do período"
          valor={`${metricas.clientesFinal.toLocaleString("pt-BR")} clientes`}
          detalhe="pagantes ao fim do período"
        />
        <Metrica
          href={hrefDetalhe("break_even")}
          label="Break-even"
          valor={metricas.breakEvenMes ? formatMes(metricas.breakEvenMes) : "não atingido"}
          detalhe={metricas.breakEvenClientes != null ? `com ${metricas.breakEvenClientes.toLocaleString("pt-BR")} clientes` : "no período selecionado"}
        />
        <Metrica
          href={hrefDetalhe("margem_operacional")}
          label="Margem operacional"
          valor={metricas.margemOperacional != null ? `${metricas.margemOperacional.toFixed(0)}%` : "—"}
          detalhe="EBITDA / receita, no período"
        />
        <Metrica
          href={hrefDetalhe("margem_bruta")}
          label="Margem bruta"
          valor={metricas.margemBruta != null ? `${metricas.margemBruta.toFixed(0)}%` : "—"}
          detalhe={
            metricas.receitaAcumulada > 0
              ? `receita − COGS − ${((metricas.impostosAcumulados / metricas.receitaAcumulada) * 100).toFixed(1)}% DAS (Simples)`
              : "receita − COGS − impostos"
          }
        />
        <Metrica
          href={hrefDetalhe("cac")}
          label="CAC (all-in)"
          valor={metricas.cacMedio != null ? formatBRL(metricas.cacMedio) : "—"}
          detalhe="custo médio por cliente adquirido"
        />
        <Metrica
          href={hrefDetalhe("ltv")}
          label="LTV"
          valor={metricas.ltvMedio != null ? formatBRL(metricas.ltvMedio) : "—"}
          detalhe="valor médio projetado por cliente"
        />
        <Metrica
          href={hrefDetalhe("churn")}
          label="Churn médio"
          valor={metricas.churnMedio != null ? `${metricas.churnMedio.toFixed(1)}%/mês` : "—"}
          detalhe="ponderado pelos clientes ativos"
        />
        <Metrica
          href={hrefDetalhe("retorno_investimento")}
          label="Retorno do investimento"
          valor={totalInvestido > 0 ? (metricas.paybackMes ? formatMes(metricas.paybackMes) : "não recuperado no período") : "sem captação vinculada"}
          detalhe={totalInvestido > 0 ? `capital de ${formatBRL(totalInvestido)} recuperado` : "cenário sem investimento"}
        />
      </div>
    </div>
  );
}

function Metrica({ href, label, valor, detalhe }: { href: string; label: string; valor: string; detalhe: string }) {
  return (
    <Link href={href} className="block rounded-lg bg-bg p-3 transition-colors hover:bg-primary-soft/40">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-text-faint">{label}</div>
      <div className="mt-1 text-[16px] font-semibold text-text">{valor}</div>
      <div className="mt-0.5 text-[10.5px] text-text-muted">{detalhe}</div>
    </Link>
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

