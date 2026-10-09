import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TaxasPagamentoCard } from "../../configuracoes/taxas-pagamento-card";
import type { TaxaPagamento } from "@/lib/taxas-pagamento";

export const dynamic = "force-dynamic";

/**
 * Produtos no Realizado (08/10/2026). Decisão da sócia: taxas e preços de produto não ficam em
 * Configurações (que é para usuários e visão), e sim aqui. A lógica: você monta no plano Base; o
 * que vale para o negócio operando mora aqui. Enquanto não há realizado, a proposta lê o Base;
 * quando começar a realizar, estes valores passam a valer e o plano vira sandbox de planejamento.
 * Hoje esta tela já guarda as taxas de pagamento (Asaas); o espelho de preços por produto entra
 * com a estrutura de Realizado que receberá da plataforma de vendas.
 */
export default async function ProdutosRealizadoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect("/");

  const { data: taxasRaw } = await supabase.from("taxas_pagamento").select("*").order("prazo").order("meio").order("vigencia_inicio");
  const taxas = ((taxasRaw ?? []) as TaxaPagamento[]).map((t) => ({ ...t, pct: Number(t.pct), fixo: Number(t.fixo) }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Produtos (Realizado)</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-text-muted">
          Onde ficam as taxas e, em breve, os preços de produto que valem para o negócio operando. Você monta no plano Base; quando começar a realizar, estes valores passam a valer e o plano fica para planejar cenários. Hoje: as taxas de pagamento (Asaas), que a proposta comercial e o custo do plano leem.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-heading text-sm font-semibold">Plano de produto</h2>
        <p className="mt-0.5 text-[12.5px] text-text-muted">Participação, datas de teste e modelo de cobrança por módulo e funcionalidade.</p>
        <Link href="/produtos/participacao" className="mt-2 inline-block rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white">Abrir plano de produto →</Link>
        <Link href="/produtos/catalogo" className="mt-2 ml-2 inline-block rounded-lg border border-border px-3.5 py-2 text-[12px] font-medium text-text-muted hover:border-primary-fill hover:text-primary-deep">Catálogo de módulos e blocos →</Link>
      </div>
      <TaxasPagamentoCard taxas={taxas} />
    </div>
  );
}
