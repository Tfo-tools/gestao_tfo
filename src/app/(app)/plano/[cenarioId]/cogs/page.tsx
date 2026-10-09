import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarBasesProposta } from "@/lib/precificacao-bases";
import { ParametrosForm } from "@/app/(comercial)/propostas/parametros/parametros-form";
import { CatalogoForm } from "@/app/(comercial)/propostas/parametros/catalogo-form";
import { SimuladorDesconto } from "@/app/(comercial)/propostas/parametros/simulador-desconto";

export const dynamic = "force-dynamic";

/**
 * COGS do plano (09/10/2026): espelho da tela de custos do produto, dentro do cenário, no formato
 * das linhas do DRE. Mesma fonte de dados dos parâmetros do app Comercial — o que muda aqui vale lá
 * e vice-versa. Só sócias: o vendedor nunca vê os custos do produto.
 */
export default async function CogsDoPlanoPage({ params }: { params: Promise<{ cenarioId: string }> }) {
  const { cenarioId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect(`/plano/${cenarioId}`);

  const bases = await carregarBasesProposta(supabase);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/plano/${cenarioId}`} className="text-[12px] text-text-muted hover:underline">← Cenário</Link>
        <h1 className="font-heading text-[20px] font-semibold">COGS · custos do produto e tabela comercial</h1>
      </div>
      <p className="max-w-3xl text-[12.5px] text-text-muted">
        Espelho da tela de Produtos. Os mesmos números valem no app Comercial. Aqui você define os critérios de custo, margem e desconto; o vendedor não vê esta tela.
      </p>
      <ParametrosForm params={bases.params} />
      <SimuladorDesconto bases={bases} />
      <CatalogoForm modulos={bases.modulos} blocos={bases.blocos} />
    </div>
  );
}
