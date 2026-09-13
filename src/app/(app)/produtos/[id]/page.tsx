import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CenarioSelector } from "./cenario-selector";
import { PlanosPrecificacao } from "./planos-precificacao";
import { ModulosProduto } from "./modulos-produto";
import { NiveisModulo } from "./niveis-modulo";
import { TipoPrecificacaoToggle } from "./tipo-precificacao-toggle";
import { DatasProduto } from "./datas-produto";
import { ImplementacaoProduto } from "./implementacao-produto";
import { StatusProdutoControle } from "@/app/(app)/produtos/status-produto";
import { LABEL_STATUS, type StatusProduto } from "@/lib/fases-produto";
import { SecaoRecolhivel } from "@/components/secao-recolhivel";
import { SeloStatus } from "@/app/(app)/produtos/status-produto";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
const dataBR = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

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
        "id, nome, descricao, status, data_inicio_desenvolvimento, data_lancamento_estimada, tipo_precificacao, tem_implementacao, preco_implementacao, implementacao_parcelas, implementacao_formas_pagamento",
      )
      .eq("id", id)
      .single(),
    supabase.from("cenarios").select("id, nome, is_base").order("created_at"),
  ]);

  if (!produto) notFound();

  const cenarioAtual =
    cenario ??
    (cenarios ?? []).find((c) => c.is_base)?.id ??
    (cenarios ?? [])[0]?.id ??
    "";

  const [{ data: planos }, { data: modulos }] = await Promise.all([
    supabase
      .from("planos_precificacao")
      .select("*")
      .eq("produto_id", id)
      .eq("cenario_id", cenarioAtual)
      .order("preco"),
    supabase
      .from("modulos_produto")
      .select("*")
      .eq("produto_id", id)
      .eq("cenario_id", cenarioAtual)
      .order("created_at"),
  ]);

  const planoIds = (planos ?? []).map((p) => p.id);
  const moduloIds = (modulos ?? []).map((m) => m.id);
  const [{ data: precosFase }, { data: betasModuloRaw }] = await Promise.all([
    planoIds.length > 0
      ? supabase
          .from("planos_precificacao_fases")
          .select("*")
          .in("plano_id", planoIds)
      : Promise.resolve({ data: [] }),
    moduloIds.length > 0
      ? supabase
          .from("beta_testers_modulo")
          .select("*")
          .in("modulo_id", moduloIds)
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
  const modulosComBeta = (modulos ?? []).map((m) => ({
    ...m,
    betaTesters: betasModuloByModuloId.get(m.id) ?? [],
  }));

  // Só as datas das fases (pro "Preço por fase" dos planos) — crescimento, churn, canais e funil são
  // decisão de Vendas, não daqui.
  const [
    { data: fases },
    { data: betas },
    { data: etapasImplementacao },
    { data: tabelaCustoHora },
  ] = await Promise.all([
    supabase
      .from("fases_produto")
      .select("fase, data_inicio, data_fim")
      .eq("produto_id", id)
      .eq("cenario_id", cenarioAtual),
    supabase
      .from("beta_testers_config")
      .select("*")
      .eq("produto_id", id)
      .eq("cenario_id", cenarioAtual),
    supabase
      .from("implementacao_etapas")
      .select("*")
      .eq("produto_id", id)
      .eq("cenario_id", cenarioAtual)
      .order("ordem", { nullsFirst: false }),
    supabase
      .from("tabela_custo_hora")
      .select("area, cargo, tipo_contratacao, senioridade, valor_hora")
      .order("cargo"),
  ]);

  const status = (produto.status ?? "planejado") as StatusProduto;
  const precosPlanos = (planos ?? [])
    .map((p) => Number(p.preco ?? 0))
    .filter((v) => v > 0);
  const somaMix = (planos ?? []).reduce(
    (a, p) => a + Number(p.mix_percentual ?? 0),
    0,
  );
  const resumoPlanos =
    (planos ?? []).length === 0
      ? "nenhum plano ainda"
      : `${(planos ?? []).length} plano${(planos ?? []).length === 1 ? "" : "s"} · ${brl(Math.min(...precosPlanos))}–${brl(Math.max(...precosPlanos))}/mês · mix ${somaMix}%`;
  const precosNiveis = modulosComBeta
    .map((m) => Number(m.preco ?? 0))
    .filter((v) => v > 0);
  const resumoNiveis =
    modulosComBeta.length === 0
      ? "nenhum nível ainda"
      : `${modulosComBeta.length} níve${modulosComBeta.length === 1 ? "l" : "is"} · ${brl(Math.min(...precosNiveis))}–${brl(Math.max(...precosNiveis))}/mês`;
  const resumoModulos =
    modulosComBeta.length === 0
      ? "nenhum módulo"
      : `${modulosComBeta.length} módulo${modulosComBeta.length === 1 ? "" : "s"}`;
  const nEtapas = (etapasImplementacao ?? []).length;
  const resumoImplementacao = produto.tem_implementacao
    ? `${brl(Number(produto.preco_implementacao ?? 0))} · até ${produto.implementacao_parcelas ?? 1}× · ${nEtapas} etapa${nEtapas === 1 ? "" : "s"} de entrega`
    : "não cobra implementação";

  return (
    <div>
      <div className="mb-2">
        <Link href="/produtos" className="text-[12.5px] text-text-muted">
          ← Produtos
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">
            {produto.nome}
          </h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {produto.descricao ?? "Sem descrição."}
          </p>
          <p className="mt-0.5 text-[11px] text-text-faint">
            Precificação deste produto — fases ficam na lista de Produtos;
            canais, crescimento e churn ficam em Vendas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TipoPrecificacaoToggle
            produtoId={id}
            tipoAtual={produto.tipo_precificacao}
          />
          {cenarioAtual && (
            <CenarioSelector
              cenarios={cenarios ?? []}
              cenarioAtual={cenarioAtual}
            />
          )}
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

      {/* Cada assunto numa linha com o resumo; o "+" abre só o que se vai mexer — sem rolagem por card gigante. */}
      <div className="flex flex-col gap-2.5">
        <SecaoRecolhivel
          titulo="Status e datas"
          resumo={`${LABEL_STATUS[status]} · início dev. ${dataBR(produto.data_inicio_desenvolvimento)} · lançamento ${dataBR(produto.data_lancamento_estimada)}`}
          tooltip="Início do desenvolvimento é o mês 1 da simulação; lançamento é quando o produto começa a vender (pró-rata no mês, reajuste anual e gatilhos de módulos contam a partir dele). Início e fim de cada fase ficam na lista de Produtos."
          acao={<SeloStatus status={status} />}
        >
          <DatasProduto
            produtoId={id}
            dataInicioDesenvolvimento={produto.data_inicio_desenvolvimento}
            dataLancamentoEstimada={produto.data_lancamento_estimada}
          />
          <div className="border-t border-border-soft">
            <StatusProdutoControle
              produtoId={id}
              status={status}
              nome={produto.nome}
            />
          </div>
        </SecaoRecolhivel>

        <SecaoRecolhivel
          titulo="Implementação"
          resumo={resumoImplementacao}
          tooltip="Cobrança única na primeira contratação do produto: se o cliente adicionar um módulo depois, não cobra de novo; se comprar tudo junto, é a mesma cobrança única. O custo das etapas entra em COGS no mês do onboarding (o trabalho acontece ali, mesmo que o cliente pague parcelado), e é o que permite medir margem bruta do produto."
        >
          <ImplementacaoProduto
            produtoId={id}
            cenarioId={cenarioAtual}
            temImplementacao={produto.tem_implementacao}
            precoImplementacao={produto.preco_implementacao}
            parcelas={produto.implementacao_parcelas ?? 1}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formasPagamento={
              (produto.implementacao_formas_pagamento as any) ?? null
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            etapas={(etapasImplementacao ?? []) as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tabelaCustoHora={(tabelaCustoHora ?? []) as any}
          />
        </SecaoRecolhivel>

        {produto.tipo_precificacao === "modulos" ? (
          <SecaoRecolhivel
            titulo="Planos por módulo"
            resumo={resumoNiveis}
            aberto={modulosComBeta.length === 0}
            tooltip="Cada nível representa um combo cumulativo (ex: Basic → Starter → Premium). O preço cadastrado é sempre o valor MENSAL total cobrado do cliente nesse nível (não um acréscimo sobre o nível anterior, e não o total do ano). A cobrança (anual/mensal) só define o tempo mínimo de permanência. A adesão inicial e o crescimento mensal definem a curva de adoção até estabilizar no % de permanência estimado."
          >
            <NiveisModulo
              produtoId={id}
              cenarioId={cenarioAtual}
              niveis={modulosComBeta}
            />
          </SecaoRecolhivel>
        ) : (
          <>
            <SecaoRecolhivel
              titulo="Planos de precificação"
              resumo={resumoPlanos}
              aberto={(planos ?? []).length === 0}
            >
              <PlanosPrecificacao
                produtoId={id}
                cenarioId={cenarioAtual}
                planos={planos ?? []}
                precosFase={precosFase ?? []}
                fases={(fases ?? []).map((f) => ({
                  fase: f.fase,
                  data_inicio: f.data_inicio,
                  data_fim: f.data_fim,
                }))}
                betaTesters={betas ?? []}
              />
            </SecaoRecolhivel>
            <SecaoRecolhivel
              titulo="Módulos add-on"
              resumo={resumoModulos}
              tooltip="Para produtos com combo de módulos: cada módulo tem preço próprio e aumenta o valor pago pelo cliente a partir do momento em que entra. Pode ser lançado numa fase específica do ciclo de vida, ou N meses após o lançamento comercial do produto. A adesão começa num % inicial da base de clientes e cresce todo mês até saturar em 100% — para um módulo que já entra valendo para todos, use 100% de adesão inicial e 0% de crescimento."
            >
              <ModulosProduto
                produtoId={id}
                cenarioId={cenarioAtual}
                modulos={modulosComBeta}
              />
            </SecaoRecolhivel>
          </>
        )}
      </div>
    </div>
  );
}
