import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FASES } from "@/lib/fases";
import { agregarPorCenario, computeMetricas } from "@/lib/relatorios-cenario";
import { CurvaMatriz, type ProdutoCurva } from "./curva-matriz";
import { VendasKpiBar } from "./vendas-kpi-bar";
import { RecalcularTodos } from "./recalcular-todos";
import { AvisoTelaGrande } from "@/components/aviso-tela-grande";
import { CanaisAquisicao } from "@/app/(app)/produtos/[id]/canais-aquisicao";
import { TabelaProjecao, type LinhaProjecao } from "./tabela-projecao";
import { PontoPartidaCard } from "./ponto-partida";
import { ReceitasHistoricas } from "@/app/(app)/relatorios/receitas-historicas-card";
import type { ReceitaHistorica } from "@/lib/receitas-historicas";
import type { PontoPartida } from "@/lib/ponto-partida";

// Salvar o ponto de partida recalcula a projeção de todos os produtos — leva alguns segundos.
export const maxDuration = 60;

export default async function PlanoVendasPage({
  params,
}: {
  params: Promise<{ cenarioId: string }>;
}) {
  const { cenarioId } = await params;
  const supabase = await createClient();

  const [{ data: cenario }, { data: produtos }] = await Promise.all([
    supabase
      .from("cenarios")
      .select("id, nome, data_inicio, data_fim, ponto_partida")
      .eq("id", cenarioId)
      .single(),
    supabase
      .from("produtos")
      .select("id, nome")
      .or(`cenario_id.is.null,cenario_id.eq.${cenarioId}`)
      .order("nome"),
  ]);

  if (!cenario) notFound();

  const [resumo, { data: receitasHistoricas }] = await Promise.all([
    agregarPorCenario(supabase, cenarioId),
    supabase.from("receitas_historicas").select("*").eq("cenario_id", cenarioId).order("data_inicio"),
  ]);
  const metricas = computeMetricas(
    resumo.linhasPeriodo,
    resumo.totalInvestido,
    resumo.aportes.capitalNovoPorMes,
  );
  const ultimaLinha = resumo.linhasPeriodo[resumo.linhasPeriodo.length - 1];

  const { data: modelosContratacao } = await supabase
    .from("modelos_contratacao")
    .select("id, cargo, nome, parametros");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capacidadePorModelo = new Map(
    (modelosContratacao ?? []).map((m) => [
      m.id,
      (m.parametros as any)?.capacidade_unidade_mes ?? 0,
    ]),
  );

  // O canal é da empresa (cenário), não do produto — cada um traz sua matriz de produtos dentro.
  const { data: canaisRaw } = await supabase
    .from("canais_aquisicao")
    .select("*")
    .eq("cenario_id", cenarioId)
    .order("created_at");

  // Etapas da implantação de cada produto — o card do canal deixa ajustar as horas por etapa.
  const { data: etapasImplRaw } = await supabase
    .from("implementacao_etapas")
    .select("produto_id, nome_etapa, horas, valor_hora")
    .eq("cenario_id", cenarioId)
    .order("ordem");

  const canalIds = (canaisRaw ?? []).map((c) => c.id);
  const [{ data: parceirosRaw }, { data: canalProdutosRaw }] =
    canalIds.length > 0
      ? await Promise.all([
          supabase
            .from("canal_parceiros_fase")
            .select("canal_id, fase, quantidade_parceiros")
            .in("canal_id", canalIds),
          supabase.from("canal_produto").select("*").in("canal_id", canalIds),
        ])
      : [{ data: [] }, { data: [] }];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parceirosPorCanalId = new Map<string, any[]>();
  for (const p of parceirosRaw ?? []) {
    const atual = parceirosPorCanalId.get(p.canal_id) ?? [];
    atual.push({ fase: p.fase, quantidade_parceiros: p.quantidade_parceiros });
    parceirosPorCanalId.set(p.canal_id, atual);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const produtosPorCanalId = new Map<string, any[]>();
  for (const cp of canalProdutosRaw ?? []) {
    const atual = produtosPorCanalId.get(cp.canal_id) ?? [];
    atual.push(cp);
    produtosPorCanalId.set(cp.canal_id, atual);
  }
  const canais = (canaisRaw ?? []).map((c) => ({
    ...c,
    parceirosPorFase: parceirosPorCanalId.get(c.id) ?? [],
    produtos: produtosPorCanalId.get(c.id) ?? [],
  }));

  const produtosData: ProdutoCurva[] = await Promise.all(
    (produtos ?? []).map(async (produto) => {
      const { data: fasesRaw } = await supabase
        .from("fases_produto")
        .select(
          "id, fase, taxa_crescimento_mensal, taxa_churn_mensal, data_inicio, data_fim",
        )
        .eq("produto_id", produto.id)
        .eq("cenario_id", cenarioId);

      const faseByValue = new Map((fasesRaw ?? []).map((f) => [f.fase, f]));
      const faseIds = (fasesRaw ?? []).map((f) => f.id);
      const { data: funis } =
        faseIds.length > 0
          ? await supabase
              .from("premissas_funil")
              .select(
                "fase_produto_id, capacidade_vendedor_mes, reunioes_por_oportunidade, span_of_control, horas_suporte_por_cliente_mes",
              )
              .in("fase_produto_id", faseIds)
          : { data: [] };
      const funilByFaseId = new Map(
        (funis ?? []).map((f) => [f.fase_produto_id, f]),
      );
      const { data: trimestresRaw } =
        faseIds.length > 0
          ? await supabase
              .from("fases_trimestres")
              .select(
                "fase_produto_id, indice, taxa_crescimento_mensal, taxa_churn_mensal",
              )
              .in("fase_produto_id", faseIds)
          : { data: [] };

      return {
        id: produto.id,
        nome: produto.nome,
        fases: FASES.map((f, i) => {
          const fase = faseByValue.get(f.value);
          const funil = fase ? (funilByFaseId.get(fase.id) ?? null) : null;
          return {
            fase: f.value,
            label: f.label,
            ordem: i + 1,
            dados: fase
              ? {
                  taxa_crescimento_mensal: fase.taxa_crescimento_mensal,
                  taxa_churn_mensal: fase.taxa_churn_mensal,
                  capacidade_vendedor_mes:
                    funil?.capacidade_vendedor_mes ?? null,
                  reunioes_por_oportunidade:
                    funil?.reunioes_por_oportunidade ?? null,
                  span_of_control: funil?.span_of_control ?? null,
                  horas_suporte_por_cliente_mes:
                    funil?.horas_suporte_por_cliente_mes ?? null,
                  data_inicio: fase.data_inicio,
                  data_fim: fase.data_fim,
                  trimestres: (trimestresRaw ?? [])
                    .filter((t) => t.fase_produto_id === fase.id)
                    .map((t) => ({
                      indice: Number(t.indice),
                      taxa_crescimento_mensal:
                        t.taxa_crescimento_mensal != null
                          ? Number(t.taxa_crescimento_mensal)
                          : null,
                      taxa_churn_mensal:
                        t.taxa_churn_mensal != null
                          ? Number(t.taxa_churn_mensal)
                          : null,
                    })),
                }
              : null,
          };
        }),
      };
    }),
  );

  // Projeção já calculada, pra tabela de resultado no rodapé da tela.
  const { data: projecaoRaw } = await supabase
    .from("simulacao_mensal")
    .select(
      "produto_id, mes_referencia, clientes_ativos, novos_clientes, novos_direto, novos_representante, novos_associacao, clientes_perdidos, churn_pct, receita_bruta, mrr, receita_implementacao, implementacoes_ativas, novas_implementacoes",
    )
    .eq("cenario_id", cenarioId)
    .order("mes_referencia");

  // A fase de cada mês vem das datas das fases do produto — só é exibida com um produto filtrado.
  const { data: fasesTodas } = await supabase
    .from("fases_produto")
    .select("produto_id, fase, data_inicio, data_fim")
    .eq("cenario_id", cenarioId);
  const faseLabel = new Map(FASES.map((f) => [f.value, f.label]));
  function faseDoMes(produtoId: string, mesIso: string): string | null {
    const mes = new Date(mesIso + "T00:00:00");
    const candidatas = (fasesTodas ?? [])
      .filter(
        (f) =>
          f.produto_id === produtoId &&
          f.data_inicio &&
          new Date(f.data_inicio + "T00:00:00") <= mes,
      )
      .sort((a, b) => (a.data_inicio! < b.data_inicio! ? 1 : -1));
    return candidatas[0]
      ? (faseLabel.get(candidatas[0].fase) ?? candidatas[0].fase)
      : null;
  }

  // Só o período do cenário: a simulação começa no desenvolvimento de cada produto, mas o plano
  // começa em data_inicio — o que vem antes é preparação, não projeção pra apresentar.
  const dentroDoPeriodo = (mes: string) =>
    (!cenario.data_inicio || mes >= cenario.data_inicio) &&
    (!cenario.data_fim || mes <= cenario.data_fim);
  const linhasProjecao: LinhaProjecao[] = (projecaoRaw ?? [])
    .filter((l) => dentroDoPeriodo(l.mes_referencia))
    .map((l) => ({
      produto_id: l.produto_id,
      mes_referencia: l.mes_referencia,
      fase: faseDoMes(l.produto_id, l.mes_referencia),
      clientes_ativos: Number(l.clientes_ativos),
      novos_clientes: Number(l.novos_clientes),
      novos_direto: Number(l.novos_direto ?? 0),
      novos_representante: Number(l.novos_representante ?? 0),
      novos_associacao: Number(l.novos_associacao ?? 0),
      clientes_perdidos: Number(l.clientes_perdidos ?? 0),
      churn_pct: l.churn_pct != null ? Number(l.churn_pct) : null,
      receita_bruta: Number(l.receita_bruta),
      mrr: Number(l.mrr ?? 0),
      receita_implementacao: Number(l.receita_implementacao ?? 0),
      implementacoes_ativas: Number(l.implementacoes_ativas ?? 0),
      novas_implementacoes: Number(l.novas_implementacoes ?? 0),
    }));

  return (
    <div>
      <div className="mb-2">
        <Link
          href={`/plano/${cenarioId}`}
          className="text-[12.5px] text-text-muted"
        >
          ← {cenario.nome}
        </Link>
      </div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">
            Vendas — {cenario.nome}
          </h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Defina canais, crescimento e churn nos painéis abaixo — a projeção
            no rodapé responde na hora.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link
            href={`/produtos?cenario=${cenarioId}`}
            className="whitespace-nowrap rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-medium text-primary-deep"
          >
            ← Revisar planos em Produtos
          </Link>
          <RecalcularTodos cenarioId={cenarioId} produtos={produtos ?? []} />
        </div>
      </div>

      <AvisoTelaGrande />

      <VendasKpiBar
        receitaMensal={ultimaLinha?.receita ?? null}
        cac={metricas.cacMedio}
        ltv={metricas.ltvMedio}
        pmv={metricas.precoMedioVenda}
      />

      <div className="flex flex-col gap-3">
        {cenario.ponto_partida && (
          <PontoPartidaCard
            key={JSON.stringify(cenario.ponto_partida)}
            cenarioId={cenarioId}
            ponto={cenario.ponto_partida as PontoPartida}
            produtos={produtos ?? []}
          />
        )}

        {/* Tração antes do produto (receita de serviço): a edição mora aqui; o Relatório só mostra. */}
        <div id="tracao">
          <ReceitasHistoricas
            cenarioId={cenarioId}
            itens={(receitasHistoricas ?? []) as ReceitaHistorica[]}
            periodo={resumo.periodo}
          />
        </div>

        <details className="group rounded-xl border border-border bg-surface">
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-3.5 text-[13px] font-semibold">
            <span className="text-[10px] text-text-faint transition-transform group-open:rotate-90">
              ▶
            </span>
            Canais de aquisição
            <span className="ml-2 text-[11px] font-normal text-text-muted">
              {canais.length > 0
                ? canais.map((c) => c.nome).join(" · ")
                : "nenhum canal ainda"}
            </span>
          </summary>
          <div className="border-t border-border-soft p-1">
            <CanaisAquisicao
              cenarioId={cenarioId}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              canais={canais as any}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              modelos={(modelosContratacao ?? []) as any}
              produtos={produtos ?? []}
              etapas={(etapasImplRaw ?? []).map((e) => ({
                ...e,
                horas: Number(e.horas),
                valor_hora: Number(e.valor_hora),
              }))}
            />
          </div>
        </details>

        <details className="group rounded-xl border border-border bg-surface">
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-3.5 text-[13px] font-semibold">
            <span className="text-[10px] text-text-faint transition-transform group-open:rotate-90">
              ▶
            </span>
            Crescimento &amp; churn por fase
            <span className="ml-2 text-[11px] font-normal text-text-muted">
              {(produtos ?? []).length} produto(s) · {FASES.length} fases
            </span>
          </summary>
          <div className="border-t border-border-soft">
            <CurvaMatriz
              cenarioId={cenarioId}
              produtos={produtosData}
              fimCenario={cenario.data_fim ?? null}
            />
          </div>
        </details>

        <TabelaProjecao
          linhas={linhasProjecao}
          produtos={produtos ?? []}
          cenarioId={cenarioId}
        />
      </div>
    </div>
  );
}
