import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CenarioSelector } from "./cenario-selector";
import { PlanosPrecificacao } from "./planos-precificacao";
import { ModulosProduto } from "./modulos-produto";
import { NiveisModulo } from "./niveis-modulo";
import { TipoPrecificacaoToggle } from "./tipo-precificacao-toggle";
import { DatasProduto } from "./datas-produto";
import { ImplementacaoProduto, type CanalImplementacao } from "./implementacao-produto";

// Salvar a implementação recalcula a projeção do produto nos cenários — leva alguns segundos.
export const maxDuration = 60;

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

  const [{ data: produto }, { data: cenarios }] = await Promise.all([
    supabase
      .from("produtos")
      .select(
        "id, nome, descricao, data_inicio_desenvolvimento, data_lancamento_estimada, tipo_precificacao, tem_implementacao, preco_implementacao, implementacao_parcelas",
      )
      .eq("id", id)
      .single(),
    supabase.from("cenarios").select("id, nome, is_base").order("created_at"),
  ]);

  if (!produto) notFound();

  const cenarioAtual = cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";

  const [{ data: planos }, { data: modulos }] = await Promise.all([
    supabase.from("planos_precificacao").select("*").eq("produto_id", id).eq("cenario_id", cenarioAtual).order("preco"),
    supabase.from("modulos_produto").select("*").eq("produto_id", id).eq("cenario_id", cenarioAtual).order("created_at"),
  ]);

  const planoIds = (planos ?? []).map((p) => p.id);
  const moduloIds = (modulos ?? []).map((m) => m.id);
  const [{ data: precosFase }, { data: betasModuloRaw }] = await Promise.all([
    planoIds.length > 0
      ? supabase.from("planos_precificacao_fases").select("*").in("plano_id", planoIds)
      : Promise.resolve({ data: [] }),
    moduloIds.length > 0
      ? supabase.from("beta_testers_modulo").select("*").in("modulo_id", moduloIds)
      : Promise.resolve({ data: [] }),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const betasModuloByModuloId = new Map<string, any[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (betasModuloRaw ?? []) as any[]) {
    const atual = betasModuloByModuloId.get(b.modulo_id) ?? [];
    atual.push(b);
    betasModuloByModuloId.set(b.modulo_id, atual);
  }
  const modulosComBeta = (modulos ?? []).map((m) => ({ ...m, betaTesters: betasModuloByModuloId.get(m.id) ?? [] }));

  // Só as datas das fases (pro "Preço por fase" dos planos) — crescimento, churn, canais e funil são
  // decisão de Vendas, não daqui.
  const [{ data: fases }, { data: betas }, { data: etapasImplementacao }, { data: tabelaCustoHora }] = await Promise.all([
    supabase.from("fases_produto").select("fase, data_inicio, data_fim").eq("produto_id", id).eq("cenario_id", cenarioAtual),
    supabase.from("beta_testers_config").select("*").eq("produto_id", id).eq("cenario_id", cenarioAtual),
    supabase
      .from("implementacao_etapas")
      .select("*")
      .eq("produto_id", id)
      .eq("cenario_id", cenarioAtual)
      .order("ordem", { nullsFirst: false }),
    supabase.from("tabela_custo_hora").select("area, cargo, tipo_contratacao, senioridade, valor_hora").order("cargo"),
  ]);

  // Canais que vendem este produto no cenário: cada um pode dar desconto (ou isenção) na
  // implementação — é o que faz a margem real variar conforme a origem do cliente.
  const { data: canaisRaw } = cenarioAtual
    ? await supabase
        .from("canais_aquisicao")
        .select("nome, tipo_canal, canal_produto(produto_id, percentual_mix, isencao_implementacao, desconto_implementacao_pct)")
        .eq("cenario_id", cenarioAtual)
        .order("created_at")
    : { data: [] };
  const canaisImplementacao: CanalImplementacao[] = (canaisRaw ?? []).flatMap((c) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((c.canal_produto ?? []) as any[])
      .filter((cp) => cp.produto_id === id && Number(cp.percentual_mix ?? 0) > 0)
      .map((cp) => ({
        nome: c.nome,
        percentualMix: Number(cp.percentual_mix),
        desconto: cp.isencao_implementacao ? 1 : Number(cp.desconto_implementacao_pct ?? 0),
      })),
  );

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
          <p className="mt-0.5 text-[11px] text-text-faint">
            Planos, preços e módulos ficam aqui — início/fim de fase ficam na lista de Produtos; canais de aquisição,
            crescimento, churn, conversão e capacidade ficam em Vendas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TipoPrecificacaoToggle produtoId={id} tipoAtual={produto.tipo_precificacao} />
          {cenarioAtual && <CenarioSelector cenarios={cenarios ?? []} cenarioAtual={cenarioAtual} />}
          {cenarioAtual && (
            <Link
              href={`/plano/${cenarioAtual}/vendas`}
              className="whitespace-nowrap rounded-lg bg-wine-deep px-3.5 py-2 text-[12.5px] font-medium text-white"
            >
              Ir para Vendas →
            </Link>
          )}
        </div>
      </div>

      <DatasProduto
        produtoId={id}
        dataInicioDesenvolvimento={produto.data_inicio_desenvolvimento}
        dataLancamentoEstimada={produto.data_lancamento_estimada}
      />

      <div className="mt-5 flex flex-col gap-5">
        <ImplementacaoProduto
          produtoId={id}
          cenarioId={cenarioAtual}
          temImplementacao={produto.tem_implementacao}
          precoImplementacao={produto.preco_implementacao}
          parcelas={produto.implementacao_parcelas ?? 1}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          etapas={(etapasImplementacao ?? []) as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tabelaCustoHora={(tabelaCustoHora ?? []) as any}
          canais={canaisImplementacao}
        />
        {produto.tipo_precificacao === "modulos" ? (
          <NiveisModulo produtoId={id} cenarioId={cenarioAtual} niveis={modulosComBeta} />
        ) : (
          <>
            <PlanosPrecificacao
              produtoId={id}
              cenarioId={cenarioAtual}
              planos={planos ?? []}
              precosFase={precosFase ?? []}
              fases={(fases ?? []).map((f) => ({ fase: f.fase, data_inicio: f.data_inicio, data_fim: f.data_fim }))}
              betaTesters={betas ?? []}
            />
            <ModulosProduto produtoId={id} cenarioId={cenarioAtual} modulos={modulosComBeta} />
          </>
        )}
      </div>
    </div>
  );
}
