import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarBasesProposta } from "@/lib/precificacao-bases";
import { ParametrosForm } from "./parametros-form";
import { CatalogoForm } from "./catalogo-form";
import { SimuladorDesconto } from "./simulador-desconto";

export const dynamic = "force-dynamic";

/** Parâmetros de precificação e catálogo (módulos e blocos). Só sócias. */
export default async function ParametrosPropostaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect("/propostas");
  const bases = await carregarBasesProposta(supabase);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/propostas" className="text-[12px] text-text-muted hover:underline">← Propostas</Link>
        <h1 className="font-heading text-[20px] font-semibold">Parâmetros e catálogo da proposta</h1>
      </div>
      <p className="max-w-3xl text-[12.5px] text-text-muted">
        O que a proposta lê do plano Base hoje: custo fixo de infraestrutura {bases.bases.custo_fixo_infra_mes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês,
        {" "}{bases.bases.clientes_previstos_mes} clientes previstos em {bases.mes}, custo da hora de suporte {bases.bases.custo_hora_suporte.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })},
        {" "}implantação {bases.bases.horas_implantacao_padrao} h = {bases.bases.custo_implantacao_padrao.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (etapas cadastradas no Base),
        {" "}{bases.bases.taxas.length} taxas vigentes. Esses números mudam nas telas de origem (Plano → Custos, Produtos → implantação, Configurações → Taxas); aqui ficam as regras.
      </p>
      <ParametrosForm params={bases.params} />
      <SimuladorDesconto bases={bases} />
      <CatalogoForm modulos={bases.modulos} blocos={bases.blocos} />
    </div>
  );
}
