import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarBasesProposta, carregarClientesProjetados } from "@/lib/precificacao-bases";
import { carregarDadosProduto } from "@/lib/produto-dados";
import { CogsConteudo } from "@/components/cogs-conteudo";
import type { TaxaPagamento } from "@/lib/taxas-pagamento";

export const dynamic = "force-dynamic";

/** COGS do plano (cenário). Igual ao COGS do Realizado; mesma fonte de dados. Só sócias. */
export default async function CogsDoPlanoPage({ params }: { params: Promise<{ cenarioId: string }> }) {
  const { cenarioId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect(`/plano/${cenarioId}`);
  const [bases, { data: taxasRaw }, clientesAno1, dadosProduto] = await Promise.all([
    carregarBasesProposta(supabase),
    supabase.from("taxas_pagamento").select("*").order("prazo").order("meio").order("vigencia_inicio"),
    carregarClientesProjetados(supabase, 12),
    carregarDadosProduto(supabase),
  ]);
  const taxas = ((taxasRaw ?? []) as TaxaPagamento[]).map((t) => ({ ...t, pct: Number(t.pct), fixo: Number(t.fixo) }));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/plano/${cenarioId}`} className="text-[12px] text-text-muted hover:underline">← Cenário</Link>
        <h1 className="font-heading text-[20px] font-semibold">COGS · custo do serviço e tabela comercial</h1>
      </div>
      <p className="max-w-3xl text-[12.5px] text-text-muted">Enquanto não há vendas importadas, esta tela é igual à de COGS no Realizado e editável nas duas. O que você muda aqui vale lá. Só sócias; o vendedor não vê.</p>
      <CogsConteudo bases={bases} taxas={taxas} clientesAno1={clientesAno1} perfis={dadosProduto.perfis} />
    </div>
  );
}
