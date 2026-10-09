import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ParticipacaoForm } from "./participacao-form";

export const dynamic = "force-dynamic";

/**
 * Plano de produto, tela 1 (etapa 2 da reestruturação): participação, início dos testes e modelo de
 * cobrança por módulo e por funcionalidade. Só sócias. Alimenta a projeção de clientes e assinaturas.
 */
export default async function ParticipacaoProdutoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect("/");

  const [{ data: modulos }, { data: blocos }] = await Promise.all([
    supabase.from("catalogo_modulos").select("*").eq("ativo", true).order("ordem"),
    supabase.from("catalogo_blocos").select("*").eq("ativo", true).order("ordem"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/realizado/produtos" className="text-[12px] text-text-muted hover:underline">← Produtos</Link>
        <h1 className="font-heading text-[20px] font-semibold">Plano de produto · participação e modelo</h1>
      </div>
      <p className="max-w-3xl text-[12.5px] text-text-muted">
        Tela 1 de 3. Para cada módulo e funcionalidade: a participação esperada (quantos clientes contratam), a data de início dos testes e o modelo de cobrança (pago, com valor fixo ou calculado, ou gratuito). As próximas telas usam isto para projetar crescimento, churn e o custo médio por cliente.
      </p>
      <ParticipacaoForm modulos={(modulos ?? []) as never} blocos={(blocos ?? []) as never} />
    </div>
  );
}
