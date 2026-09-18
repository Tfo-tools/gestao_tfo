import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { agregarPorCenario, computeMetricas, recortarPeriodo } from "@/lib/relatorios-cenario";
import {
  CORES_CENARIO,
  INDICADORES_COMPARACAO,
  TRACOS_CENARIO,
  caixaAcumulado,
  formatar,
  indiceDoMelhor,
  periodoComum,
  variacaoContraBase,
  type CenarioBasico,
  type DadosCenario,
} from "@/lib/comparar-cenarios";
import { InfoTooltip } from "@/components/info-tooltip";
import { GraficoComparativo } from "./grafico-comparativo";

// Cada cenário roda a agregação inteira — com 4 cenários leva alguns segundos.
export const maxDuration = 60;

/**
 * Cenários lado a lado, no mesmo período. Por padrão a janela é a comum a todos os escolhidos
 * (o início mais tardio e o fim mais cedo) — comparar 4 anos de um com 6 de outro não diz nada.
 */
export default async function CompararCenariosPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[]; inicio?: string; fim?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: cenariosRaw } = await supabase
    .from("cenarios")
    .select("id, nome, is_base, data_inicio, data_fim")
    .order("created_at");
  const cenarios = (cenariosRaw ?? []) as CenarioBasico[];
  // A cor segue o cenário pela ordem de criação — filtrar não repinta quem ficou.
  const corDe = new Map(cenarios.map((c, i) => [c.id, CORES_CENARIO[i % CORES_CENARIO.length]]));
  const tracoDe = new Map(cenarios.map((c, i) => [c.id, TRACOS_CENARIO[i % TRACOS_CENARIO.length]]));

  const pedidos = params.c ? (Array.isArray(params.c) ? params.c : [params.c]) : null;
  const escolhidos = pedidos ? cenarios.filter((c) => pedidos.includes(c.id)) : cenarios;
  const comum = periodoComum(escolhidos);
  const inicio = params.inicio || comum?.inicio || "";
  const fim = params.fim || comum?.fim || "";

  const dados: DadosCenario[] = await Promise.all(
    escolhidos.map(async (c) => {
      const resumo = await agregarPorCenario(supabase, c.id);
      const linhas = recortarPeriodo(resumo.linhas, inicio, fim);
      return {
        id: c.id,
        nome: c.nome,
        is_base: c.is_base,
        metricas: computeMetricas(linhas, resumo.totalInvestido, resumo.aportes.capitalNovoPorMes),
        meses: linhas.map((l) => ({
          mes: l.mes_referencia,
          receita: l.receita,
          ebitda: l.ebitda,
          aportes: resumo.aportes.porMes.get(l.mes_referencia) ?? 0,
        })),
      };
    }),
  );
  const comDados = dados.filter((d) => d.meses.length > 0);
  const base = comDados.find((d) => d.is_base) ?? null;

  const serie = (valor: (d: DadosCenario) => { mes: string; valor: number }[]) =>
    comDados.map((d) => ({ id: d.id, nome: d.nome, cor: corDe.get(d.id)!, traco: tracoDe.get(d.id)!, pontos: valor(d) }));

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-[22px] font-semibold">Comparar cenários</h1>
        <p className="mt-1 text-[13px] text-text-muted">Os mesmos indicadores, lado a lado, no mesmo período</p>
      </div>

      {/* Filtros numa linha só: cenários e período. */}
      <form method="get" className="mb-5 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-surface px-5 py-4">
        <div>
          <span className="mb-1.5 block text-[11px] font-medium text-text-muted">Cenários</span>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {cenarios.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-[12.5px]">
                <input type="checkbox" name="c" value={c.id} defaultChecked={escolhidos.some((e) => e.id === c.id)} />
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: corDe.get(c.id) }} />
                {c.nome}
                {c.is_base && <span className="text-[10px] text-text-faint">base</span>}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-text-muted">De</label>
          <input type="month" name="inicio" defaultValue={inicio} className="input" />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-text-muted">Até</label>
          <input type="month" name="fim" defaultValue={fim} className="input" />
        </div>
        <button type="submit" className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white">
          Comparar
        </button>
        {comum && (
          <span className="text-[11px] text-text-faint">
            Período comum aos escolhidos: {comum.inicio.split("-").reverse().join("/")} a {comum.fim.split("-").reverse().join("/")}
          </span>
        )}
      </form>

      {comDados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center text-sm text-text-muted">
          Nenhum cenário escolhido tem projeção nesse período.
        </div>
      ) : (
        <>
          <div className="mb-5 overflow-x-auto rounded-xl border border-border bg-surface p-5">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="text-left">
                  <th className="px-2 pb-2 font-medium text-text-muted">Indicador</th>
                  {comDados.map((d) => (
                    <th key={d.id} className="px-2 pb-2 text-right font-semibold">
                      <Link href={`/indicadores?cenario=${d.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: corDe.get(d.id) }} />
                        {d.nome}
                      </Link>
                      {d.is_base && <span className="block text-[10px] font-normal text-text-faint">plano da empresa</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INDICADORES_COMPARACAO.map((ind) => {
                  const valores = comDados.map((d) => ind.valor(d));
                  const melhor = indiceDoMelhor(valores, ind.melhor);
                  const valorBase = base ? ind.valor(base) : null;
                  return (
                    <tr key={ind.chave} className="border-t border-border-soft">
                      <td className="px-2 py-2 text-text-muted">
                        <span className="flex items-center">
                          {ind.rotulo}
                          {ind.ajuda && <InfoTooltip texto={ind.ajuda} />}
                        </span>
                      </td>
                      {comDados.map((d, i) => {
                        const v = valores[i];
                        const texto = ind.texto ? ind.texto(d) : formatar(v, ind.formato);
                        // A diferença contra o Base só faz sentido em valor, não em mês nem em %.
                        const delta =
                          !d.is_base && ind.formato !== "mes" && ind.formato !== "pct" && ind.formato !== "pctmes"
                            ? variacaoContraBase(v, valorBase)
                            : null;
                        return (
                          <td key={d.id} className={`px-2 py-2 text-right font-mono ${melhor === i ? "font-semibold" : ""}`}>
                            {texto}
                            {melhor === i && (
                              <span className="ml-1.5 rounded bg-success-soft px-1 py-0.5 font-sans text-[9.5px] font-semibold text-success">
                                MELHOR
                              </span>
                            )}
                            {delta != null && Math.abs(delta) >= 0.5 && (
                              <span className="block font-sans text-[10px] font-normal text-text-faint">
                                {delta > 0 ? "+" : "−"}
                                {Math.abs(delta).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% vs Base
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Uma medida por gráfico: receita e caixa ficam separados, nunca num eixo duplo. */}
          <div className="flex flex-col gap-5">
            <GraficoComparativo
              titulo="Receita mensal"
              subtitulo="Receita total de cada mês — assinatura e implantação."
              series={serie((d) => d.meses.map((m) => ({ mes: m.mes, valor: m.receita })))}
            />
            <GraficoComparativo
              titulo="Caixa acumulado"
              subtitulo="EBITDA acumulado mais os aportes de cada cenário. Abaixo da linha do zero, o cenário está consumindo capital."
              series={serie((d) => caixaAcumulado(d.meses))}
            />
          </div>
        </>
      )}
    </div>
  );
}
