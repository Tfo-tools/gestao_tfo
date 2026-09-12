import Link from "next/link";
import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  agregarPorCenario,
  computeMetricas,
  fluxoTir,
  linhasDoProduto,
  recortarPeriodo,
  type Agregado,
  type LinhaSimProduto,
} from "@/lib/relatorios-cenario";
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

export default async function PlanoIndicadorDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ cenarioId: string; indicador: string }>;
  searchParams: Promise<{ inicio?: string; fim?: string; produto?: string }>;
}) {
  const { cenarioId, indicador } = await params;
  const { inicio, fim, produto } = await searchParams;
  const def = indicadorPorKey(indicador);

  const supabase = await createClient();
  const { data: cenario } = await supabase.from("cenarios").select("id, nome").eq("id", cenarioId).single();
  const nomeCenario = cenario?.nome ?? "—";

  const resumo = await agregarPorCenario(supabase, cenarioId);
  // Sem filtro na URL, vale o período do cenário — igual à tela de Indicadores.
  const inicioEfetivo = inicio ? `${inicio}-01` : (resumo.periodo.inicio ?? resumo.linhas[0]?.mes_referencia ?? "");
  const fimEfetivo = fim ? `${fim}-01` : (resumo.periodo.fim ?? resumo.linhas[resumo.linhas.length - 1]?.mes_referencia ?? "");
  const linhas = recortarPeriodo(resumo.linhas, inicioEfetivo, fimEfetivo);
  const periodoQuery = `inicio=${inicioEfetivo.slice(0, 7)}&fim=${fimEfetivo.slice(0, 7)}`;

  // Filtro por produto — só o CAC separa custo por produto: canais e mídia do próprio produto mais a
  // equipe comercial alocada nele (SDR PJ e vendedor no Mind, bot no Price e no Skills). Marketing e
  // vendas da empresa (feiras, campanhas, CRM) não são de um produto e ficam no consolidado.
  const { data: fasesDoCenario } = await supabase.from("fases_produto").select("produto_id").eq("cenario_id", cenarioId);
  const idsNoCenario = new Set(((fasesDoCenario ?? []) as { produto_id: string }[]).map((f) => f.produto_id));
  const { data: produtosRaw } = await supabase.from("produtos").select("id, nome").order("nome");
  const produtosDoCenario = ((produtosRaw ?? []) as { id: string; nome: string }[]).filter((p) => idsNoCenario.has(p.id));
  const produtoSel = produto && produtosDoCenario.some((p) => p.id === produto) ? produto : null;
  const { data: simProduto } = produtoSel
    ? await supabase
        .from("simulacao_mensal")
        .select(
          "mes_referencia, receita_bruta, receita_implementacao, ebitda, cogs, clientes_ativos, novos_clientes, churn_pct, ltv, cac_all_in, preco_medio_venda, novos_acoes, sm_marketing, sm_vendas, sm_outros, opex_pd, opex_ga",
        )
        .eq("cenario_id", cenarioId)
        .eq("produto_id", produtoSel)
    : { data: [] };
  const nomeProdutoSel = produtosDoCenario.find((p) => p.id === produtoSel)?.nome ?? null;
  // Mesmas linhas mensais, recortadas pro produto — todos os indicadores passam a funcionar com o
  // filtro sem código próprio (inclusive a composição de COGS, S&M, P&D e G&A).
  const linhasExibidas =
    produtoSel && nomeProdutoSel
      ? linhasDoProduto(linhas, produtoSel, nomeProdutoSel, (simProduto ?? []) as LinhaSimProduto[])
      : linhas;
  // Capital e retorno são da empresa, não de um produto: nesses dois o filtro não se aplica.
  const filtroPorProduto = def.key !== "tir" && def.key !== "retorno_investimento";

  return (
    <div>
      <div className="mb-2">
        <Link href={`/plano/${cenarioId}/indicadores`} className="text-[12.5px] text-text-muted">
          ← {nomeCenario}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">{def.titulo}</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          {nomeCenario} · {inicio ?? inicioEfetivo.slice(0, 7)} a {fim ?? fimEfetivo.slice(0, 7)}
        </p>
        <p className="mt-2 max-w-2xl text-[12.5px] text-text-muted">{def.formula}</p>
      </div>

      {filtroPorProduto && produtosDoCenario.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <span className="text-text-faint">Produto:</span>
          {[{ id: null as string | null, nome: "Todos (consolidado)" }, ...produtosDoCenario].map((p) => {
            const ativo = p.id === produtoSel;
            return (
              <Link
                key={p.id ?? "todos"}
                href={`/plano/${cenarioId}/indicadores/${indicador}?${periodoQuery}${p.id ? `&produto=${p.id}` : ""}`}
                className={`rounded-full border px-2.5 py-1 ${
                  ativo ? "border-primary-fill bg-primary-soft font-medium text-primary-deep" : "border-border text-text-muted"
                }`}
              >
                {p.nome}
              </Link>
            );
          })}
        </div>
      )}

      {produtoSel && (
        <div className="mb-4 rounded-lg border border-dashed border-border bg-bg px-4 py-2.5 text-[11.5px] text-text-muted">
          Só o que é <strong>deste produto</strong>: a simulação dele (receita, COGS, S&amp;M, P&amp;D e G&amp;A) mais a equipe comercial
          que a alocação deixou nele. Ficam de fora os custos da empresa — feiras, campanhas, CRM, estrutura e a equipe não atribuída a
          produto. O imposto é rateado pela fatia do produto na receita do mês, porque o DAS e o IVA são calculados sobre o faturamento
          da empresa inteira. Por isso o EBITDA aqui é o resultado do produto, e a soma dos produtos não fecha com o consolidado.
        </div>
      )}

      {linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-text-muted">Nenhum dado calculado nesse período — recalcule a projeção em Produtos primeiro.</p>
        </div>
      ) : (
        <div className="mb-5 rounded-xl border border-border bg-surface p-6">
          {def.key === "cogs" || def.key === "sm" || def.key === "pd" || def.key === "ga" ? (
            <ComposicaoGrupo grupo={def.key} linhas={linhasExibidas} cenarioId={cenarioId} />
          ) : (
            <TabelaIndicador
              indicador={def.key}
              linhas={linhasExibidas}
              totalInvestido={resumo.totalInvestido}
              capitalNovoPorMes={resumo.aportes.capitalNovoPorMes}
            />
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-1 font-heading text-sm font-semibold">Dado incompleto ou precisa mudar pra esse plano?</h2>
        <p className="mb-4 text-[12.5px] text-text-muted">
          Edite os lançamentos originais — eles já existem, não precisa recriar do zero.
        </p>
        <div className="flex flex-wrap gap-2">
          {def.editarLinks.map((l) => (
            <Link
              key={l.label}
              href={l.href(cenarioId, periodoQuery)}
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
  capitalNovoPorMes,
}: {
  indicador: string;
  linhas: Agregado[];
  totalInvestido: number;
  capitalNovoPorMes: Map<string, number>;
}) {
  if (indicador === "pmv") {
    const m = computeMetricas(linhas, totalInvestido, capitalNovoPorMes);
    const totalNovos = linhas.reduce((s, l) => s + l.novosComPmv, 0);
    return (
      <>
        <CalculoBox
          linhas={[
            `Preço médio de venda de cada produto no mês = mensalidade de tabela (planos pelo mix + níveis/módulos pela adesão)`,
            `Ponderado pelos clientes novos de cada produto: ${totalNovos.toLocaleString("pt-BR")} vendas no período`,
            `Ticket médio, pra comparar (receita ÷ clientes ativos, com descontos e implementação): ${m.ticketMedio != null ? formatBRL(m.ticketMedio) : "—"}`,
            `Preço médio de venda do período: ${m.precoMedioVenda != null ? formatBRL(m.precoMedioVenda) : "— (recalcule a projeção em Vendas)"}`,
          ]}
        />
        <Table
          head={["Mês", "Vendas no mês", "Preço médio de venda", "Ticket médio"]}
          rows={linhas.map((l) => [
            formatMes(l.mes_referencia),
            Math.round(l.novosClientes).toLocaleString("pt-BR"),
            l.novosComPmv > 0 ? formatBRL(l.pmvPonderado / l.novosComPmv) : l.clientesComPmv > 0 ? formatBRL(l.pmvPonderadoBase / l.clientesComPmv) : "—",
            l.clientes > 0 ? formatBRL(l.receita / l.clientes) : "—",
          ])}
          total={["Período", totalNovos.toLocaleString("pt-BR"), m.precoMedioVenda != null ? formatBRL(m.precoMedioVenda) : "—", m.ticketMedio != null ? formatBRL(m.ticketMedio) : "—"]}
        />
      </>
    );
  }

  if (indicador === "tir") {
    const m = computeMetricas(linhas, totalInvestido, capitalNovoPorMes);
    const capital =
      capitalNovoPorMes.size > 0 ? capitalNovoPorMes : totalInvestido > 0 && linhas[0] ? new Map([[linhas[0].mes_referencia, totalInvestido]]) : undefined;
    const fluxo = fluxoTir(linhas, capital);
    let acumulado = 0;
    return (
      <>
        <CalculoBox
          linhas={[
            m.tirBase === "capital_novo"
              ? `Fluxo = EBITDA do mês − capital novo que entra no mês (${formatBRL(totalInvestido)} no total)`
              : "Fluxo = EBITDA do mês (sem capital novo vinculado: TIR do projeto)",
            "TIR mensal = taxa que zera o valor presente desse fluxo; anualizada = (1 + TIR mensal)^12 − 1",
            "Sem valor de saída/perpetuidade no fim do período — leitura conservadora",
            m.tirAnualPct != null
              ? `TIR do período: ${formatPct(m.tirAnualPct)} ao ano`
              : "TIR não se aplica: o fluxo não tem saída e retorno de caixa dentro do período",
          ]}
        />
        <Table
          head={["Mês", "EBITDA", "Capital novo", "Fluxo do mês", "Fluxo acumulado"]}
          rows={linhas.map((l, i) => {
            acumulado += fluxo[i];
            return [formatMes(l.mes_referencia), formatBRL(l.ebitda), formatBRL(l.ebitda - fluxo[i]), formatBRL(fluxo[i]), formatBRL(acumulado)];
          })}
        />
      </>
    );
  }

  if (indicador === "meta") {
    const totalNovos = linhas.reduce((s, l) => s + l.novosClientes, 0);
    const clientesFinal = linhas[linhas.length - 1].clientes;
    return (
      <>
        <CalculoBox
          linhas={[
            `Clientes ativos no início do período: ${linhas[0].clientes.toLocaleString("pt-BR")}`,
            `(+) Novos clientes adquiridos no período: ${totalNovos.toLocaleString("pt-BR")}`,
            `(=) Clientes ativos ao final do período: ${clientesFinal.toLocaleString("pt-BR")}`,
          ]}
        />
        <Table
          head={["Mês", "Novos clientes", "Clientes ativos"]}
          rows={linhas.map((l) => [formatMes(l.mes_referencia), Math.round(l.novosClientes).toLocaleString("pt-BR"), l.clientes.toLocaleString("pt-BR")])}
          total={["Total do período", totalNovos.toLocaleString("pt-BR"), `${clientesFinal.toLocaleString("pt-BR")} (final)`]}
        />
      </>
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
        <CalculoBox
          linhas={
            indicador === "break_even"
              ? [
                  `EBITDA acumulado, mês a mês, desde o início do período selecionado`,
                  mesAlvo
                    ? `Break-even = primeiro mês em que esse acumulado deixa de ser negativo → ${formatMes(mesAlvo)}`
                    : `Break-even ainda não atingido dentro do período selecionado (EBITDA acumulado final: ${formatBRL(acumulado)})`,
                ]
              : [
                  `Capital novo (investimento ainda não aplicado; fomento fica fora) vinculado a este cenário: ${formatBRL(totalInvestido)}`,
                  `EBITDA acumulado mês a mês, desde o início do período selecionado`,
                  mesAlvo
                    ? `Retorno = primeiro mês em que o EBITDA acumulado ≥ capital novo → ${formatMes(mesAlvo)}`
                    : `Capital ainda não totalmente recuperado dentro do período (recuperado: ${formatBRL(acumulado)} de ${formatBRL(totalInvestido)})`,
                ]
          }
        />
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
        <CalculoBox
          linhas={[
            `Receita total do período: ${formatBRL(totalReceita)}`,
            `(–) COGS: ${formatBRL(totalCogs)}`,
            `(–) Impostos sobre a receita (DAS no Simples; ISS/PIS/COFINS/CBS/IBS depois): ${formatBRL(totalImposto)}`,
            `(–) S&M (marketing+vendas+outros): ${formatBRL(totalSm)}`,
            `(–) P&D: ${formatBRL(totalPd)}`,
            `(–) G&A: ${formatBRL(totalGa)}`,
            `(=) EBITDA do período: ${formatBRL(totalEbitda)}`,
            `Margem operacional = EBITDA ÷ Receita = ${formatBRL(totalEbitda)} ÷ ${formatBRL(totalReceita)} = ${
              totalReceita > 0 ? formatPct((totalEbitda / totalReceita) * 100) : "—"
            }`,
          ]}
        />
        <p className="mb-3 text-[12px] text-text-muted">
          DRE em cascata: Receita (–) Impostos (=) Receita líquida (–) COGS (=) Lucro bruto (–) S&amp;M (–) P&amp;D (–) G&amp;A (=) EBITDA. Clique num
          mês pra ver os lançamentos reais dele, pra conferência.
        </p>
        <Table
          head={["Mês", "Receita", "COGS", "Impostos", "Lucro bruto", "S&M", "P&D", "G&A", "EBITDA"]}
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
          hrefFor={(_row, i) => `/custos/extrato?desde=${linhas[i].mes_referencia.slice(0, 7)}&ate=${linhas[i].mes_referencia.slice(0, 7)}`}
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
    const margemTotal = totalReceita - totalCogs - totalImposto;
    return (
      <>
        <CalculoBox
          linhas={[
            `Receita total do período: ${formatBRL(totalReceita)}`,
            `(–) COGS: ${formatBRL(totalCogs)}`,
            `(–) DAS (Simples Nacional): ${formatBRL(totalImposto)}`,
            `(=) Margem bruta: ${formatBRL(margemTotal)}`,
            `Margem bruta % = ${formatBRL(margemTotal)} ÷ ${formatBRL(totalReceita)} = ${
              totalReceita > 0 ? formatPct((margemTotal / totalReceita) * 100) : "—"
            }`,
          ]}
        />
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
            totalReceita > 0 ? formatPct((margemTotal / totalReceita) * 100) : "—",
          ]}
        />
      </>
    );
  }

  if (indicador === "cac") {
    const totalNovos = linhas.reduce((s, l) => s + l.novosClientes, 0);
    const totalMarketing = linhas.reduce((s, l) => s + l.smMarketing, 0);
    const totalVendas = linhas.reduce((s, l) => s + l.smVendas, 0);
    const totalOutros = linhas.reduce((s, l) => s + l.smOutros, 0);
    const custoTotalCac = totalMarketing + totalVendas + totalOutros;
    return (
      <>
        <CalculoBox
          linhas={[
            `Marketing: ${formatBRL(totalMarketing)}`,
            `(+) Vendas: ${formatBRL(totalVendas)}`,
            `(+) Outros (S&M): ${formatBRL(totalOutros)}`,
            `(=) Custo total de aquisição: ${formatBRL(custoTotalCac)}`,
            `(÷) Novos clientes no período: ${totalNovos.toLocaleString("pt-BR")}`,
            `CAC = ${formatBRL(custoTotalCac)} ÷ ${totalNovos.toLocaleString("pt-BR")} = ${
              totalNovos > 0 ? formatBRL(custoTotalCac / totalNovos) : "—"
            }`,
          ]}
        />
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
    // Mês sem churn (plano anual antes de completar 12 meses) não entra na média: o LTV ali não é
    // zero, é "não se aplica" — ninguém pode sair ainda. Contá-lo como zero afundava a média.
    let clientesComLtv = 0;
    let mesesSemChurn = 0;
    const rows = linhas.map((l) => {
      const arpu = l.clientes > 0 ? l.receita / l.clientes : 0;
      const churn = l.clientes > 0 ? l.churnPonderado / l.clientes : 0;
      const ltvDoMes = l.clientes > 0 ? l.ltvPonderado / l.clientes : 0;
      if (churn > 0 && l.ltvPonderado > 0) {
        somaLtvPonderado += l.ltvPonderado;
        clientesComLtv += l.clientes;
      } else if (l.clientes > 0) {
        mesesSemChurn += 1;
      }
      return [
        formatMes(l.mes_referencia),
        l.clientes.toLocaleString("pt-BR"),
        formatBRL(arpu),
        churn > 0 ? formatPct(churn * 100) : "sem saída",
        churn > 0 && ltvDoMes > 0 ? formatBRL(ltvDoMes) : "não se aplica",
      ];
    });
    const ltvMedio = clientesComLtv > 0 ? somaLtvPonderado / clientesComLtv : 0;
    return (
      <>
        <CalculoBox
          linhas={[
            `LTV do mês = mensalidade por cliente (MRR ÷ clientes ativos) × margem bruta do produto ÷ churn do mês`,
            `Média ponderada pelos clientes ativos de cada mês (meses com mais clientes pesam mais na média)`,
            ...(mesesSemChurn > 0
              ? [`${mesesSemChurn} mês(es) sem saída prevista ficam fora da média — com plano anual, o cliente ainda não pode sair`]
              : []),
            `LTV médio do período: ${clientesComLtv > 0 ? formatBRL(ltvMedio) : "—"}`,
          ]}
        />
        <Table
          head={["Mês", "Clientes ativos", "ARPU (receita/cliente)", "Churn do mês", "LTV do mês"]}
          rows={rows}
          total={["Média ponderada do período", "—", "—", "—", clientesComLtv > 0 ? formatBRL(ltvMedio) : "—"]}
        />
      </>
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
    const churnMedio = somaClientes > 0 ? (somaChurnPonderado / somaClientes) * 100 : 0;
    return (
      <>
        <CalculoBox
          linhas={[
            `Churn ponderado de cada mês = clientes perdidos no mês ÷ clientes ativos no mês`,
            `Média ponderada pelos clientes ativos de cada mês`,
            `Churn médio do período: ${somaClientes > 0 ? formatPct(churnMedio) : "—"}`,
          ]}
        />
        <Table
          head={["Mês", "Clientes ativos", "Churn do mês"]}
          rows={rows}
          total={["Média ponderada do período", "—", somaClientes > 0 ? formatPct(churnMedio) : "—"]}
        />
      </>
    );
  }

  return null;
}

const ORIGEM: Record<string, { rotulo: string; href: (cenarioId: string) => string }> = {
  regra_cogs: { rotulo: "Regras de COGS (card CSP)", href: (c) => `/plano/${c}/custos` },
  implementacao: { rotulo: "Implementação (Produtos)", href: (c) => `/produtos?cenario=${c}` },
  canais: { rotulo: "Canais de aquisição (Vendas)", href: (c) => `/plano/${c}/vendas` },
  empresa: { rotulo: "Custos da empresa (Plano de Custos)", href: (c) => `/plano/${c}/custos` },
  equipe: { rotulo: "Necessidade de Contratação", href: (c) => `/contratacoes/necessidade?cenario=${c}` },
  feiras: { rotulo: "Feiras e eventos (Marketing)", href: (c) => `/plano/${c}/custos` },
  contratacoes: { rotulo: "Contratações por produto", href: (c) => `/contratacoes?cenario=${c}` },
  lancado: { rotulo: "Plano de custos da fase", href: (c) => `/plano/${c}/custos` },
};

const CAMPO_GRUPO: Record<"cogs" | "sm" | "pd" | "ga", (l: Agregado) => number> = {
  cogs: (l) => l.cogs,
  sm: (l) => l.smMarketing + l.smVendas + l.smOutros,
  pd: (l) => l.opexPd,
  ga: (l) => l.opexGa,
};

/**
 * O que compõe uma linha da DRE no período: cada origem (regra, canal, custo lançado, equipe),
 * aberta por produto quando vem de um produto, com o total por ano e onde se ajusta. A soma das
 * origens fecha com a linha da DRE — se não fechar, a diferença aparece explícita.
 */
function ComposicaoGrupo({ grupo, linhas, cenarioId }: { grupo: "cogs" | "sm" | "pd" | "ga"; linhas: Agregado[]; cenarioId: string }) {
  const anos = [...new Set(linhas.map((l) => l.mes_referencia.slice(0, 4)))];
  type Item = { origem: string; rotulo: string; porProduto: Map<string, Record<string, number>>; porAno: Record<string, number>; total: number; porMes: Map<string, number> };
  const itens = new Map<string, Item>();
  for (const l of linhas) {
    for (const [chave, valor] of Object.entries(l.composicao ?? {})) {
      const [g, origem, rotulo, produto] = chave.split("|");
      if (g !== grupo) continue;
      const k = `${origem}|${rotulo}`;
      const it: Item = itens.get(k) ?? { origem, rotulo, porProduto: new Map(), porAno: {}, total: 0, porMes: new Map() };
      const ano = l.mes_referencia.slice(0, 4);
      it.porAno[ano] = (it.porAno[ano] ?? 0) + valor;
      it.total += valor;
      it.porMes.set(l.mes_referencia, (it.porMes.get(l.mes_referencia) ?? 0) + valor);
      if (produto) {
        const pp: Record<string, number> = it.porProduto.get(produto) ?? {};
        pp[ano] = (pp[ano] ?? 0) + valor;
        pp.total = (pp.total ?? 0) + valor;
        it.porProduto.set(produto, pp);
      }
      itens.set(k, it);
    }
  }
  const lista = [...itens.values()].sort((a, b) => b.total - a.total);
  const totalGrupo = linhas.reduce((s, l) => s + CAMPO_GRUPO[grupo](l), 0);
  const somaOrigens = lista.reduce((s, i) => s + i.total, 0);
  const receita = linhas.reduce((s, l) => s + l.receita, 0);
  const diferenca = totalGrupo - somaOrigens;
  const top = lista.slice(0, 5);

  return (
    <>
      <CalculoBox
        linhas={[
          `Total da linha no período: ${formatBRL(totalGrupo)}${receita > 0 ? ` (${formatPct((totalGrupo / receita) * 100)} da receita)` : ""}`,
          `${lista.length} origem(ns) — abertas por produto quando o custo nasce num produto`,
          Math.abs(diferenca) < 1
            ? "A soma das origens fecha com a linha da DRE"
            : `Diferença não classificada: ${formatBRL(diferenca)} (projeção calculada antes desta versão — clique em Recalcular projeção em Vendas)`,
        ]}
      />
      {lista.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">Nada entra nesta linha no período.</p>
      ) : (
        <div className="mb-6 overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-text-muted">
                <td className="px-2 py-1.5 font-medium">O que entra</td>
                <td className="px-2 py-1.5 font-medium">Onde ajustar</td>
                {anos.map((a) => (
                  <td key={a} className="px-2 py-1.5 text-right font-medium">
                    {a}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-medium">Total</td>
                <td className="px-2 py-1.5 text-right font-medium">% da linha</td>
              </tr>
            </thead>
            <tbody>
              {lista.map((it) => (
                <Fragment key={`${it.origem}|${it.rotulo}`}>
                  <tr className="border-t border-border-soft">
                    <td className="px-2 py-1.5 font-medium">{it.rotulo}</td>
                    <td className="px-2 py-1.5 text-[11.5px]">
                      <Link href={ORIGEM[it.origem]?.href(cenarioId) ?? "#"} className="text-primary-deep underline decoration-dotted">
                        {ORIGEM[it.origem]?.rotulo ?? it.origem} →
                      </Link>
                    </td>
                    {anos.map((a) => (
                      <td key={a} className="px-2 py-1.5 text-right font-mono">
                        {it.porAno[a] ? formatBRL(it.porAno[a]) : "—"}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-mono font-semibold">{formatBRL(it.total)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{totalGrupo ? formatPct((it.total / totalGrupo) * 100) : "—"}</td>
                  </tr>
                  {it.porProduto.size > 1 &&
                    [...it.porProduto.entries()]
                      .sort((a, b) => (b[1].total ?? 0) - (a[1].total ?? 0))
                      .map(([produto, v]) => (
                        <tr key={produto} className="text-[11.5px] text-text-muted">
                          <td className="py-1 pl-6 pr-2">{produto}</td>
                          <td></td>
                          {anos.map((a) => (
                            <td key={a} className="px-2 py-1 text-right font-mono">
                              {v[a] ? formatBRL(v[a]) : "—"}
                            </td>
                          ))}
                          <td className="px-2 py-1 text-right font-mono">{formatBRL(v.total ?? 0)}</td>
                          <td className="px-2 py-1 text-right font-mono">{totalGrupo ? formatPct(((v.total ?? 0) / totalGrupo) * 100) : "—"}</td>
                        </tr>
                      ))}
                  {it.porProduto.size === 1 && (
                    <tr className="text-[11px] text-text-faint">
                      <td className="py-0.5 pl-6 pr-2" colSpan={anos.length + 4}>
                        todo de {[...it.porProduto.keys()][0]}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-text bg-bg font-semibold">
                <td className="px-2 py-2">Total da linha na DRE</td>
                <td></td>
                {anos.map((a) => (
                  <td key={a} className="px-2 py-2 text-right font-mono">
                    {formatBRL(linhas.filter((l) => l.mes_referencia.startsWith(a)).reduce((s, l) => s + CAMPO_GRUPO[grupo](l), 0))}
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-mono">{formatBRL(totalGrupo)}</td>
                <td className="px-2 py-2 text-right font-mono">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {lista.length > 0 && (
        <>
          <h3 className="mb-2 font-heading text-[12.5px] font-semibold">Mês a mês</h3>
          <Table
            head={["Mês", "Total da linha", ...top.map((t) => t.rotulo), ...(lista.length > top.length ? ["Demais"] : [])]}
            rows={linhas.map((l) => {
              const totalMes = CAMPO_GRUPO[grupo](l);
              const doTop = top.reduce((s, t) => s + (t.porMes.get(l.mes_referencia) ?? 0), 0);
              return [
                formatMes(l.mes_referencia),
                formatBRL(totalMes),
                ...top.map((t) => formatBRL(t.porMes.get(l.mes_referencia) ?? 0)),
                ...(lista.length > top.length ? [formatBRL(totalMes - doTop)] : []),
              ];
            })}
          />
        </>
      )}
    </>
  );
}

/** Conta feita, com os números de verdade — antes da tabela mês a mês, pra dar pra conferir de
 * cabeça se o resultado bate, do jeito que um investidor perguntaria "como você chegou nisso". */
function CalculoBox({ linhas }: { linhas: string[] }) {
  return (
    <div className="mb-5 rounded-xl border border-primary-fill/40 bg-primary-soft/25 p-5">
      <h2 className="mb-3 font-heading text-[12.5px] font-semibold text-primary-deep">Como chegamos nesse número</h2>
      <div className="flex flex-col gap-1.5 font-mono text-[12.5px]">
        {linhas.map((l, i) => (
          <div key={i} className={i === linhas.length - 1 ? "font-semibold text-text" : "text-text-muted"}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function Table({
  head,
  rows,
  total,
  destaqueMes,
  hrefFor,
}: {
  head: string[];
  rows: string[][];
  total?: string[];
  destaqueMes?: string | null;
  hrefFor?: (row: string[], index: number) => string;
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
            <tr
              key={i}
              className={`border-t border-border-soft ${destaqueMes && row[0] === formatMes(destaqueMes) ? "bg-wine-soft" : ""} ${hrefFor ? "cursor-pointer hover:bg-bg" : ""}`}
            >
              {row.map((cell, j) =>
                hrefFor ? (
                  <td key={j} className={j === 0 ? "px-2 py-1.5 capitalize" : "px-2 py-1.5 text-right font-mono"}>
                    <Link href={hrefFor(row, i)} className="block">
                      {cell}
                    </Link>
                  </td>
                ) : (
                  <td key={j} className={j === 0 ? "px-2 py-1.5 capitalize" : "px-2 py-1.5 text-right font-mono"}>
                    {cell}
                  </td>
                ),
              )}
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
