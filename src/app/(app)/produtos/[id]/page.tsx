import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FASES } from "@/lib/fases";
import { CenarioSelector } from "./cenario-selector";
import { FaseCard } from "./fase-card";
import { PlanosPrecificacao } from "./planos-precificacao";
import { RecalcularButton } from "./recalcular-button";
import { SimulacaoResultado } from "./simulacao-resultado";

export default async function ProdutoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cenario?: string }>;
}) {
  const { id } = await params;
  const { cenario } = await searchParams;
  const supabase = await createClient();

  const [{ data: produto }, { data: cenarios }, { data: planos }] = await Promise.all([
    supabase.from("produtos").select("id, nome, descricao").eq("id", id).single(),
    supabase.from("cenarios").select("id, nome, is_base").order("created_at"),
    supabase.from("planos_precificacao").select("*").eq("produto_id", id).order("preco"),
  ]);

  if (!produto) notFound();

  const cenarioAtual =
    cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";

  const { data: fases } = await supabase
    .from("fases_produto")
    .select(
      "id, fase, data_inicio, data_fim, taxa_crescimento_mensal, taxa_churn_mensal, investimento_ms_mensal, observacoes",
    )
    .eq("produto_id", id)
    .eq("cenario_id", cenarioAtual);

  const faseIds = (fases ?? []).map((f) => f.id);
  const [{ data: betas }, { data: alocacoesRaw }] =
    faseIds.length > 0
      ? await Promise.all([
          supabase.from("beta_testers_config").select("*").in("fase_produto_id", faseIds),
          supabase.from("equipe_alocada").select("*").in("fase_produto_id", faseIds),
        ])
      : [{ data: [] }, { data: [] }];

  type AlocacaoRow = {
    id: string;
    fase_produto_id: string;
    cargo: string;
    categoria: string;
    quantidade_funcionarios: number;
    horas_mes: number;
    custo_hora: number;
  };

  const faseByValue = new Map((fases ?? []).map((f) => [f.fase, f]));
  const betaByFaseId = new Map((betas ?? []).map((b) => [b.fase_produto_id, b]));
  const alocacoesByFaseId = new Map<string, AlocacaoRow[]>();
  for (const a of (alocacoesRaw ?? []) as AlocacaoRow[]) {
    const atual = alocacoesByFaseId.get(a.fase_produto_id) ?? [];
    atual.push(a);
    alocacoesByFaseId.set(a.fase_produto_id, atual);
  }

  const primeiraVazia = FASES.findIndex((f) => !faseByValue.get(f.value)?.data_inicio);

  const { data: simulacao } = await supabase
    .from("simulacao_mensal")
    .select("mes_referencia, clientes_ativos, receita_bruta, ebitda, cac_all_in, ltv")
    .eq("produto_id", id)
    .eq("cenario_id", cenarioAtual)
    .order("mes_referencia");

  return (
    <div>
      <div className="mb-2">
        <Link href="/produtos" className="text-[12.5px] text-text-muted">
          ← Produtos
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">{produto.nome}</h1>
          <p className="mt-1 text-[13px] text-text-muted">{produto.descricao ?? "Sem descrição."}</p>
        </div>
        <div className="flex items-center gap-3">
          {cenarioAtual && <CenarioSelector cenarios={cenarios ?? []} cenarioAtual={cenarioAtual} />}
          {cenarioAtual && <RecalcularButton produtoId={id} cenarioId={cenarioAtual} />}
        </div>
      </div>

      <div className="mb-5">
        <SimulacaoResultado linhas={simulacao ?? []} />
      </div>

      <div className="grid grid-cols-[1fr_340px] items-start gap-5">
        <div className="flex flex-col gap-2.5">
          {FASES.map((f, i) => {
            const dados = faseByValue.get(f.value) ?? null;
            const beta = dados ? (betaByFaseId.get(dados.id) ?? null) : null;
            const alocacoes = dados ? (alocacoesByFaseId.get(dados.id) ?? []) : [];
            return (
              <FaseCard
                key={f.value}
                produtoId={id}
                cenarioId={cenarioAtual}
                fase={f.value}
                label={f.label}
                ordem={i + 1}
                dados={dados}
                beta={beta}
                alocacoes={alocacoes}
                defaultOpen={i === (primeiraVazia === -1 ? 0 : primeiraVazia)}
              />
            );
          })}
        </div>

        <PlanosPrecificacao produtoId={id} planos={planos ?? []} />
      </div>
    </div>
  );
}
