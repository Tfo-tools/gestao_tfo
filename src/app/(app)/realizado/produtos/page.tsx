import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarDadosProduto } from "@/lib/produto-dados";
import { ProdutoConteudo } from "@/components/produto-conteudo";

export const dynamic = "force-dynamic";

/**
 * Produto da plataforma (realizado). Mesma tela do plano por enquanto (dados compartilhados): fases,
 * testes, perfis e crescimento das funcionalidades. Taxas/peso/custo são COGS e vivem na tela de COGS.
 * Só sócias.
 */
export default async function ProdutosRealizadoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect("/");

  const { modulos, blocos, perfis } = await carregarDadosProduto(supabase);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Produto da plataforma</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-text-muted">A definição do produto por funcionalidade: fases de lançamento, testes, perfis de cliente (que alimentam o cálculo) e crescimento/churn. Enquanto não há vendas importadas, é igual ao plano. Os custos (peso, processamento, taxas) ficam no <Link href="/realizado/cogs" className="underline">COGS</Link>.</p>
      </div>
      <ProdutoConteudo modulos={modulos} blocos={blocos} perfis={perfis} />
    </div>
  );
}
