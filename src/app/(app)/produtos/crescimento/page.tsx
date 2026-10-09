import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CRESCIMENTO_PADRAO, type FaseCrescimento } from "@/lib/projecao-clientes";
import { CrescimentoForm } from "./crescimento-form";

export const dynamic = "force-dynamic";

/**
 * Plano de produto, tela 2 (etapa 3): crescimento e churn por fase, por módulo, com um padrão de
 * primeiro lançamento. Projeta clientes ativos ao longo do tempo. Só sócias.
 */
export default async function CrescimentoProdutoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect("/");

  const [{ data: modulosRaw }, { data: params }] = await Promise.all([
    supabase.from("catalogo_modulos").select("id, codigo, nome, crescimento, data_inicio_testes").eq("ativo", true).order("ordem"),
    supabase.from("parametros_precificacao").select("valor").eq("id", 1).maybeSingle(),
  ]);
  const padrao = ((params?.valor as { crescimento_padrao?: FaseCrescimento[] } | null)?.crescimento_padrao ?? CRESCIMENTO_PADRAO);
  const modulos = ((modulosRaw ?? []) as { id: string; codigo: string; nome: string; crescimento: FaseCrescimento[] | null; data_inicio_testes: string | null }[]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/produtos/participacao" className="text-[12px] text-text-muted hover:underline">← Participação</Link>
        <h1 className="font-heading text-[20px] font-semibold">Plano de produto · crescimento e churn</h1>
      </div>
      <p className="max-w-3xl text-[12.5px] text-text-muted">
        Tela 2 de 3. Defina como a plataforma cresce e perde clientes por fase. Cada módulo herda o primeiro lançamento e começa na sua data de testes (tela 1); ajuste onde precisar. A projeção de clientes no topo acompanha as suas mudanças.
      </p>
      <CrescimentoForm modulos={modulos} padraoInicial={padrao} />
    </div>
  );
}
