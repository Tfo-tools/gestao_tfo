import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  agregarPorCenario,
  computeMetricas,
  type Metricas,
} from "@/lib/relatorios-cenario";
import {
  linhasMensaisInvestidor,
  resumoAnualInvestidor,
  type LinhaAnualInvestidor,
} from "@/lib/indicadores-investidor";
import { InfoTooltip } from "@/components/info-tooltip";

// Consolida todos os cenários de uma vez — leva alguns segundos com vários.
export const maxDuration = 60;

type Coluna = {
  id: string;
  nome: string;
  isBase: boolean;
  periodo: string;
  programas: string;
  metricas: Metricas;
  anual: LinhaAnualInvestidor[];
  clientesFim: number;
  arrFim: number;
  caixaMinimo: number;
  capitalNovo: number;
};

const brl = (v: number | null | undefined, casas = 0) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: casas,
      });
const brlCurto = (v: number | null | undefined) => {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1_000_000)
    return `${v < 0 ? "-" : ""}R$ ${(a / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000)
    return `${v < 0 ? "-" : ""}R$ ${(a / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return brl(v);
};
const pct = (v: number | null | undefined, casas = 0) =>
  v == null
    ? "—"
    : `${v.toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
const mesAno = (iso: string | null) =>
  iso
    ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
      })
    : "—";

/**
 * Os mesmos indicadores, um cenário por coluna. Cada cenário é lido no período dele — quando os
 * períodos diferem, a linha "Período" avisa e os totais acumulados não são comparáveis um a um;
 * os de ponta (clientes, ARR, margens, CAC) são.
 */
export default async function CompararCenariosPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  const { c: cParam } = await searchParams;
  const supabase = await createClient();
  const { data: cenarios } = await supabase
    .from("cenarios")
    .select("id, nome, is_base, data_inicio, data_fim")
    .order("created_at");
  const escolhidos = cParam
    ? (Array.isArray(cParam) ? cParam : [cParam]).filter(Boolean)
    : null;
  const lista = (cenarios ?? []).filter(
    (c) => !escolhidos || escolhidos.includes(c.id),
  );

  const colunas: Coluna[] = [];
  for (const c of lista) {
    const resumo = await agregarPorCenario(supabase, c.id);
    if (resumo.linhasPeriodo.length === 0) continue;
    const metricas = computeMetricas(
      resumo.linhasPeriodo,
      resumo.totalInvestido,
      resumo.aportes.capitalNovoPorMes,
    );
    const { data: simRows } = await supabase
      .from("simulacao_mensal")
      .select("mes_referencia, mrr, clientes_perdidos")
      .eq("cenario_id", c.id);
    const mrrPorMes = new Map<string, number>();
    const perdidosPorMes = new Map<string, number>();
    for (const r of simRows ?? []) {
      mrrPorMes.set(
        r.mes_referencia,
        (mrrPorMes.get(r.mes_referencia) ?? 0) + Number(r.mrr ?? 0),
      );
      perdidosPorMes.set(
        r.mes_referencia,
        (perdidosPorMes.get(r.mes_referencia) ?? 0) +
          Number(r.clientes_perdidos ?? 0),
      );
    }
    const mensal = linhasMensaisInvestidor(resumo.linhasPeriodo, {
      mrrPorMes,
      perdidosPorMes,
      aportesPorMes: resumo.aportes.porMes,
    });
    const anual = resumoAnualInvestidor(mensal);
    const ultimo = mensal[mensal.length - 1];
    colunas.push({
      id: c.id,
      nome: c.nome,
      isBase: c.is_base === true,
      periodo: `${mesAno(resumo.periodo.inicio)} → ${mesAno(resumo.periodo.fim)}`,
      programas: resumo.aportes.programas.map((p) => p.nome).join(" + ") || "—",
      metricas,
      anual,
      clientesFim: ultimo?.clientes ?? 0,
      arrFim: (ultimo?.mrr ?? 0) * 12,
      caixaMinimo: Math.min(0, ...mensal.map((m) => m.caixaAcumulado)),
      capitalNovo: resumo.totalInvestido,
    });
  }

  const periodosDiferem = new Set(colunas.map((c) => c.periodo)).size > 1;
  const anos = [
    ...new Set(colunas.flatMap((c) => c.anual.map((a) => a.ano))),
  ].sort();

  type Linha = {
    grupo: string;
    label: string;
    tooltip?: string;
    valor: (c: Coluna) => string;
    melhor?: "maior" | "menor";
    num?: (c: Coluna) => number | null;
  };
  const linhas: Linha[] = [
    { grupo: "Cenário", label: "Período", valor: (c) => c.periodo },
    { grupo: "Cenário", label: "Programas", valor: (c) => c.programas },
    {
      grupo: "Cenário",
      label: "Capital novo",
      tooltip: "Investimento ainda não aplicado; fomento fica fora.",
      valor: (c) => (c.capitalNovo > 0 ? brlCurto(c.capitalNovo) : "—"),
    },
    {
      grupo: "Tamanho",
      label: "Clientes ativos no fim",
      valor: (c) => c.clientesFim.toLocaleString("pt-BR"),
      num: (c) => c.clientesFim,
      melhor: "maior",
    },
    {
      grupo: "Tamanho",
      label: "ARR no fim",
      tooltip: "MRR do último mês × 12.",
      valor: (c) => brlCurto(c.arrFim),
      num: (c) => c.arrFim,
      melhor: "maior",
    },
    {
      grupo: "Tamanho",
      label: "Receita acumulada",
      valor: (c) => brlCurto(c.metricas.receitaAcumulada),
      num: (c) => c.metricas.receitaAcumulada,
      melhor: "maior",
    },
    {
      grupo: "Resultado",
      label: "EBITDA acumulado",
      valor: (c) => brlCurto(c.metricas.ebitdaAcumulado),
      num: (c) => c.metricas.ebitdaAcumulado,
      melhor: "maior",
    },
    {
      grupo: "Resultado",
      label: "Margem EBITDA",
      valor: (c) => pct(c.metricas.margemOperacional),
      num: (c) => c.metricas.margemOperacional,
      melhor: "maior",
    },
    {
      grupo: "Resultado",
      label: "Margem bruta de software",
      valor: (c) => pct(c.metricas.margemBrutaAssinatura),
      num: (c) => c.metricas.margemBrutaAssinatura,
      melhor: "maior",
    },
    {
      grupo: "Resultado",
      label: "Margem bruta (blended)",
      valor: (c) => pct(c.metricas.margemBruta),
      num: (c) => c.metricas.margemBruta,
      melhor: "maior",
    },
    {
      grupo: "Unit economics",
      label: "CAC",
      valor: (c) => brl(c.metricas.cacMedio),
      num: (c) => c.metricas.cacMedio,
      melhor: "menor",
    },
    {
      grupo: "Unit economics",
      label: "LTV",
      valor: (c) => brl(c.metricas.ltvMedio),
      num: (c) => c.metricas.ltvMedio,
      melhor: "maior",
    },
    {
      grupo: "Unit economics",
      label: "LTV : CAC",
      valor: (c) =>
        c.metricas.ltvMedio != null && c.metricas.cacMedio
          ? `${(c.metricas.ltvMedio / c.metricas.cacMedio).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`
          : "—",
      num: (c) =>
        c.metricas.ltvMedio != null && c.metricas.cacMedio
          ? c.metricas.ltvMedio / c.metricas.cacMedio
          : null,
      melhor: "maior",
    },
    {
      grupo: "Unit economics",
      label: "ARPA (recorrente)",
      valor: (c) => brl(c.metricas.arpaRecorrente),
      num: (c) => c.metricas.arpaRecorrente,
      melhor: "maior",
    },
    {
      grupo: "Unit economics",
      label: "Churn médio mensal",
      valor: (c) => pct(c.metricas.churnMedio, 1),
      num: (c) => c.metricas.churnMedio,
      melhor: "menor",
    },
    {
      grupo: "Caixa e retorno",
      label: "Break-even",
      valor: (c) =>
        c.metricas.breakEvenMes
          ? mesAno(c.metricas.breakEvenMes)
          : "não atinge",
    },
    {
      grupo: "Caixa e retorno",
      label: "Necessidade máxima de caixa",
      tooltip:
        "Ponto mais baixo do caixa acumulado (aportes + EBITDA). Zero = os aportes cobrem tudo.",
      valor: (c) => brlCurto(c.caixaMinimo),
      num: (c) => c.caixaMinimo,
      melhor: "maior",
    },
    {
      grupo: "Caixa e retorno",
      label: "Payback do capital",
      valor: (c) =>
        c.metricas.paybackMeses != null
          ? `${c.metricas.paybackMeses} meses`
          : "—",
      num: (c) => c.metricas.paybackMeses,
      melhor: "menor",
    },
    {
      grupo: "Caixa e retorno",
      label: "ROI do capital novo",
      valor: (c) => pct(c.metricas.roiPct),
      num: (c) => c.metricas.roiPct,
      melhor: "maior",
    },
    {
      grupo: "Caixa e retorno",
      label: "TIR (a.a.)",
      valor: (c) => pct(c.metricas.tirAnualPct),
      num: (c) => c.metricas.tirAnualPct,
      melhor: "maior",
    },
  ];

  const melhorDe = (l: Linha): string | null => {
    if (!l.num || !l.melhor || colunas.length < 2) return null;
    const vals = colunas
      .map((c) => ({ id: c.id, v: l.num!(c) }))
      .filter((x) => x.v != null) as { id: string; v: number }[];
    if (vals.length < 2) return null;
    const alvo =
      l.melhor === "maior"
        ? Math.max(...vals.map((x) => x.v))
        : Math.min(...vals.map((x) => x.v));
    const ganhadores = vals.filter((x) => x.v === alvo);
    return ganhadores.length === 1 ? ganhadores[0].id : null;
  };

  return (
    <div>
      <div className="mb-2">
        <Link href="/cenarios" className="text-[12.5px] text-text-muted">
          ← Cenários
        </Link>
      </div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">
            Comparar cenários
          </h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Os mesmos indicadores, um cenário por coluna. Em verde, o melhor de
            cada linha.
            {periodosDiferem &&
              " Os períodos diferem: compare os indicadores de ponta (clientes, ARR, margens, CAC), não os acumulados."}
          </p>
        </div>
        <form
          method="get"
          className="flex flex-wrap items-center gap-2 text-[12px]"
        >
          {(cenarios ?? []).map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5"
            >
              <input
                type="checkbox"
                name="c"
                value={c.id}
                defaultChecked={!escolhidos || escolhidos.includes(c.id)}
              />
              {c.nome}
            </label>
          ))}
          <button
            type="submit"
            className="rounded-lg bg-wine-deep px-3 py-1.5 text-[12px] font-medium text-white"
          >
            Comparar
          </button>
        </form>
      </div>

      {colunas.length === 0 ? (
        <p className="text-[13px] text-text-muted">
          Nenhum cenário com projeção calculada. Recalcule os cenários primeiro.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-text-faint">
                  <th className="sticky left-0 z-[1] bg-surface px-4 py-2.5 font-medium">
                    Indicador
                  </th>
                  {colunas.map((c) => (
                    <th
                      key={c.id}
                      className="border-l border-border-soft px-3 py-2.5 text-right font-medium normal-case tracking-normal"
                    >
                      <Link
                        href={`/plano/${c.id}`}
                        className="font-heading text-[12.5px] font-semibold text-text hover:underline"
                      >
                        {c.nome}
                      </Link>
                      {c.isBase && (
                        <span className="ml-1.5 rounded bg-success-soft px-1 py-0.5 text-[9px] font-semibold text-success">
                          BASE
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const novoGrupo = i === 0 || linhas[i - 1].grupo !== l.grupo;
                  const melhor = melhorDe(l);
                  return (
                    <tr
                      key={l.label}
                      className={`text-[12px] ${novoGrupo ? "border-t border-border" : "border-t border-border-soft"}`}
                    >
                      <td className="sticky left-0 z-[1] whitespace-nowrap bg-surface px-4 py-1.5">
                        {novoGrupo && (
                          <span className="mr-2 text-[9.5px] font-medium uppercase tracking-wide text-text-faint">
                            {l.grupo}
                          </span>
                        )}
                        <span className="flex items-center">
                          {l.label}
                          {l.tooltip && <InfoTooltip texto={l.tooltip} />}
                        </span>
                      </td>
                      {colunas.map((c) => (
                        <td
                          key={c.id}
                          className={`border-l border-border-soft px-3 py-1.5 text-right font-mono ${melhor === c.id ? "font-semibold text-success" : ""}`}
                        >
                          {l.valor(c)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h2 className="mb-2 mt-6 font-heading text-[13px] font-semibold">
            Ano a ano
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-text-faint">
                  <th
                    className="sticky left-0 z-[1] bg-surface px-4 py-2 text-left font-medium"
                    rowSpan={2}
                  >
                    Ano
                  </th>
                  {colunas.map((c) => (
                    <th
                      key={c.id}
                      colSpan={4}
                      className="border-l border-border-soft px-3 py-1.5 text-center font-medium normal-case tracking-normal"
                    >
                      <span className="font-heading text-[12px] font-semibold text-text">
                        {c.nome}
                      </span>
                    </th>
                  ))}
                </tr>
                <tr className="text-[9.5px] uppercase tracking-wide text-text-faint">
                  {colunas.map((c) => (
                    <SubCabecalho key={c.id} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {anos.map((ano) => (
                  <tr
                    key={ano}
                    className="border-t border-border-soft text-[12px]"
                  >
                    <td className="sticky left-0 z-[1] bg-surface px-4 py-1.5 font-semibold">
                      {ano}
                    </td>
                    {colunas.map((c) => {
                      const a = c.anual.find((x) => x.ano === ano);
                      return <CelulasAno key={c.id} a={a} />;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SubCabecalho() {
  return (
    <>
      <th className="border-l border-border-soft px-2 py-1 text-right font-medium">
        Clientes
      </th>
      <th className="px-2 py-1 text-right font-medium">ARR</th>
      <th className="px-2 py-1 text-right font-medium">Receita</th>
      <th className="px-2 py-1 text-right font-medium">EBITDA</th>
    </>
  );
}

function CelulasAno({ a }: { a: LinhaAnualInvestidor | undefined }) {
  if (!a) {
    return (
      <>
        <td className="border-l border-border-soft px-2 py-1.5 text-right font-mono text-text-faint">
          —
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-text-faint">—</td>
        <td className="px-2 py-1.5 text-right font-mono text-text-faint">—</td>
        <td className="px-2 py-1.5 text-right font-mono text-text-faint">—</td>
      </>
    );
  }
  return (
    <>
      <td className="border-l border-border-soft px-2 py-1.5 text-right font-mono">
        {Math.round(a.clientesFinal).toLocaleString("pt-BR")}
      </td>
      <td className="px-2 py-1.5 text-right font-mono">
        {brlCurto(a.arrFinal)}
      </td>
      <td className="px-2 py-1.5 text-right font-mono">
        {brlCurto(a.receita)}
        {a.meses !== 12 && (
          <span className="ml-0.5 text-[9px] text-text-faint">
            ({a.meses}m)
          </span>
        )}
      </td>
      <td
        className={`px-2 py-1.5 text-right font-mono ${a.ebitda < 0 ? "text-danger" : ""}`}
      >
        {brlCurto(a.ebitda)}
      </td>
    </>
  );
}
