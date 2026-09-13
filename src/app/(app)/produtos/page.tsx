import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NovoProdutoForm } from "./novo-produto-form";
import { GradeProdutos, type ProdutoGrade } from "./grade-produtos";
import type { StatusProduto } from "@/lib/fases-produto";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string }>;
}) {
  const { cenario } = await searchParams;
  const supabase = await createClient();

  const { data: cenarios } = await supabase
    .from("cenarios")
    .select("id, nome, is_base")
    .order("created_at");
  const cenarioAtual =
    cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? "";
  const cenarioNome = (cenarios ?? []).find((c) => c.id === cenarioAtual)?.nome;

  const { data: produtos } = await supabase
    .from("produtos")
    .select(
      "id, nome, descricao, status, data_inicio_desenvolvimento, data_lancamento_estimada",
    )
    .order("nome");

  // As datas de fase são do produto: uma consulta só, sem filtro de cenário. A tela tem de ler da
  // mesma fonte em que grava — senão mostraria a data antiga enquanto o motor usa a nova.
  const { data: todasAsFases } = await supabase
    .from("produto_fases")
    .select("produto_id, fase, data_inicio, data_fim");

  const fasesPorProduto = new Map<string, ProdutoGrade["fases"]>();
  for (const f of (todasAsFases ?? []) as {
    produto_id: string;
    fase: string;
    data_inicio: string | null;
    data_fim: string | null;
  }[]) {
    const doProduto = fasesPorProduto.get(f.produto_id) ?? {};
    doProduto[f.fase] = { data_inicio: f.data_inicio, data_fim: f.data_fim };
    fasesPorProduto.set(f.produto_id, doProduto);
  }

  const grade: ProdutoGrade[] = (produtos ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    status: (p.status ?? "planejado") as StatusProduto,
    data_inicio_desenvolvimento: p.data_inicio_desenvolvimento,
    data_lancamento_estimada: p.data_lancamento_estimada,
    fases: fasesPorProduto.get(p.id) ?? {},
  }));

  return (
    <div>
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Produtos</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Status, datas e fases numa grade só — o nome do produto abre a
            precificação
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
            <p className="text-[13px] font-semibold text-primary-deep">
              Confirme os planos e módulos de cada produto
            </p>
            <p className="mt-0.5 text-[11.5px] text-primary-deep/80">
              Os planos e módulos daqui valem para este cenário; as datas das
              fases são do produto e valem em todos. Quando estiver tudo certo,
              siga pra planejar crescimento e churn.
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

      <GradeProdutos produtos={grade} cenarioId={cenarioAtual} />

      <div className="mt-3">
        <NovoProdutoForm cenarioId={cenarioAtual} cenarioNome={cenarioNome} />
      </div>
    </div>
  );
}
