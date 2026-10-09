import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarBasesProposta, carregarClientesProjetados } from "@/lib/precificacao-bases";
import { CogsConteudo } from "@/components/cogs-conteudo";
import type { TaxaPagamento } from "@/lib/taxas-pagamento";

export const dynamic = "force-dynamic";

/** COGS no Realizado (registro de custo). Hoje igual ao COGS do plano; vira relatório com custos reais
 * quando houver vendas importadas. Só sócias. */
export default async function CogsRealizadoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect("/");
  const [bases, { data: taxasRaw }, clientesAno1] = await Promise.all([
    carregarBasesProposta(supabase),
    supabase.from("taxas_pagamento").select("*").order("prazo").order("meio").order("vigencia_inicio"),
    carregarClientesProjetados(supabase, 12),
  ]);
  const taxas = ((taxasRaw ?? []) as TaxaPagamento[]).map((t) => ({ ...t, pct: Number(t.pct), fixo: Number(t.fixo) }));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-[20px] font-semibold">COGS · custo do serviço (Realizado)</h1>
        <p className="mt-1 max-w-3xl text-[12.5px] text-text-muted">Registro de custo do serviço prestado. Hoje é igual ao COGS do plano e editável nos dois; quando entrarem vendas, vira relatório com os custos reais. Só sócias.</p>
      </div>
      <CogsConteudo bases={bases} taxas={taxas} clientesAno1={clientesAno1} />
    </div>
  );
}
