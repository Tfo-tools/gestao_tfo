import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NovoProdutoForm } from "./novo-produto-form";
import { FasesMatriz, type ProdutoFases } from "./fases-matriz";
import { FASES } from "@/lib/fases";
import { AvisoTelaGrande } from "@/components/aviso-tela-grande";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string }>;
}) {
  const { cenario } = await searchParams;
  const supabase = await createClient();

  const { data: cenarios } = await supabase.from("cenarios").select("id, nome, is_base").order("created_at");
  const cenarioAtual = cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? "";
  const cenarioNome = (cenarios ?? []).find((c) => c.id === cenarioAtual)?.nome;

  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, nome, descricao, data_inicio_desenvolvimento, data_lancamento_estimada, cenario_id")
    .or(`cenario_id.is.null${cenarioAtual ? `,cenario_id.eq.${cenarioAtual}` : ""}`)
    .order("nome");

  const produtosFases: ProdutoFases[] = cenarioAtual
    ? await Promise.all(
        (produtos ?? []).map(async (produto) => {
          const { data: fases } = await supabase
            .from("fases_produto")
            .select("fase, data_inicio, data_fim")
            .eq("produto_id", produto.id)
            .eq("cenario_id", cenarioAtual);

          const faseByValue = new Map((fases ?? []).map((f) => [f.fase, f]));

          return {
            id: produto.id,
            nome: produto.nome,
            fases: FASES.map((f, i) => ({
              fase: f.value,
              label: f.label,
              ordem: i + 1,
              dados: faseByValue.get(f.value) ?? null,
            })),
          };
        }),
      )
    : [];

  return (
    <div>
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Produtos</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Ciclo de vida, precificação e premissas de crescimento por produto
          </p>
        </div>
        <div className="flex items-center gap-3">
          {cenarioNome && (
            <span className="rounded-lg border border-[#e6d3d9] bg-wine-soft px-3 py-2 text-[12.5px] font-medium text-wine">
              Cenário: {cenarioNome}
            </span>
          )}
          <Link
            href="/produtos/combos"
            className="rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-primary-deep"
          >
            Combos &amp; Pacotes
          </Link>
        </div>
      </div>

      {cenario && cenarioAtual && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-primary-fill bg-primary-soft px-5 py-4">
          <div>
            <p className="text-[13px] font-semibold text-primary-deep">Confirme os planos e módulos de cada produto</p>
            <p className="mt-0.5 text-[11.5px] text-primary-deep/80">
              Os planos e módulos daqui valem só pra este cenário — quando estiver tudo certo, siga pra planejar
              crescimento e churn.
            </p>
          </div>
          <Link
            href={`/plano/${cenarioAtual}/vendas`}
            className="whitespace-nowrap rounded-lg bg-wine-deep px-4 py-2.5 text-[13px] font-medium text-white"
          >
            Ir para Vendas →
          </Link>
        </div>
      )}

      <div className="mb-6">
        <NovoProdutoForm cenarioId={cenarioAtual} cenarioNome={cenarioNome} />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-4">
        {(produtos ?? []).map((p) => (
          <Link
            key={p.id}
            href={cenarioAtual ? `/produtos/${p.id}?cenario=${cenarioAtual}` : `/produtos/${p.id}`}
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary-fill"
          >
            <div className="flex items-center gap-2">
              <div className="font-heading text-[15px] font-semibold">{p.nome}</div>
              {p.cenario_id && (
                <span className="rounded bg-cream px-1.5 py-0.5 text-[9.5px] font-semibold text-cream-deep">
                  só nesse cenário
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[12px] text-text-muted">{p.descricao ?? "Sem descrição ainda."}</p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-text-faint">
              <span>
                Início dev.:{" "}
                {p.data_inicio_desenvolvimento
                  ? new Date(p.data_inicio_desenvolvimento).toLocaleDateString("pt-BR")
                  : "—"}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {cenarioAtual && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-1 font-heading text-[13px] font-semibold">Fases do ciclo de vida</h2>
          <p className="mb-4 text-[11px] text-text-muted">
            Início e fim de cada fase, lado a lado por produto — todas as fases ficam visíveis pra preencher mais
            rápido, sem precisar expandir uma por uma. Crescimento, churn, conversão e capacidade ficam em Vendas.
          </p>
          <AvisoTelaGrande />
          <FasesMatriz cenarioId={cenarioAtual} produtos={produtosFases} />
        </div>
      )}
    </div>
  );
}
