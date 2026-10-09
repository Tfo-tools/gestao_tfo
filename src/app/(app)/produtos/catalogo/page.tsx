import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarBasesProposta } from "@/lib/precificacao-bases";
import { CatalogoForm } from "@/app/(comercial)/propostas/parametros/catalogo-form";

export const dynamic = "force-dynamic";

/**
 * Tela de produto: catálogo de módulos e blocos (peso, processamento, regra de perfil, adesão).
 * Saiu dos parâmetros de precificação (09/10/2026) — é definição de produto. Só sócias.
 */
export default async function CatalogoProdutoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect("/");
  const bases = await carregarBasesProposta(supabase);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/realizado/produtos" className="text-[12px] text-text-muted hover:underline">← Produtos</Link>
        <h1 className="font-heading text-[20px] font-semibold">Produto · catálogo de módulos e blocos</h1>
      </div>
      <CatalogoForm modulos={bases.modulos} blocos={bases.blocos} />
    </div>
  );
}
