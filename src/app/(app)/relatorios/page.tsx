import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InfoTooltip } from "@/components/info-tooltip";
import { AlocacaoInvestimento } from "./alocacao-investimento";
import {
  agregarPorCenario,
  computeMetricas,
  recortarPeriodo,
  type Agregado,
  type Metricas,
  type ProgramaAporte,
} from "@/lib/relatorios-cenario";
import { ExportarInvestidor } from "./exportar-investidor";
import { SimuladorRetorno } from "./simulador-retorno";
import { ReceitasHistoricas } from "./receitas-historicas-card";
import type { ReceitaHistorica } from "@/lib/receitas-historicas";
import {
  carregarOrcamentoProgramas,
  LABEL_CATEGORIA_USO,
  somaPorCategoria,
  type LinhaOrcamento,
} from "@/lib/orcamento-programa";
import type { FocoInvestimento } from "@/lib/indicadores-investidor";
import {
  grupoDeConta,
  GRUPO_TOOLTIP as GRUPO_TOOLTIP_DRE,
} from "@/lib/grupo-dre";
import {
  calcularRetornoPrograma,
  agregarRetornoProgramas,
} from "@/lib/retorno-investidor";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function formatMes(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
  });
}

function buildPath(
  values: number[],
  width: number,
  height: number,
  min: number,
  max: number,
) {
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`,
    )
    .join(" ");
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    cenario?: string;
    inicio?: string;
    fim?: string;
  }>;
}) {
  const { aba, cenario, inicio, fim } = await searchParams;
  // "Real" só é acessível pelo menu Realizado, "Planos" só pelo menu Construção de Cenários —
  // sem seletor de aba na tela, cada entrada do menu já manda direto pro relatório certo.
  const abaAtual = aba === "planos" ? "planos" : "real";

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">
          {abaAtual === "real"
            ? "Relatórios — Realizado"
            : "Relatórios — Construção de Cenários"}
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          {abaAtual === "real"
            ? "O que de fato está acontecendo na empresa — custos e vendas já realizados"
            : "Planejamento — projeção de receitas e despesas mês a mês, por cenário"}
        </p>
      </div>

      {abaAtual === "real" ? (
        <RelatorioReal />
      ) : (
        <RelatorioPlanos cenario={cenario} inicio={inicio} fim={fim} />
      )}
    </div>
  );
}

const GRUPO_TOOLTIP: Record<string, string> = {
  COGS: GRUPO_TOOLTIP_DRE.cogs,
  "S&M": GRUPO_TOOLTIP_DRE.sm,
  "P&D": GRUPO_TOOLTIP_DRE.pd,
  "G&A": GRUPO_TOOLTIP_DRE.ga,
  Marca: GRUPO_TOOLTIP_DRE.marca,
};

type DespesaGrupoRow = {
  data_gasto: string;
  valor_total: number;
  plano_contas_id: string | null;
  plano_contas: { codigo: string; conta: string; tipo: string } | null;
};

async function RelatorioReal() {
  const supabase = await createClient();

  const [{ data: despesas }, { data: receitasReais }] = await Promise.all([
    supabase
      .from("despesas")
      .select(
        "data_gasto, valor_total, plano_contas_id, plano_contas:plano_contas_id(codigo, conta, tipo)",
      ),
    // Nenhuma tabela de receita realizada existe ainda — fica pronto pro dia em que houver vendas reais.
    Promise.resolve({ data: [] as { data_venda: string; valor: number }[] }),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const despesasTyped = (despesas ?? []) as any as DespesaGrupoRow[];

  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Mesma cascata de DRE da aba Planos: Receita (–) Impostos (=) Receita líquida (–) COGS (=) Lucro
  // bruto (–) S&M (–) P&D (–) G&A (=) EBITDA — pra manter as duas telas comparáveis, mesmo sem receita lançada.
  let cogsMes = 0,
    cogsAcum = 0,
    smMes = 0,
    smAcum = 0,
    pdMes = 0,
    pdAcum = 0,
    gaMes = 0,
    gaAcum = 0,
    marcaMes = 0,
    marcaAcum = 0,
    outrasMes = 0,
    outrasAcum = 0;
  for (const d of despesasTyped) {
    const conta = d.plano_contas;
    if (!conta) continue;
    const grupo = grupoDeConta(conta.codigo, conta.tipo);
    const valor = Number(d.valor_total);
    const noMes = d.data_gasto.startsWith(mesAtual);
    if (grupo === "cogs") {
      cogsAcum += valor;
      if (noMes) cogsMes += valor;
    } else if (grupo === "sm") {
      smAcum += valor;
      if (noMes) smMes += valor;
    } else if (grupo === "pd") {
      pdAcum += valor;
      if (noMes) pdMes += valor;
    } else if (grupo === "ga") {
      gaAcum += valor;
      if (noMes) gaMes += valor;
    } else if (grupo === "marca") {
      marcaAcum += valor;
      if (noMes) marcaMes += valor;
    } else {
      outrasAcum += valor;
      if (noMes) outrasMes += valor;
    }
  }

  const receitaMes = (receitasReais ?? [])
    .filter((r) => r.data_venda.startsWith(mesAtual))
    .reduce((s, r) => s + r.valor, 0);
  const receitaAcumulada = (receitasReais ?? []).reduce(
    (s, r) => s + r.valor,
    0,
  );

  // Sem série mensal de receita real ainda (Vendas não está implementada), o DAS fica em zero —
  // a linha aparece pela estrutura, calcula de verdade assim que houver receita real lançada.
  const impostosMes = 0;
  const impostosAcum = 0;
  const margemBrutaMes = receitaMes - cogsMes - impostosMes;
  const margemBrutaAcum = receitaAcumulada - cogsAcum - impostosAcum;
  const ebitdaMes = margemBrutaMes - smMes - pdMes - gaMes - marcaMes;
  const ebitdaAcumulado =
    margemBrutaAcum - smAcum - pdAcum - gaAcum - marcaAcum;

  return (
    <>
      <div className="mb-5 rounded-xl border border-border bg-surface p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">
            Demonstrativo de Resultado — Real
          </h2>
          {receitaAcumulada === 0 && (
            <span className="text-[11px] text-text-faint">
              receita ainda não lançada — período pré-operacional
            </span>
          )}
        </div>

        <form
          action="/custos/extrato/export/comprovantes"
          method="get"
          className="mb-4 mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border bg-bg px-3.5 py-3"
        >
          <span className="mr-1 text-[11.5px] text-text-muted">Comprovantes e notas pra prestar contas:</span>
          <div>
            <label className="mb-1 block text-[10.5px] font-medium text-text-muted">De</label>
            <input type="month" name="desde" className="input py-1 text-[11.5px]" />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Até</label>
            <input type="month" name="ate" className="input py-1 text-[11.5px]" />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-primary-fill bg-primary-soft px-3.5 py-1.5 text-[11.5px] font-medium text-primary-deep hover:bg-primary-soft/70"
          >
            ⬇ Baixar .zip
          </button>
          <span className="text-[10.5px] text-text-muted">Em branco baixa tudo.</span>
        </form>

        <table className="mt-4 w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="px-2 py-2 font-medium">Linha</th>
              <th className="px-2 py-2 text-right font-medium">{mesAtual}</th>
              <th className="px-2 py-2 text-right font-medium">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            <LinhaDreReal
              label="Receita Operacional Bruta"
              mes={receitaMes}
              acumulado={receitaAcumulada}
            />
            <LinhaDreReal
              label="(–) Impostos sobre a receita"
              mes={impostosMes}
              acumulado={impostosAcum}
              negativo
              tooltip="DAS do Simples Nacional (depois de sair do Simples: ISS + PIS/COFINS ou CBS/IBS) — calculado de verdade assim que houver receita real lançada mês a mês (tela Vendas)."
            />
            <LinhaDreReal
              label="(=) Receita líquida"
              mes={receitaMes - impostosMes}
              acumulado={receitaAcumulada - impostosAcum}
              total
            />
            <LinhaDreReal
              label="(–) Custo dos Serviços Prestados (COGS)"
              mes={cogsMes}
              acumulado={cogsAcum}
              negativo
              tooltip={GRUPO_TOOLTIP.COGS}
              href="/relatorios/linha?grupo=cogs"
            />
            <LinhaDreReal
              label="(=) Lucro bruto"
              mes={margemBrutaMes}
              acumulado={margemBrutaAcum}
              total
            />
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
            <LinhaDreReal
              label="(–) Marca: Lançamento e Fortalecimento"
              mes={marcaMes}
              acumulado={marcaAcum}
              negativo
              tooltip={GRUPO_TOOLTIP["Marca"]}
              href="/relatorios/linha?grupo=marca"
            />
            <tr className="border-t-2 border-text bg-wine-soft">
              <td className="flex items-center px-2 py-2.5 font-bold">
                <Link
                  href="/relatorios/linha"
                  className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
                >
                  (=) EBITDA real — ver detalhamento →
                </Link>
                <InfoTooltip texto="EBITDA = lucro antes de juros, impostos, depreciação e amortização — aqui calculado só com o que já foi de fato faturado e gasto, sem projeção." />
              </td>
              <td
                className={`px-2 py-2.5 text-right font-mono font-bold ${ebitdaMes < 0 ? "text-danger" : "text-success"}`}
              >
                {formatBRL(ebitdaMes)}
              </td>
              <td
                className={`px-2 py-2.5 text-right font-mono font-bold ${ebitdaAcumulado < 0 ? "text-danger" : "text-success"}`}
              >
                {formatBRL(ebitdaAcumulado)}
              </td>
            </tr>
            {outrasAcum !== 0 && (
              <tr className="border-t border-border-soft">
                <td className="flex items-center px-2 py-2.5 text-text-faint">
                  Outras despesas (financeiro/ativos){" "}
                  <span className="ml-1">— fora da DRE operacional</span>
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-text-faint">
                  {formatBRL(outrasMes)}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-text-faint">
                  {formatBRL(outrasAcum)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {despesasTyped.length === 0 && (
          <p className="mt-4 text-[13px] text-text-muted">
            Nenhuma despesa lançada ainda — cadastre em Custos → Lançamentos.
          </p>
        )}
      </div>

      {receitaAcumulada > 0 ? (
        <div className="mb-5 rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-1 font-heading text-sm font-semibold">
            Indicadores e receita reais
          </h2>
          <p className="text-[12px] text-text-muted">
            CAC, LTV, churn e o gráfico de receita real aparecem aqui assim que
            a tela de Vendas estiver disponível.
          </p>
        </div>
      ) : (
        <p className="mb-5 text-[12px] text-text-faint">
          Indicadores (CAC, LTV, churn) e gráfico de receita real aparecem aqui
          quando houver vendas reais lançadas.
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
    <tr
      className={`border-t border-border-soft ${total ? "bg-bg font-semibold" : ""}`}
    >
      <td className="flex items-center px-2 py-2.5">
        {href ? (
          <Link
            href={href}
            className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {label} →
          </Link>
        ) : (
          label
        )}
        {tooltip && <InfoTooltip texto={tooltip} />}
      </td>
      <td
        className={`px-2 py-2.5 text-right font-mono ${negativo ? "text-danger" : ""}`}
      >
        {negativo ? `− ${formatBRL(Math.abs(mes))}` : formatBRL(mes)}
      </td>
      <td
        className={`px-2 py-2.5 text-right font-mono ${negativo ? "text-danger" : ""}`}
      >
        {negativo
          ? `− ${formatBRL(Math.abs(acumulado))}`
          : formatBRL(acumulado)}
      </td>
    </tr>
  );
}

function TopCustosChart({ despesas }: { despesas: DespesaGrupoRow[] }) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-01`;

  const porConta = new Map<
    string,
    { id: string; codigo: string; conta: string; valor: number }
  >();
  for (const d of despesas) {
    if (d.data_gasto < cutoffIso || !d.plano_contas_id || !d.plano_contas)
      continue;
    const atual = porConta.get(d.plano_contas_id) ?? {
      id: d.plano_contas_id,
      codigo: d.plano_contas.codigo,
      conta: d.plano_contas.conta,
      valor: 0,
    };
    atual.valor += Number(d.valor_total);
    porConta.set(d.plano_contas_id, atual);
  }
  const top10 = [...porConta.values()]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  if (top10.length === 0) return null;
  const max = Math.max(...top10.map((c) => c.valor));

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-sm font-semibold">
        10 maiores custos acumulados — últimos 6 meses
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Clique numa linha pra ver todos os lançamentos dela no extrato
      </p>
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
              <span className="font-mono font-semibold">
                {formatBRL(c.valor)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border-soft">
              <div
                className="h-full rounded-full bg-wine"
                style={{ width: `${(c.valor / max) * 100}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export async function RelatorioPlanos({
  cenario,
  inicio,
  fim,
  ocultarSeletorCenario,
}: {
  cenario?: string;
  inicio?: string;
  fim?: string;
  /** Usado quando essa tela é renderizada dentro de /plano/[cenarioId] — o cenário já vem fixo
   * pela URL, então não faz sentido oferecer um seletor que troca de cenário sem trocar de rota. */
  ocultarSeletorCenario?: boolean;
}) {
  const supabase = await createClient();

  const { data: cenarios } = await supabase
    .from("cenarios")
    .select("id, nome, is_base, data_inicio, data_fim")
    .order("created_at");

  const cenarioId =
    cenario ??
    (cenarios ?? []).find((c) => c.is_base)?.id ??
    (cenarios ?? [])[0]?.id ??
    "";
  const nome = (cenarios ?? []).find((c) => c.id === cenarioId)?.nome ?? "—";

  const resumo = await agregarPorCenario(supabase, cenarioId);

  // Receita realizada antes de existir produto (consultoria). Fora da simulação — só contexto.
  const { data: receitasHistoricas } = cenarioId
    ? await supabase
        .from("receitas_historicas")
        .select(
          "id, descricao, valor_mensal, data_inicio, data_fim, mostrar, entra_na_dre, observacoes",
        )
        .eq("cenario_id", cenarioId)
        .order("data_inicio")
    : { data: [] };

  const { data: alocacoes } = cenarioId
    ? await supabase
        .from("alocacao_investimento")
        .select("*")
        .eq("cenario_id", cenarioId)
        .order("created_at")
    : { data: [] };

  // Aportes/fomentos por mês (data prevista da parcela) — todos os programas vinculados, inclusive
  // fomento. A regra (o que entra na linha e o que entra no retorno) é a de carregarAportes.
  const investimentoPorMes = resumo.aportes.porMes;
  const programaIds = resumo.aportes.programas.map((p) => p.id);

  // Uso do recurso = orçamento proposto de cada programa (Fomento & Investimento → Orçamento).
  // As frentes onde o capital NOVO vai ser aplicado viram o foco padrão da planilha do investidor.
  const orcamento = await carregarOrcamentoProgramas(supabase, programaIds);
  const idsNovos = new Set(
    resumo.aportes.programas.filter((p) => p.entraNoRetorno).map((p) => p.id),
  );
  const orcamentoFoco = orcamento.some((l) => idsNovos.has(l.programa_id))
    ? orcamento.filter((l) => idsNovos.has(l.programa_id))
    : orcamento;
  const focosPadrao =
    orcamentoFoco.length > 0
      ? ([...somaPorCategoria(orcamentoFoco).keys()] as FocoInvestimento[])
      : null;
  const origemFoco =
    orcamentoFoco.length > 0
      ? `o orçamento proposto de ${[...new Set(orcamentoFoco.map((l) => resumo.aportes.programas.find((p) => p.id === l.programa_id)?.nome))].join(" e ")}`
      : null;

  // Retorno do investidor via diluição de equity (MOIC/ROI/TIR) — só programas que não são
  // fomento (subvenção não tem cap table) e que já têm valuation pós-money cadastrado.
  const { data: programasComValuation } =
    programaIds.length > 0
      ? await supabase
          .from("programas_investimento")
          .select("id, tipo, valor_total, valor_proposto, valuation_post_money, data_aporte")
          .in("id", programaIds)
          .neq("tipo", "fomento")
      : { data: [] };
  const idsElegiveis = ((programasComValuation ?? []) as { id: string }[]).map(
    (p) => p.id,
  );
  const { data: reavaliacoesRaw } =
    idsElegiveis.length > 0
      ? await supabase
          .from("reavaliacoes_valuation")
          .select(
            "programa_id, data_referencia, novo_valuation, fator_diluicao",
          )
          .in("programa_id", idsElegiveis)
      : { data: [] };
  const reavaliacoesPorPrograma = new Map<
    string,
    {
      data_referencia: string;
      novo_valuation: number;
      fator_diluicao: number;
    }[]
  >();
  for (const r of (reavaliacoesRaw ?? []) as {
    programa_id: string;
    data_referencia: string;
    novo_valuation: number;
    fator_diluicao: number;
  }[]) {
    const atual = reavaliacoesPorPrograma.get(r.programa_id) ?? [];
    atual.push(r);
    reavaliacoesPorPrograma.set(r.programa_id, atual);
  }
  const retornoInvestidor = agregarRetornoProgramas(
    (
      (programasComValuation ?? []) as {
        id: string;
        valor_total: number | null;
        valor_proposto: number | null;
        valuation_post_money: number | null;
        data_aporte: string | null;
      }[]
    ).map((p) => ({
      // Rodada em negociação: vale o valor proposto até a aprovação.
      valorInvestido: Number(p.valor_total ?? p.valor_proposto ?? 0),
      retorno: calcularRetornoPrograma({
        valor_investido: Number(p.valor_total ?? p.valor_proposto ?? 0),
        valuation_post_money:
          p.valuation_post_money != null
            ? Number(p.valuation_post_money)
            : null,
        data_aporte: p.data_aporte,
        reavaliacoes: reavaliacoesPorPrograma.get(p.id) ?? [],
      }),
    })),
  );

  // Período de análise: todo o horizonte simulado por padrão, recortado pro intervalo de mês
  // escolhido — mes_referencia é sempre "AAAA-MM-01", os inputs <input type="month"> mandam
  // "AAAA-MM", então completamos com "-01" pra comparar.
  // Sem filtro, o recorte é o PERÍODO DO CENÁRIO (data_inicio → data_fim): a simulação começa
  // no desenvolvimento de cada produto, meses antes do plano, e mostrar isso por padrão obrigava
  // a filtrar toda vez pra apresentar. O filtro continua podendo ampliar ou reduzir.
  const primeiroMes =
    resumo.periodo.inicio ?? resumo.linhas[0]?.mes_referencia ?? null;
  const ultimoMes =
    resumo.periodo.fim ??
    resumo.linhas[resumo.linhas.length - 1]?.mes_referencia ??
    null;
  const linhasPeriodo = recortarPeriodo(
    resumo.linhas,
    inicio ?? primeiroMes,
    fim ?? ultimoMes,
  );

  const metricas = computeMetricas(
    linhasPeriodo,
    resumo.totalInvestido,
    resumo.aportes.capitalNovoPorMes,
  );
  const mesesDoPeriodo = new Set(linhasPeriodo.map((l) => l.mes_referencia));
  const aportesPeriodoPorPrograma = resumo.aportes.programas
    .map((p) => ({
      ...p,
      valorPeriodo: p.parcelas
        .filter((x) => mesesDoPeriodo.has(x.mes))
        .reduce((s, x) => s + x.valor, 0),
    }))
    .filter((p) => p.valorPeriodo > 0);
  const totalAportesPeriodo = aportesPeriodoPorPrograma.reduce(
    (s, p) => s + p.valorPeriodo,
    0,
  );
  // DRE em colunas: os 3 últimos anos do período (cada um com suas próprias métricas) + o total.
  const anosDoPeriodo = [
    ...new Set(linhasPeriodo.map((l) => l.mes_referencia.slice(0, 4))),
  ]
    .sort()
    .slice(-3);
  const colunasAno = anosDoPeriodo.map((ano) => {
    const doAno = linhasPeriodo.filter(
      (l) => l.mes_referencia.slice(0, 4) === ano,
    );
    const mesesAno = new Set(doAno.map((l) => l.mes_referencia));
    return {
      ano,
      meses: doAno.length,
      metricas: computeMetricas(
        doAno,
        resumo.totalInvestido,
        resumo.aportes.capitalNovoPorMes,
      ),
      aportes: resumo.aportes.programas.reduce(
        (s, p) =>
          s +
          p.parcelas
            .filter((x) => mesesAno.has(x.mes))
            .reduce((a, x) => a + x.valor, 0),
        0,
      ),
    };
  });
  const inicioSel = inicio ?? (primeiroMes ? primeiroMes.slice(0, 7) : "");
  const fimSel = fim ?? (ultimoMes ? ultimoMes.slice(0, 7) : "");

  // Base do valor de saída na simulação de retorno: ARR (MRR × 12) do último mês do período e
  // EBITDA dos últimos 12 meses, já depois de IRPJ/CSLL.
  const { data: mrrRows } = cenarioId
    ? await supabase
        .from("simulacao_mensal")
        .select("mes_referencia, mrr")
        .eq("cenario_id", cenarioId)
    : { data: [] };
  const mrrPorMes = new Map<string, number>();
  for (const r of (mrrRows ?? []) as {
    mes_referencia: string;
    mrr: number | null;
  }[]) {
    mrrPorMes.set(
      r.mes_referencia,
      (mrrPorMes.get(r.mes_referencia) ?? 0) + Number(r.mrr ?? 0),
    );
  }
  const mesSaida =
    linhasPeriodo[linhasPeriodo.length - 1]?.mes_referencia ?? "";
  const arrNaSaida = mesSaida ? (mrrPorMes.get(mesSaida) ?? 0) * 12 : 0;
  const ebitdaNaSaida = linhasPeriodo
    .slice(-12)
    .reduce((s, l) => s + l.ebitda - l.irpjCsll, 0);
  const rodada =
    (
      (programasComValuation ?? []) as {
        nome?: string;
        valor_total: number;
        valuation_post_money: number | null;
        data_aporte: string | null;
      }[]
    )[0] ?? null;
  const capitalPadrao = rodada
    ? Number(rodada.valor_total)
    : resumo.totalInvestido;
  const equityPadrao =
    rodada && rodada.valuation_post_money
      ? (Number(rodada.valor_total) / Number(rodada.valuation_post_money)) * 100
      : 10;
  const mesAportePadrao =
    (rodada?.data_aporte
      ? `${String(rodada.data_aporte).slice(0, 7)}-01`
      : null) ??
    metricas.mesCapital ??
    linhasPeriodo[0]?.mes_referencia ??
    "";

  const semDados = resumo.linhas.length === 0;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-[13px] text-text-muted">
          Resultado consolidado (todos os produtos) do cenário selecionado
        </p>
        <Link
          href="/relatorios/mensal"
          className="rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-primary-deep"
        >
          Detalhamento Mensal por Produto
        </Link>
      </div>

      <form
        method="get"
        className="mb-6 grid grid-cols-[1fr_auto_auto_auto] items-end gap-4"
      >
        {ocultarSeletorCenario ? (
          <input type="hidden" name="cenario" value={cenarioId} />
        ) : (
          <>
            <input type="hidden" name="aba" value="planos" />
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-text-muted">
                Cenário
              </label>
              <select
                name="cenario"
                defaultValue={cenarioId}
                className="input w-full"
              >
                {(cenarios ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-text-muted">
            De
          </label>
          <input
            type="month"
            name="inicio"
            defaultValue={inicioSel}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-text-muted">
            Até
          </label>
          <input
            type="month"
            name="fim"
            defaultValue={fimSel}
            className="input"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white"
        >
          Aplicar
        </button>
      </form>

      {semDados ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-text-muted">
            Nenhuma projeção calculada nesse cenário ainda — recalcule em
            Produtos primeiro.
          </p>
        </div>
      ) : (
        <>
          <ExportarInvestidor
            cenarioId={cenarioId}
            inicio={inicioSel}
            fim={fimSel}
            focosPadrao={focosPadrao}
            origemFoco={origemFoco}
          />
          <MetricasInvestidor
            nome={nome}
            metricas={metricas}
            totalInvestido={resumo.totalInvestido}
            retornoInvestidor={retornoInvestidor}
            cenarioId={cenarioId}
            inicio={inicioSel}
            fim={fimSel}
          />
          {capitalPadrao > 0 && mesSaida && (
            <SimuladorRetorno
              capitalPadrao={capitalPadrao}
              equityPadrao={equityPadrao}
              mesAportePadrao={mesAportePadrao}
              mesSaida={mesSaida}
              arrNaSaida={arrNaSaida}
              ebitdaNaSaida={ebitdaNaSaida}
              paybackMes={metricas.paybackMes}
              paybackMeses={metricas.paybackMeses}
              capitalRecuperadoPct={metricas.roiPct}
              tirProjetoPct={metricas.tirAnualPct}
              nomeRodada={
                resumo.aportes.programas.find((p) => p.entraNoRetorno)?.nome ??
                null
              }
            />
          )}
          <IndicadoresPeriodo
            metricas={metricas}
            colunasAno={colunasAno}
            totalAportesPeriodo={totalAportesPeriodo}
            aportesPorPrograma={aportesPeriodoPorPrograma}
            cenarioId={cenarioId}
            inicio={inicioSel}
            fim={fimSel}
          />
          <UsoDoRecurso
            programas={resumo.aportes.programas}
            orcamento={orcamento}
          />
          <ReceitasHistoricas
            cenarioId={cenarioId}
            itens={(receitasHistoricas ?? []) as ReceitaHistorica[]}
            periodo={resumo.periodo}
            somenteLeitura
            linkEditar={`/plano/${cenarioId}/vendas#tracao`}
          />
          <AlocacaoInvestimento
            cenarioId={cenarioId}
            itens={alocacoes ?? []}
            nomeCenario={nome}
          />
          <GraficoReceitaEInvestimento
            nome={nome}
            linhasPeriodo={linhasPeriodo}
            investimentoPorMes={investimentoPorMes}
          />
        </>
      )}
    </>
  );
}

function MetricasInvestidor({
  nome,
  metricas,
  totalInvestido,
  retornoInvestidor,
  cenarioId,
  inicio,
  fim,
}: {
  nome: string;
  metricas: Metricas;
  totalInvestido: number;
  retornoInvestidor: ReturnType<typeof agregarRetornoProgramas>;
  cenarioId: string;
  inicio: string;
  fim: string;
}) {
  function hrefDetalhe(indicador: string) {
    return `/plano/${cenarioId}/indicadores/${indicador}?inicio=${inicio}&fim=${fim}`;
  }

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-sm font-semibold">
        Métricas para investidor — {nome}
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Clique num indicador pra ver o cálculo mês a mês e ajustar os
        lançamentos por trás dele
      </p>
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
          valor={
            metricas.breakEvenMes
              ? formatMes(metricas.breakEvenMes)
              : "não atingido"
          }
          detalhe={
            metricas.breakEvenClientes != null
              ? `com ${metricas.breakEvenClientes.toLocaleString("pt-BR")} clientes`
              : "no período selecionado"
          }
        />
        <Metrica
          href={hrefDetalhe("margem_operacional")}
          label="Margem operacional"
          valor={
            metricas.margemOperacional != null
              ? `${metricas.margemOperacional.toFixed(0)}%`
              : "—"
          }
          detalhe="EBITDA / receita, no período"
        />
        <Metrica
          href={hrefDetalhe("margem_bruta")}
          label="Margem bruta"
          valor={
            metricas.margemBruta != null
              ? `${metricas.margemBruta.toFixed(0)}%`
              : "—"
          }
          detalhe={
            metricas.receitaAcumulada > 0
              ? `lucro bruto ÷ receita líquida${metricas.margemBrutaAssinatura != null ? ` · só assinatura ${metricas.margemBrutaAssinatura.toFixed(0)}%` : ""}`
              : "lucro bruto ÷ receita líquida"
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
          href={hrefDetalhe("pmv")}
          label="Preço médio de venda"
          valor={
            metricas.precoMedioVenda != null
              ? formatBRL(metricas.precoMedioVenda)
              : "recalcule a projeção"
          }
          detalhe={
            metricas.arpaRecorrente != null
              ? `mensalidade de tabela · ARPA recorrente ${formatBRL(metricas.arpaRecorrente)}`
              : "mensalidade de tabela, ponderada pelas vendas"
          }
        />
        {/* Implantação é serviço profissional: receita única, fora do MRR/ARR/PMV/ARPA — mas é o
            caixa do mês 1, e é com ele que o CAC se compara. */}
        <Metrica
          href={hrefDetalhe("ticket_entrada")}
          label="Ticket de entrada (mês 1)"
          valor={
            metricas.ticketEntrada != null
              ? formatBRL(metricas.ticketEntrada)
              : "sem implantação no plano"
          }
          detalhe={
            metricas.ticketEntrada != null && metricas.cacMedio != null
              ? metricas.ticketEntrada >= metricas.cacMedio
                ? `implantação no ato + 1ª mensalidade · cobre o CAC de ${formatBRL(metricas.cacMedio)}`
                : `implantação no ato + 1ª mensalidade · CAC de ${formatBRL(metricas.cacMedio)}`
              : "implantação que o cliente quita no ato + 1ª mensalidade"
          }
        />
        <Metrica
          href={hrefDetalhe("ticket_entrada")}
          label="Receita por cobrança"
          valor={
            metricas.ticketMedio != null ? formatBRL(metricas.ticketMedio) : "—"
          }
          detalhe="receita ÷ cobranças do mês — inclui implantação e descontos"
        />
        <Metrica
          href={hrefDetalhe("churn")}
          label="Churn médio"
          valor={
            metricas.churnMedio != null
              ? `${metricas.churnMedio.toFixed(1)}%/mês`
              : "—"
          }
          detalhe="taxa planejada por fase, não realizada"
        />
        <Metrica
          href={hrefDetalhe("retorno_investimento")}
          label="Capital coberto por caixa próprio"
          valor={
            totalInvestido > 0 && metricas.roiPct != null
              ? `${metricas.roiPct.toFixed(0)}%`
              : "sem captação vinculada"
          }
          detalhe={
            totalInvestido > 0
              ? `${formatBRL(metricas.investimentoRecuperado)} de caixa gerado${
                  metricas.paybackMes
                    ? ` até ${formatMes(metricas.paybackMes)}`
                    : fim
                      ? ` até ${formatMes(`${fim}-01`)}`
                      : ""
                }`
              : "cenário sem captação que exija retorno (fomento não entra nessa conta)"
          }
        />
        <Metrica
          href={hrefDetalhe("tir")}
          label="TIR do projeto (empresa)"
          valor={
            metricas.tirAnualPct != null
              ? `${metricas.tirAnualPct.toFixed(1)}% a.a.`
              : "não se aplica"
          }
          detalhe={
            metricas.tirAnualPct != null
              ? metricas.tirBase === "capital_novo"
                ? "fluxo da empresa — o retorno do investidor está na simulação da rodada"
                : "fluxo de caixa do período (queima = investimento)"
              : "o fluxo não tem saída e retorno no período"
          }
        />
        <Metrica
          href="/fomento"
          label="Retorno do investidor (equity)"
          valor={
            retornoInvestidor.temValuation && retornoInvestidor.roiPct != null
              ? `${retornoInvestidor.roiPct.toFixed(0)}%`
              : "sem valuation cadastrado"
          }
          detalhe={
            retornoInvestidor.temValuation
              ? `MOIC ${retornoInvestidor.moic?.toFixed(2)}x${retornoInvestidor.tirPct != null ? ` · TIR ${retornoInvestidor.tirPct.toFixed(1)}% a.a.` : " · sem reavaliação: veja a simulação da rodada"}`
              : "cadastre o valuation em Fomento pra calcular"
          }
        />
      </div>
    </div>
  );
}

/** Como o recurso de cada programa vinculado vai ser usado — lido do Orçamento proposto. */
function UsoDoRecurso({
  programas,
  orcamento,
}: {
  programas: ProgramaAporte[];
  orcamento: LinhaOrcamento[];
}) {
  if (programas.length === 0) return null;
  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 flex items-center font-heading text-[13px] font-semibold">
        Uso do recurso — orçamento proposto
        <InfoTooltip texto="Vem da tela Fomento & Investimento → programa → Orçamento proposto (atividade, período, rubrica, conta do plano de contas e valor). A conta define a frente: marketing, vendas, produto (P&D), operação (COGS) ou estrutura (G&A). Também é a base do 'foco do investimento' da planilha." />
      </h2>
      <p className="mb-3 text-[11px] text-text-muted">
        Onde cada programa vinculado ao cenário aplica o dinheiro
      </p>
      <div className="flex flex-col gap-2.5">
        {programas.map((p) => {
          const linhas = orcamento.filter((l) => l.programa_id === p.id);
          const total = linhas.reduce((s, l) => s + l.valor, 0);
          const porCategoria = [...somaPorCategoria(linhas).entries()].sort(
            (a, b) => b[1] - a[1],
          );
          return (
            <div
              key={p.id}
              className="rounded-lg border border-border-soft px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-3 text-[12px]">
                <span className="font-medium">
                  {p.nome}{" "}
                  <span className="text-[10.5px] font-normal text-text-faint">
                    {p.entraNoRetorno
                      ? "investimento novo"
                      : p.tipo === "fomento"
                        ? "fomento"
                        : "já aplicado"}
                  </span>
                </span>
                <Link
                  href={`/fomento/${p.id}/orcamento`}
                  className="text-[11px] text-primary-deep underline"
                >
                  {linhas.length > 0
                    ? "Editar orçamento →"
                    : "Cadastrar orçamento →"}
                </Link>
              </div>
              {linhas.length === 0 ? (
                <p className="mt-1 text-[11px] text-text-faint">
                  Sem orçamento proposto cadastrado.
                </p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-text-muted">
                  {porCategoria.map(([cat, v]) => (
                    <span key={cat}>
                      {LABEL_CATEGORIA_USO[cat]}:{" "}
                      <span className="font-mono text-text">
                        {formatBRL(v)}
                      </span>{" "}
                      <span className="text-text-faint">
                        ({total > 0 ? ((v / total) * 100).toFixed(0) : 0}%)
                      </span>
                    </span>
                  ))}
                  <span className="text-text-faint">
                    · total {formatBRL(total)}
                    {Math.abs(total - p.valorTotal) > 1 &&
                      ` de ${formatBRL(p.valorTotal)} do programa`}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metrica({
  href,
  label,
  valor,
  detalhe,
}: {
  href: string;
  label: string;
  valor: string;
  detalhe: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg bg-bg p-3 transition-colors hover:bg-primary-soft/40"
    >
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-text-faint">
        {label}
      </div>
      <div className="mt-1 text-[16px] font-semibold text-text">{valor}</div>
      <div className="mt-0.5 text-[10.5px] text-text-muted">{detalhe}</div>
    </Link>
  );
}

type ColunaAno = {
  ano: string;
  meses: number;
  metricas: Metricas;
  aportes: number;
};

function IndicadoresPeriodo({
  metricas,
  colunasAno,
  totalAportesPeriodo,
  aportesPorPrograma,
  cenarioId,
  inicio,
  fim,
}: {
  metricas: Metricas;
  colunasAno: ColunaAno[];
  totalAportesPeriodo: number;
  aportesPorPrograma: (ProgramaAporte & { valorPeriodo: number })[];
  cenarioId: string;
  inicio: string;
  fim: string;
}) {
  const hrefEbitda = `/plano/${cenarioId}/indicadores/margem_operacional?inicio=${inicio}&fim=${fim}`;
  // Sempre leva pro detalhamento dentro do Plano (dados projetados) — nunca pro drill-down de
  // despesas reais, que fica só na aba Realizado. A tela de detalhe já mostra a cascata inteira
  // (COGS/S&M/P&D/G&A) mês a mês, então qualquer linha aqui aponta pro mesmo lugar de propósito.
  // Cada linha abre o que a compõe (origem por origem, por produto); o EBITDA abre a cascata mês a mês.
  const hrefLinha = (grupo: string) =>
    `/plano/${cenarioId}/indicadores/${grupo}?inicio=${inicio}&fim=${fim}`;
  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 font-heading text-sm font-semibold">
        DRE do período selecionado
      </h2>
      <p className="mb-3 text-[11px] text-text-muted">
        Os valores aqui são a projeção do cenário; clique em COGS, S&amp;M,
        P&amp;D ou G&amp;A pra ver o que entra em cada linha, origem por origem
        e por produto — e no EBITDA pra ver a cascata mês a mês.
      </p>
      {/* Colunas: 3 últimos anos + total do período. Cada linha recebe um seletor e a tabela repete
          o valor por coluna — assim a cascata inteira (até CAC) sai ano a ano sem duplicar markup. */}
      {(() => {
        const cols: {
          rotulo: string;
          sub?: string;
          m: Metricas;
          aportes: number;
          total?: boolean;
        }[] = [
          ...colunasAno.map((c) => ({
            rotulo: c.ano,
            sub: c.meses !== 12 ? `${c.meses} meses` : undefined,
            m: c.metricas,
            aportes: c.aportes,
          })),
          {
            rotulo: "Total",
            sub: colunasAno.length < 4 ? "período" : undefined,
            m: metricas,
            aportes: totalAportesPeriodo,
            total: true,
          },
        ];
        const larga = cols.length > 1;
        return (
          <div className="overflow-x-auto">
            <table
              className={`w-full border-collapse ${larga ? "text-[12px]" : "text-[12.5px]"}`}
            >
              {larga && (
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-text-faint">
                    <th></th>
                    {cols.map((c) => (
                      <th
                        key={c.rotulo}
                        className={`px-2 pb-1.5 text-right font-medium ${c.total ? "border-l border-border-soft" : ""}`}
                      >
                        {c.rotulo}
                        {c.sub && (
                          <span className="ml-1 normal-case tracking-normal">
                            ({c.sub})
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                <DreLinha
                  label="Receita Operacional Bruta"
                  cols={cols}
                  valor={(m) => m.receitaAcumulada}
                />
                <DreLinha
                  label="(–) Impostos sobre a receita"
                  cols={cols}
                  valor={(m) => -m.impostosAcumulados}
                  negativo
                  tooltip="Enquanto a empresa está no Simples: DAS (Anexo III ou V pelo Fator R), mês a mês pelo RBT12. Quando o faturamento do ano passa de R$ 4,8 mi: ISS + PIS/COFINS ou, na reforma, CBS/IBS — já descontado o crédito sobre compras de fornecedor. Alíquotas em Configurações."
                />
                <DreLinha
                  label="(=) Receita líquida"
                  cols={cols}
                  valor={(m) => m.receitaLiquidaAcumulada}
                  total
                />
                <DreLinha
                  label="(–) Custo dos Serviços Prestados (COGS)"
                  cols={cols}
                  valor={(m) => -m.cogsAcumulado}
                  negativo
                  href={hrefLinha("cogs")}
                />
                <DreLinha
                  label="(=) Lucro bruto"
                  cols={cols}
                  valor={(m) => m.margemBrutaValor}
                  extra={(m) =>
                    m.margemBruta != null
                      ? `${m.margemBruta.toFixed(0)}%`
                      : null
                  }
                  tooltip="Margem bruta = lucro bruto ÷ receita líquida (padrão SaaS). O percentual aparece embaixo do valor em cada coluna."
                  total
                />
                <DreLinha
                  label="(–) Vendas e Marketing (S&M)"
                  cols={cols}
                  valor={(m) => -m.smAcumulado}
                  negativo
                  href={hrefLinha("sm")}
                  extra={(m) => pctReceita(m.smAcumulado, m.receitaAcumulada)}
                />
                <DreLinha
                  label="(–) Pesquisa e Desenvolvimento (P&D)"
                  cols={cols}
                  valor={(m) => -m.pdAcumulado}
                  negativo
                  href={hrefLinha("pd")}
                  extra={(m) => pctReceita(m.pdAcumulado, m.receitaAcumulada)}
                />
                <DreLinha
                  label="(–) Geral e Administrativo (G&A)"
                  cols={cols}
                  valor={(m) => -m.gaAcumulado}
                  negativo
                  href={hrefLinha("ga")}
                  extra={(m) => pctReceita(m.gaAcumulado, m.receitaAcumulada)}
                />
                <tr className="border-t border-border-soft bg-wine-soft">
                  <td className="px-2 py-2.5 font-semibold">
                    <Link
                      href={hrefEbitda}
                      className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
                    >
                      (=) EBITDA — ver detalhamento →
                    </Link>
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.rotulo}
                      className={`px-2 py-2.5 text-right font-mono font-semibold ${c.total ? "border-l border-border-soft" : ""} ${c.m.ebitdaAcumulado < 0 ? "text-danger" : "text-success"}`}
                    >
                      {formatBRL(c.m.ebitdaAcumulado)}
                      {c.m.margemOperacional != null && (
                        <span className="block text-[10px] font-normal text-text-faint">
                          {c.m.margemOperacional.toFixed(0)}%
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
                {metricas.irpjCsllAcumulado > 0 && (
                  <>
                    <DreLinha
                      label="(–) IRPJ e CSLL (fora do Simples)"
                      cols={cols}
                      valor={(m) => -m.irpjCsllAcumulado}
                      negativo
                      tooltip="No Simples, IRPJ e CSLL estão dentro do DAS. Depois que a empresa sai, são calculados à parte sobre o lucro presumido (32% da receita) e ficam abaixo do EBITDA. É esse resultado que devolve o capital (payback e TIR)."
                    />
                    <DreLinha
                      label="(=) Resultado depois de IRPJ/CSLL"
                      cols={cols}
                      valor={(m) => m.resultadoAposIrAcumulado}
                      total
                    />
                  </>
                )}
                <tr className="border-t border-border-soft">
                  <td className="flex items-center px-2 py-2.5 text-text-muted">
                    5. Aportes e Investimentos (Capital)
                    <InfoTooltip texto="Fora da DRE — não abate do EBITDA acima. Soma todos os programas vinculados ao cenário (fomento, investimento, mútuo, empréstimo) nas datas previstas das parcelas. O fomento entra como se já estivesse aplicado; o retorno é calculado só sobre o investimento novo." />
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.rotulo}
                      className={`px-2 py-2.5 text-right font-mono text-text-muted ${c.total ? "border-l border-border-soft" : ""}`}
                    >
                      {formatBRL(c.aportes)}
                    </td>
                  ))}
                </tr>
                {aportesPorPrograma.map((p) => (
                  <tr key={p.id} className="text-[11.5px]">
                    <td
                      className="py-1 pl-6 pr-2 text-text-muted"
                      colSpan={cols.length}
                    >
                      {p.nome}
                      <span
                        className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${p.entraNoRetorno ? "bg-wine-soft text-wine-deep" : "bg-bg text-text-faint"}`}
                      >
                        {p.entraNoRetorno
                          ? "investimento novo · entra no retorno"
                          : p.tipo === "fomento"
                            ? "fomento · fora do retorno"
                            : "já aplicado · fora do retorno"}
                      </span>
                      <span className="ml-2 font-mono">
                        {formatBRL(p.valorPeriodo)} no período
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border-soft bg-bg">
                  <td className="flex items-center px-2 py-2.5 font-semibold">
                    (=) EBITDA + aportes (caixa gerado)
                    <InfoTooltip texto="O resultado operacional somado ao capital que entra. Mostra se a captação (existente + nova) cobre a queima até o break-even." />
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.rotulo}
                      className={`px-2 py-2.5 text-right font-mono font-semibold ${c.total ? "border-l border-border-soft" : ""} ${c.m.ebitdaAcumulado + c.aportes < 0 ? "text-danger" : "text-success"}`}
                    >
                      {formatBRL(c.m.ebitdaAcumulado + c.aportes)}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-border-soft">
                  <td className="px-2 py-2.5">
                    Clientes ativos (início → fim)
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.rotulo}
                      className={`px-2 py-2.5 text-right font-mono ${c.total ? "border-l border-border-soft" : ""}`}
                    >
                      {c.m.clientesInicio.toLocaleString("pt-BR")} →{" "}
                      {c.m.clientesFinal.toLocaleString("pt-BR")}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-border-soft">
                  <td className="flex items-center px-2 py-2.5">
                    CAC médio (all-in)
                    <InfoTooltip texto="CAC ponderado pelos clientes novos de cada mês — quanto custou, em média, adquirir cada cliente, dentro do período." />
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.rotulo}
                      className={`px-2 py-2.5 text-right font-mono ${c.total ? "border-l border-border-soft" : ""}`}
                    >
                      {c.m.cacMedio != null ? formatBRL(c.m.cacMedio) : "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}
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
  const investimentos = linhasPeriodo.map(
    (l) => investimentoPorMes.get(l.mes_referencia) ?? 0,
  );
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
        <h2 className="font-heading text-sm font-semibold">
          Receita e investimento — {nome}
        </h2>
      </div>
      <div className="mb-3 flex items-center gap-4">
        <Legenda cor="var(--color-primary-fill)" texto="Receita mensal" />
        {temInvestimento && (
          <Legenda
            cor="var(--color-wine)"
            texto="Aportes/fomentos (parcela do mês)"
          />
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height + 28}`}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          overflow: "visible",
        }}
      >
        <line
          x1="0"
          y1={height}
          x2={width}
          y2={height}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        <path
          d={buildPath(receitas, width, height, min, max)}
          fill="none"
          stroke="var(--color-primary-fill)"
          strokeWidth={2.5}
        />
        {temInvestimento && (
          <path
            d={buildPath(investimentos, width, height, min, max)}
            fill="none"
            stroke="var(--color-wine)"
            strokeWidth={2.5}
          />
        )}
        {linhasPeriodo.map((l, i) => {
          if (i !== 0 && i !== totalMeses - 1 && i % passo !== 0) return null;
          return (
            <text
              key={l.mes_referencia}
              x={i * step}
              y={height + 20}
              fontSize="11"
              textAnchor="middle"
              fill="var(--color-text-faint)"
            >
              {formatMes(l.mes_referencia)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function pctReceita(valor: number, receita: number): string | null {
  return receita > 0 ? `${((valor / receita) * 100).toFixed(0)}%` : null;
}

function DreLinha({
  label,
  cols,
  valor,
  extra,
  negativo,
  total,
  tooltip,
  href,
}: {
  label: string;
  cols: { rotulo: string; m: Metricas; total?: boolean }[];
  valor: (m: Metricas) => number;
  /** Texto pequeno embaixo do valor (ex.: % da receita). */
  extra?: (m: Metricas) => string | null;
  negativo?: boolean;
  total?: boolean;
  tooltip?: string;
  href?: string;
}) {
  return (
    <tr
      className={`border-t border-border-soft ${total ? "bg-bg font-semibold" : ""}`}
    >
      <td className="flex items-center px-2 py-2.5">
        {href ? (
          <Link
            href={href}
            className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {label} →
          </Link>
        ) : (
          label
        )}
        {tooltip && <InfoTooltip texto={tooltip} />}
      </td>
      {cols.map((c) => {
        const v = valor(c.m);
        const e = extra?.(c.m);
        return (
          <td
            key={c.rotulo}
            className={`px-2 py-2 text-right font-mono ${negativo ? "text-danger" : ""} ${c.total ? "border-l border-border-soft" : ""}`}
          >
            {negativo ? `− ${formatBRL(Math.abs(v))}` : formatBRL(v)}
            {e && (
              <span className="block text-[10px] font-normal text-text-faint">
                {e}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block h-[2px] w-3.5"
        style={{ background: cor }}
      />
      <span className="text-[11px] text-text-muted">{texto}</span>
    </div>
  );
}
