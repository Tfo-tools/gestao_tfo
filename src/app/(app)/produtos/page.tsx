import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NovoProdutoForm } from "./novo-produto-form";
import { FasesMatriz, type ProdutoFases } from "./fases-matriz";
import { FASES } from "@/lib/fases";
import { AvisoTelaGrande } from "@/components/aviso-tela-grande";
import { SeloStatus } from "./status-produto";
import type { StatusProduto } from "@/lib/fases-produto";

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
    .select("id, nome, descricao, status, data_inicio_desenvolvimento, data_lancamento_estimada")
    .order("nome");

  // As datas de fase são do produto: uma consulta só, sem filtro de cenário. A tela tem de ler da
  // mesma fonte em que grava — senão mostraria a data antiga enquanto o motor usa a nova.
  const { data: todasAsFases } = await supabase
    .from("produto_fases")
    .select("produto_id, fase, data_inicio, data_fim");

  const fasesPorProduto = new Map<string, Map<string, { data_inicio: string | null; data_fim: string | null }>>();
  for (const f of (todasAsFases ?? []) as { produto_id: string; fase: string; data_inicio: string | null; data_fim: string | null }[]) {
    const doProduto = fasesPorProduto.get(f.produto_id) ?? new Map();
    doProduto.set(f.fase, { data_inicio: f.data_inicio, data_fim: f.data_fim });
    fasesPorProduto.set(f.produto_id, doProduto);
  }

  const produtosFases: ProdutoFases[] = (produtos ?? []).map((produto) => {
    const doProduto = fasesPorProduto.get(produto.id) ?? new Map();
    return {
      id: produto.id,
      nome: produto.nome,
      fases: FASES.map((f, i) => ({
        fase: f.value,
        label: f.label,
        ordem: i + 1,
        dados: doProduto.get(f.value) ?? null,
      })),
    };
  });

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
              Os planos e módulos daqui valem para este cenário; as datas das fases são do produto e valem em todos.
              Quando estiver tudo certo, siga pra planejar crescimento e churn.
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
              <SeloStatus status={(p.status ?? "planejado") as StatusProduto} />
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

      {(
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-1 font-heading text-[13px] font-semibold">Fases do ciclo de vida</h2>
          <p className="mb-4 text-[11px] text-text-muted">
            Início e fim de cada fase, lado a lado por produto. <strong>Estas datas são do produto</strong>: valem em
            todos os cenários em que ele estiver vinculado, e ficam congeladas quando o produto passa a iniciado.
            Crescimento, churn e conversão são de cada cenário e ficam em Vendas.
          </p>
          <AvisoTelaGrande />
          <FasesMatriz cenarioId={cenarioAtual} produtos={produtosFases} />
        </div>
      )}
    </div>
  );
}
