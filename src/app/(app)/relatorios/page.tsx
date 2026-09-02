import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InfoTooltip } from "@/components/info-tooltip";
import { AlocacaoInvestimento } from "./alocacao-investimento";
import { agregarPorCenario, computeMetricas, type Agregado, type Metricas } from "@/lib/relatorios-cenario";
import { grupoLabelDe } from "@/lib/grupo-dre";

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

const grupoDe = grupoLabelDe;

type DespesaGrupoRow = {
  data_gasto: string;
  valor_total: number;
  plano_contas_id: string | null;
  plano_contas: { codigo: string; conta: string; tipo: string } | null;
};

async function RelatorioReal() {
  const supabase = await createClient();

  const [{ data: despesas }, { data: receitasReais }] = await Promise.all([
    supabase.from("despesas").select("data_gasto, valor_total, plano_contas_id, plano_contas:plano_contas_id(codigo, conta, tipo)"),
    // Nenhuma tabela de receita realizada existe ainda — fica pronto pro dia em que houver vendas reais.
    Promise.resolve({ data: [] as { data_venda: string; valor: number }[] }),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const despesasTyped = (despesas ?? []) as any as DespesaGrupoRow[];

  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Mesma cascata de DRE da aba Planos: Receita (–) COGS (–) Impostos (=) Margem Bruta (–) S&M
  // (–) P&D (–) G&A (=) EBITDA — pra manter as duas telas comparáveis, mesmo sem receita lançada.
  let cogsMes = 0, cogsAcum = 0, smMes = 0, smAcum = 0, pdMes = 0, pdAcum = 0, gaMes = 0, gaAcum = 0, outrasMes = 0, outrasAcum = 0;
  for (const d of despesasTyped) {
    const conta = d.plano_contas;
    if (!conta) continue;
    const grupo = grupoDe(conta.codigo, conta.tipo);
    const valor = Number(d.valor_total);
    const noMes = d.data_gasto.startsWith(mesAtual);
    if (grupo === "COGS") {
      cogsAcum += valor;
      if (noMes) cogsMes += valor;
    } else if (grupo === "S&M") {
      smAcum += valor;
      if (noMes) smMes += valor;
    } else if (grupo === "P&D") {
      pdAcum += valor;
      if (noMes) pdMes += valor;
    } else if (grupo === "G&A") {
      gaAcum += valor;
      if (noMes) gaMes += valor;
    } else {
      outrasAcum += valor;
      if (noMes) outrasMes += valor;
    }
  }

  const receitaMes = (receitasReais ?? []).filter((r) => r.data_venda.startsWith(mesAtual)).reduce((s, r) => s + r.valor, 0);
  const receitaAcumulada = (receitasReais ?? []).reduce((s, r) => s + r.valor, 0);

  // Sem série mensal de receita real ainda (Vendas não está implementada), o DAS fica em zero —
  // a linha aparece pela estrutura, calcula de verdade assim que houver receita real lançada.
  const impostosMes = 0;
  const impostosAcum = 0;
  const margemBrutaMes = receitaMes - cogsMes - impostosMes;
  const margemBrutaAcum = receitaAcumulada - cogsAcum - impostosAcum;
  const ebitdaMes = margemBrutaMes - smMes - pdMes - gaMes;
  const ebitdaAcumulado = margemBrutaAcum - smAcum - pdAcum - gaAcum;

  return (
    <>
      <div className="mb-5 rounded-xl border border-border bg-surface p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">Demonstrativo de Resultado — Real</h2>
          {receitaAcumulada === 0 && <span className="text-[11px] text-text-faint">receita ainda não lançada — período pré-operacional</span>}
        </div>
        <table className="mt-4 w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="px-2 py-2 font-medium">Linha</th>
              <th className="px-2 py-2 text-right font-medium">{mesAtual}</th>
              <th className="px-2 py-2 text-right font-medium">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            <LinhaDreReal label="Receita Operacional Bruta" mes={receitaMes} acumulado={receitaAcumulada} />
            <LinhaDreReal
              label="(–) Custo dos Serviços Prestados (COGS)"
              mes={cogsMes}
              acumulado={cogsAcum}
              negativo
              tooltip={GRUPO_TOOLTIP.COGS}
              href="/relatorios/linha?grupo=cogs"
            />
            <LinhaDreReal
              label="(–) Deduções e Impostos sobre Receita"
              mes={impostosMes}
              acumulado={impostosAcum}
              negativo
              tooltip="DAS do Simples Nacional — calculado de verdade assim que houver receita real lançada mês a mês (tela Vendas)."
            />
            <LinhaDreReal label="(=) Margem Bruta" mes={margemBrutaMes} acumulado={margemBrutaAcum} total />
            <LinhaDreReal
              label="(–) Vendas e Marketing (S&M)"
              mes={smMes}
              acumulado={smAcum}
              negativo
              tooltip={GRUPO_TOOLTIP["S&M"]}
              href="/relatorios/linha?grupo=sm"
            />
            <LinhaDreReal
              label="(–) Pesquisa e Desenvolvimento (P&D)"
              mes={pdMes}
              acumulado={pdAcum}
              negativo
              tooltip={GRUPO_TOOLTIP["P&D"]}
              href="/relatorios/linha?grupo=pd"
            />
            <LinhaDreReal
              label="(–) Geral e Administrativo (G&A)"
              mes={gaMes}
              acumulado={gaAcum}
              negativo
              tooltip={GRUPO_TOOLTIP["G&A"]}
              href="/relatorios/linha?grupo=ga"
            />
            <tr className="border-t-2 border-text bg-wine-soft">
              <td className="flex items-center px-2 py-2.5 font-bold">
                <Link href="/relatorios/linha" className="underline decoration-dotted underline-offset-2 hover:decoration-solid">
                  (=) EBITDA real — ver detalhamento →
                </Link>
                <InfoTooltip texto="EBITDA = lucro antes de juros, impostos, depreciação e amortização — aqui calculado só com o que já foi de fato faturado e gasto, sem projeção." />
              </td>
              <td className={`px-2 py-2.5 text-right font-mono font-bold ${ebitdaMes < 0 ? "text-danger" : "text-success"}`}>{formatBRL(ebitdaMes)}</td>
              <td className={`px-2 py-2.5 text-right font-mono font-bold ${ebitdaAcumulado < 0 ? "text-danger" : "text-success"}`}>
                {formatBRL(ebitdaAcumulado)}
              </td>
            </tr>
            {outrasAcum !== 0 && (
              <tr className="border-t border-border-soft">
                <td className="flex items-center px-2 py-2.5 text-text-faint">
                  Outras despesas (financeiro/ativos) <span className="ml-1">— fora da DRE operacional</span>
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-text-faint">{formatBRL(outrasMes)}</td>
                <td className="px-2 py-2.5 text-right font-mono text-text-faint">{formatBRL(outrasAcum)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {despesasTyped.length === 0 && (
          <p className="mt-4 text-[13px] text-text-muted">Nenhuma despesa lançada ainda — cadastre em Custos → Lançamentos.</p>
        )}
      </div>

      {receitaAcumulada > 0 ? (
        <div className="mb-5 rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-1 font-heading text-sm font-semibold">Indicadores e receita reais</h2>
          <p className="text-[12px] text-text-muted">
            CAC, LTV, churn e o gráfico de receita real aparecem aqui assim que a tela de Vendas estiver disponível.
          </p>
        </div>
      ) : (
        <p className="mb-5 text-[12px] text-text-faint">
          Indicadores (CAC, LTV, churn) e gráfico de receita real aparecem aqui quando houver vendas reais lançadas.
        </p>
      )}

      <TopCustosChart despesas={despesasTyped} />
    </>
  );
}

function LinhaDreReal({
  label,
  mes,
  acumulado,
  negativo,
  total,
  tooltip,
  href,
}: {
  label: string;
  mes: number;
  acumulado: number;
  negativo?: boolean;
  total?: boolean;
  tooltip?: string;
  href?: string;
}) {
  return (
    <tr className={`border-t border-border-soft ${total ? "bg-bg font-semibold" : ""}`}>
      <td className="flex items-center px-2 py-2.5">
        {href ? (
          <Link href={href} className="underline decoration-dotted underline-offset-2 hover:decoration-solid">
            {label} →
          </Link>
        ) : (
          label
        )}
        {tooltip && <InfoTooltip texto={tooltip} />}
      </td>
      <td className={`px-2 py-2.5 text-right font-mono ${negativo ? "text-danger" : ""}`}>
        {negativo ? `− ${formatBRL(Math.abs(mes))}` : formatBRL(mes)}
      </td>
      <td className={`px-2 py-2.5 text-right font-mono ${negativo ? "text-danger" : ""}`}>
        {negativo ? `− ${formatBRL(Math.abs(acumulado))}` : formatBRL(acumulado)}
      </td>
    </tr>
  );
}

function TopCustosChart({ despesas }: { despesas: DespesaGrupoRow[] }) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-01`;

  const porConta = new Map<string, { id: string; codigo: string; conta: string; valor: number }>();
  for (const d of despesas) {
    if (d.data_gasto < cutoffIso || !d.plano_contas_id || !d.plano_contas) continue;
    const atual = porConta.get(d.plano_contas_id) ?? { id: d.plano_contas_id, codigo: d.plano_contas.codigo, conta: d.plano_contas.conta, valor: 0 };
    atual.valor += Number(d.valor_total);
    porConta.set(d.plano_contas_id, atual);
  }
  const top10 = [...porConta.values()].sort((a, b) => b.valor - a.valor).slice(0, 10);

  if (top10.length === 0) return null;
  const max = Math.max(...top10.map((c) => c.valor));

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-sm font-semibold">10 maiores custos acumulados — últimos 6 meses</h2>
      <p className="mb-4 text-[11px] text-text-muted">Clique numa linha pra ver todos os lançamentos dela no extrato</p>
      <div className="flex flex-col gap-2.5">
        {top10.map((c) => (
          <Link
            key={c.id}
            href={`/custos/extrato?conta=${c.id}&desde=${cutoffIso.slice(0, 7)}`}
            className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-bg"
          >
            <div className="mb-1 flex items-center justify-between text-[12px]">
              <span>
                {c.codigo} {c.conta}
              </span>
              <span className="font-mono font-semibold">{formatBRL(c.valor)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border-soft">
              <div className="h-full rounded-full bg-wine" style={{ width: `${(c.valor / max) * 100}%` }} />
            </div>
          </Link>
        ))}
      </div>
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

  // Aportes/fomentos por mês (data prevista da parcela) — pra linha de investimento no gráfico.
  const { data: vinculosPrograma } = cenarioId
    ? await supabase.from("cenario_programas").select("programa_id").eq("cenario_id", cenarioId)
    : { data: [] };
  const programaIds = ((vinculosPrograma ?? []) as { programa_id: string }[]).map((v) => v.programa_id);
  const { data: parcelasRaw } =
    programaIds.length > 0
      ? await supabase.from("parcelas_investimento").select("valor, data_prevista").in("programa_id", programaIds)
      : { data: [] };
  const investimentoPorMes = new Map<string, number>();
  for (const p of (parcelasRaw ?? []) as { valor: number; data_prevista: string | null }[]) {
    if (!p.data_prevista) continue;
    const mesKey = `${p.data_prevista.slice(0, 7)}-01`;
    investimentoPorMes.set(mesKey, (investimentoPorMes.get(mesKey) ?? 0) + Number(p.valor));
  }

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
          <IndicadoresPeriodo
            metricas={metricas}
            cenarioId={cenarioId}
            inicio={inicio ?? (primeiroMes ? primeiroMes.slice(0, 7) : "")}
            fim={fim ?? (ultimoMes ? ultimoMes.slice(0, 7) : "")}
          />
          <AlocacaoInvestimento cenarioId={cenarioId} itens={alocacoes ?? []} nomeCenario={nome} />
          <GraficoReceitaEInvestimento nome={nome} linhasPeriodo={linhasPeriodo} investimentoPorMes={investimentoPorMes} />
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
          detalhe="fully-loaded: marketing + vendas + outros S&M"
        />
        <Metrica
          href={hrefDetalhe("ltv")}
          label="LTV"
          valor={metricas.ltvMedio != null ? formatBRL(metricas.ltvMedio) : "—"}
          detalhe="ARPU × margem bruta ÷ churn"
        />
        <Metrica
          href={hrefDetalhe("churn")}
          label="Churn médio"
          valor={metricas.churnMedio != null ? `${metricas.churnMedio.toFixed(1)}%/mês` : "—"}
          detalhe="taxa planejada por fase, não realizada"
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

function IndicadoresPeriodo({
  metricas,
  cenarioId,
  inicio,
  fim,
}: {
  metricas: Metricas;
  cenarioId: string;
  inicio: string;
  fim: string;
}) {
  const hrefEbitda = `/relatorios/detalhe?indicador=margem_operacional&cenario=${cenarioId}&inicio=${inicio}&fim=${fim}`;
  const hrefLinha = (grupo: string) => `/relatorios/linha?grupo=${grupo}&cenario=${cenarioId}&inicio=${inicio}&fim=${fim}`;
  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 font-heading text-sm font-semibold">DRE do período selecionado</h2>
      <p className="mb-3 text-[11px] text-text-muted">
        Os valores aqui são a projeção do cenário; clique numa linha pra ver os lançamentos reais já feitos nessas contas, pra conferência.
      </p>
      <table className="w-full border-collapse text-[12.5px]">
        <tbody>
          <DreLinha label="Receita Operacional Bruta" valor={metricas.receitaAcumulada} />
          <DreLinha label="(–) Custo dos Serviços Prestados (COGS)" valor={-metricas.cogsAcumulado} negativo href={hrefLinha("cogs")} />
          <DreLinha
            label="(–) Deduções e Impostos sobre Receita"
            valor={-metricas.impostosAcumulados}
            negativo
            tooltip="DAS do Simples Nacional (Anexo III ou V conforme o Fator R), calculado mês a mês pelo RBT12 (receita dos 12 meses anteriores) e pela folha CLT acumulada."
          />
          <DreLinha label="(=) Margem Bruta" valor={metricas.margemBrutaValor} total />
          <DreLinha label="(–) Vendas e Marketing (S&M)" valor={-metricas.smAcumulado} negativo href={hrefLinha("sm")} />
          <DreLinha label="(–) Pesquisa e Desenvolvimento (P&D)" valor={-metricas.pdAcumulado} negativo href={hrefLinha("pd")} />
          <DreLinha label="(–) Geral e Administrativo (G&A)" valor={-metricas.gaAcumulado} negativo href={hrefLinha("ga")} />
          <tr className="border-t border-border-soft bg-wine-soft">
            <td className="px-2 py-2.5 font-semibold">
              <Link href={hrefEbitda} className="underline decoration-dotted underline-offset-2 hover:decoration-solid">
                (=) EBITDA — ver detalhamento →
              </Link>
            </td>
            <td className={`px-2 py-2.5 text-right font-mono font-semibold ${metricas.ebitdaAcumulado < 0 ? "text-danger" : "text-success"}`}>
              {formatBRL(metricas.ebitdaAcumulado)}
            </td>
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
  );
}

function GraficoReceitaEInvestimento({
  nome,
  linhasPeriodo,
  investimentoPorMes,
}: {
  nome: string;
  linhasPeriodo: Agregado[];
  investimentoPorMes: Map<string, number>;
}) {
  const receitas = linhasPeriodo.map((l) => l.receita);
  const investimentos = linhasPeriodo.map((l) => investimentoPorMes.get(l.mes_referencia) ?? 0);
  const width = 1050;
  const height = 220;
  const min = 0;
  const max = Math.max(1, ...receitas, ...investimentos);
  const temInvestimento = investimentos.some((v) => v > 0);

  // Eixo de mês/ano: mostra só um subconjunto legível (início, fim, e passos regulares no meio).
  const totalMeses = linhasPeriodo.length;
  const passo = Math.max(1, Math.ceil(totalMeses / 10));
  const step = totalMeses > 1 ? width / (totalMeses - 1) : width;

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">Receita e investimento — {nome}</h2>
      </div>
      <div className="mb-3 flex items-center gap-4">
        <Legenda cor="var(--color-primary-fill)" texto="Receita mensal" />
        {temInvestimento && <Legenda cor="var(--color-wine)" texto="Aportes/fomentos (parcela do mês)" />}
      </div>
      <svg viewBox={`0 0 ${width} ${height + 28}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
        <line x1="0" y1={height} x2={width} y2={height} stroke="var(--color-border)" strokeWidth={1} />
        <path d={buildPath(receitas, width, height, min, max)} fill="none" stroke="var(--color-primary-fill)" strokeWidth={2.5} />
        {temInvestimento && <path d={buildPath(investimentos, width, height, min, max)} fill="none" stroke="var(--color-wine)" strokeWidth={2.5} />}
        {linhasPeriodo.map((l, i) => {
          if (i !== 0 && i !== totalMeses - 1 && i % passo !== 0) return null;
          return (
            <text key={l.mes_referencia} x={i * step} y={height + 20} fontSize="11" textAnchor="middle" fill="var(--color-text-faint)">
              {formatMes(l.mes_referencia)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function DreLinha({
  label,
  valor,
  negativo,
  total,
  tooltip,
  href,
}: {
  label: string;
  valor: number;
  negativo?: boolean;
  total?: boolean;
  tooltip?: string;
  href?: string;
}) {
  return (
    <tr className={`border-t border-border-soft ${total ? "bg-bg font-semibold" : ""}`}>
      <td className="flex items-center px-2 py-2.5">
        {href ? (
          <Link href={href} className="underline decoration-dotted underline-offset-2 hover:decoration-solid">
            {label} →
          </Link>
        ) : (
          label
        )}
        {tooltip && <InfoTooltip texto={tooltip} />}
      </td>
      <td className={`px-2 py-2.5 text-right font-mono ${negativo ? "text-danger" : ""}`}>
        {negativo ? `− ${formatBRL(Math.abs(valor))}` : formatBRL(valor)}
      </td>
    </tr>
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

