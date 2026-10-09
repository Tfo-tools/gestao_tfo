import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarDadosProduto } from "@/lib/produto-dados";
import { ProdutoConteudo } from "@/components/produto-conteudo";

export const dynamic = "force-dynamic";

/** Produto do plano (cenário). Igual ao Produto do Realizado; mesma fonte de dados. Só sócias. */
export default async function ProdutoDoPlanoPage({ params }: { params: Promise<{ cenarioId: string }> }) {
  const { cenarioId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect(`/plano/${cenarioId}`);
  const { modulos, blocos, perfis } = await carregarDadosProduto(supabase);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/plano/${cenarioId}`} className="text-[12px] text-text-muted hover:underline">← Cenário</Link>
        <h1 className="font-heading text-[20px] font-semibold">Produto · fases, testes, perfis e crescimento</h1>
      </div>
      <p className="max-w-3xl text-[12.5px] text-text-muted">Enquanto não há vendas importadas, esta tela é igual à de Produto no Realizado e editável nas duas. O que você muda aqui vale lá. Os perfis alimentam o cálculo do COGS. Só sócias.</p>
      <ProdutoConteudo modulos={modulos} blocos={blocos} perfis={perfis} />
    </div>
  );
}
