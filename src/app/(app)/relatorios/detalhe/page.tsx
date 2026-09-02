import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { agregarPorCenario, type Agregado } from "@/lib/relatorios-cenario";
import { indicadorPorKey } from "@/lib/indicadores";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function formatMes(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}
function formatPct(v: number) {
  return `${v.toFixed(1)}%`;
}

export default async function RelatorioDetalhePage({
  searchParams,
}: {
  searchParams: Promise<{ indicador?: string; cenario?: string; inicio?: string; fim?: string }>;
}) {
  const { indicador, cenario, inicio, fim } = await searchParams;
  const def = indicadorPorKey(indicador);

  const supabase = await createClient();
  const { data: cenarios } = await supabase.from("cenarios").select("id, nome").order("created_at");
  const cenarioId = cenario ?? "";
  const nomeCenario = (cenarios ?? []).find((c) => c.id === cenarioId)?.nome ?? "—";

  const resumo = await agregarPorCenario(supabase, cenarioId);
  const inicioEfetivo = inicio ? `${inicio}-01` : (resumo.linhas[0]?.mes_referencia ?? "");
  const fimEfetivo = fim ? `${fim}-01` : (resumo.linhas[resumo.linhas.length - 1]?.mes_referencia ?? "");
  const linhas = resumo.linhas.filter((l) => l.mes_referencia >= inicioEfetivo && l.mes_referencia <= fimEfetivo);

  const voltarHref = `/relatorios?aba=planos&cenario=${cenarioId}${inicio ? `&inicio=${inicio}` : ""}${fim ? `&fim=${fim}` : ""}`;

  return (
    <div>
      <div className="mb-2">
        <Link href={voltarHref} className="text-[12.5px] text-text-muted">
          ← Relatórios — Construção de Cenários
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">{def.titulo}</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          {nomeCenario} · {inicio ?? inicioEfetivo.slice(0, 7)} a {fim ?? fimEfetivo.slice(0, 7)}
        </p>
        <p className="mt-2 max-w-2xl text-[12.5px] text-text-muted">{def.formula}</p>
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-text-muted">Nenhum dado calculado nesse período — recalcule a projeção em Produtos primeiro.</p>
        </div>
      ) : (
        <div className="mb-5 rounded-xl border border-border bg-surface p-6">
          <TabelaIndicador indicador={def.key} linhas={linhas} totalInvestido={resumo.totalInvestido} />
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-1 font-heading text-sm font-semibold">Dado incompleto ou precisa mudar pra esse cenário?</h2>
        <p className="mb-4 text-[12.5px] text-text-muted">
          Edite os lançamentos originais — eles já existem, não precisa recriar do zero.
        </p>
        <div className="flex flex-wrap gap-2">
          {def.editarLinks.map((l) => (
            <Link
              key={l.href}
              href={cenarioId ? `${l.href}?cenario=${cenarioId}` : l.href}
              className="rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-primary-deep"
            >
              {l.label} →
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabelaIndicador({
  indicador,
  linhas,
  totalInvestido,
}: {
  indicador: string;
  linhas: Agregado[];
  totalInvestido: number;
}) {
  if (indicador === "meta") {
    const totalNovos = linhas.reduce((s, l) => s + l.novosClientes, 0);
    return (
      <Table
        head={["Mês", "Novos clientes", "Clientes ativos"]}
        rows={linhas.map((l) => [formatMes(l.mes_referencia), Math.round(l.novosClientes).toLocaleString("pt-BR"), l.clientes.toLocaleString("pt-BR")])}
        total={["Total do período", totalNovos.toLocaleString("pt-BR"), `${linhas[linhas.length - 1].clientes.toLocaleString("pt-BR")} (final)`]}
      />
    );
  }

  if (indicador === "break_even" || indicador === "retorno_investimento") {
    let acumulado = 0;
    const rows: string[][] = [];
    let mesAlvo: string | null = null;
    for (const l of linhas) {
      acumulado += l.ebitda;
      const custos = l.receita - l.ebitda;
      if (indicador === "break_even" && mesAlvo === null && acumulado >= 0) mesAlvo = l.mes_referencia;
      if (indicador === "retorno_investimento" && totalInvestido > 0 && mesAlvo === null && acumulado >= totalInvestido) mesAlvo = l.mes_referencia;
      rows.push([
        formatMes(l.mes_referencia),
        formatBRL(l.receita),
        formatBRL(custos),
        formatBRL(l.ebitda),
        formatBRL(acumulado),
        ...(indicador === "retorno_investimento" ? [formatBRL(Math.max(0, totalInvestido - acumulado))] : []),
      ]);
    }
    const head =
      indicador === "break_even"
        ? ["Mês", "Receita", "Custos totais", "EBITDA do mês", "EBITDA acumulado"]
        : ["Mês", "Receita", "Custos totais", "EBITDA do mês", "EBITDA acumulado", "Falta recuperar"];
    return (
      <>
        {indicador === "retorno_investimento" && (
          <p className="mb-3 text-[12px] text-text-muted">Capital total captado vinculado a este cenário: {formatBRL(totalInvestido)}</p>
        )}
        <Table head={head} rows={rows} destaqueMes={mesAlvo} />
      </>
    );
  }

  if (indicador === "margem_operacional") {
    const totalReceita = linhas.reduce((s, l) => s + l.receita, 0);
    const totalCogs = linhas.reduce((s, l) => s + l.cogs, 0);
    const totalImposto = linhas.reduce((s, l) => s + l.impostoMensal, 0);
    const totalSm = linhas.reduce((s, l) => s + l.smMarketing + l.smVendas + l.smOutros, 0);
    const totalPd = linhas.reduce((s, l) => s + l.opexPd, 0);
    const totalGa = linhas.reduce((s, l) => s + l.opexGa, 0);
    const totalEbitda = linhas.reduce((s, l) => s + l.ebitda, 0);
    return (
      <>
        <p className="mb-3 text-[12px] text-text-muted">
          DRE em cascata: Receita (–) COGS (–) Impostos (=) Margem Bruta (–) S&amp;M (–) P&amp;D (–) G&amp;A (=) EBITDA.
        </p>
        <Table
          head={["Mês", "Receita", "COGS", "Impostos", "Margem Bruta", "S&M", "P&D", "G&A", "EBITDA"]}
          rows={linhas.map((l) => {
            const sm = l.smMarketing + l.smVendas + l.smOutros;
            const margemBruta = l.receita - l.cogs - l.impostoMensal;
            return [
              formatMes(l.mes_referencia),
              formatBRL(l.receita),
              formatBRL(l.cogs),
              formatBRL(l.impostoMensal),
              formatBRL(margemBruta),
              formatBRL(sm),
              formatBRL(l.opexPd),
              formatBRL(l.opexGa),
              formatBRL(l.ebitda),
            ];
          })}
          total={[
            "Total do período",
            formatBRL(totalReceita),
            formatBRL(totalCogs),
            formatBRL(totalImposto),
            formatBRL(totalReceita - totalCogs - totalImposto),
            formatBRL(totalSm),
            formatBRL(totalPd),
            formatBRL(totalGa),
            formatBRL(totalEbitda),
          ]}
        />
      </>
    );
  }

  if (indicador === "margem_bruta") {
    const totalReceita = linhas.reduce((s, l) => s + l.receita, 0);
    const totalCogs = linhas.reduce((s, l) => s + l.cogs, 0);
    const totalImposto = linhas.reduce((s, l) => s + l.impostoMensal, 0);
    return (
      <Table
        head={["Mês", "Receita", "COGS", "DAS (Simples)", "Margem bruta do mês"]}
        rows={linhas.map((l) => {
          const margem = l.receita > 0 ? ((l.receita - l.cogs - l.impostoMensal) / l.receita) * 100 : 0;
          return [formatMes(l.mes_referencia), formatBRL(l.receita), formatBRL(l.cogs), formatBRL(l.impostoMensal), formatPct(margem)];
        })}
        total={[
          "Total do período",
          formatBRL(totalReceita),
          formatBRL(totalCogs),
          formatBRL(totalImposto),
          totalReceita > 0 ? formatPct(((totalReceita - totalCogs - totalImposto) / totalReceita) * 100) : "—",
        ]}
      />
    );
  }

  if (indicador === "cac") {
    const totalNovos = linhas.reduce((s, l) => s + l.novosClientes, 0);
    const totalMarketing = linhas.reduce((s, l) => s + l.smMarketing, 0);
    const totalVendas = linhas.reduce((s, l) => s + l.smVendas, 0);
    const totalOutros = linhas.reduce((s, l) => s + l.smOutros, 0);
    return (
      <>
        <p className="mb-3 text-[12px] text-text-muted">
          CAC fully-loaded: mídia paga, ferramentas (CRM/automação/prospecção), folha da equipe comercial e de marketing
          (própria por produto + compartilhada via Modelos de Contratação), comissões e serviços terceirizados —
          "Outros (S&amp;M)" cobre o que não se separa entre marketing e vendas.
        </p>
        <Table
          head={["Mês", "Novos clientes", "Marketing", "Vendas", "Outros (S&M)", "CAC do mês"]}
          rows={linhas.map((l) => {
            const custoTotal = l.smMarketing + l.smVendas + l.smOutros;
            const cac = l.novosClientes > 0 ? custoTotal / l.novosClientes : 0;
            return [
              formatMes(l.mes_referencia),
              Math.round(l.novosClientes).toLocaleString("pt-BR"),
              formatBRL(l.smMarketing),
              formatBRL(l.smVendas),
              formatBRL(l.smOutros),
              l.novosClientes > 0 ? formatBRL(cac) : "—",
            ];
          })}
          total={[
            "Total do período",
            totalNovos.toLocaleString("pt-BR"),
            formatBRL(totalMarketing),
            formatBRL(totalVendas),
            formatBRL(totalOutros),
            totalNovos > 0 ? formatBRL((totalMarketing + totalVendas + totalOutros) / totalNovos) : "—",
          ]}
        />
      </>
    );
  }

  if (indicador === "ltv") {
    let somaLtvPonderado = 0;
    let somaClientes = 0;
    const rows = linhas.map((l) => {
      const arpu = l.clientes > 0 ? l.receita / l.clientes : 0;
      const churn = l.clientes > 0 ? l.churnPonderado / l.clientes : 0;
      const ltv = churn > 0 ? arpu / churn : 0;
      somaLtvPonderado += l.ltvPonderado;
      somaClientes += l.clientes;
      return [formatMes(l.mes_referencia), l.clientes.toLocaleString("pt-BR"), formatBRL(arpu), churn > 0 ? formatPct(churn * 100) : "—", churn > 0 ? formatBRL(ltv) : "—"];
    });
    return (
      <Table
        head={["Mês", "Clientes ativos", "ARPU (receita/cliente)", "Churn do mês", "LTV do mês"]}
        rows={rows}
        total={["Média ponderada do período", "—", "—", "—", somaClientes > 0 ? formatBRL(somaLtvPonderado / somaClientes) : "—"]}
      />
    );
  }

  if (indicador === "churn") {
    let somaChurnPonderado = 0;
    let somaClientes = 0;
    const rows = linhas.map((l) => {
      const churn = l.clientes > 0 ? l.churnPonderado / l.clientes : 0;
      somaChurnPonderado += l.churnPonderado;
      somaClientes += l.clientes;
      return [formatMes(l.mes_referencia), l.clientes.toLocaleString("pt-BR"), churn > 0 ? formatPct(churn * 100) : "—"];
    });
    return (
      <Table
        head={["Mês", "Clientes ativos", "Churn do mês"]}
        rows={rows}
        total={["Média ponderada do período", "—", somaClientes > 0 ? formatPct((somaChurnPonderado / somaClientes) * 100) : "—"]}
      />
    );
  }

  return null;
}

function Table({
  head,
  rows,
  total,
  destaqueMes,
}: {
  head: string[];
  rows: string[][];
  total?: string[];
  destaqueMes?: string | null;
}) {
  return (
    <div className="max-h-[520px] overflow-y-auto overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-text-muted">
            {head.map((h, i) => (
              <td key={i} className={i === 0 ? "px-2 py-1.5 font-medium" : "px-2 py-1.5 text-right font-medium"}>
                {h}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-t border-border-soft ${destaqueMes && row[0] === formatMes(destaqueMes) ? "bg-wine-soft" : ""}`}>
              {row.map((cell, j) => (
                <td key={j} className={j === 0 ? "px-2 py-1.5 capitalize" : "px-2 py-1.5 text-right font-mono"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr className="border-t-2 border-text bg-bg font-semibold">
              {total.map((cell, j) => (
                <td key={j} className={j === 0 ? "px-2 py-2" : "px-2 py-2 text-right font-mono"}>
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

