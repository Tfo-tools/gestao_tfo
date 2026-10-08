import type { SupabaseClient } from "@supabase/supabase-js";
import type { CogsPremissas } from "@/lib/cogs";

/**
 * Taxas de meios de pagamento (Asaas) — cadastro ÚNICO do Gestão (Configurações), por meio e prazo,
 * com vigência. Decisão de 08/10/2026: o bloco "gateway" do COGS de cada produto guarda só o MIX
 * (quantas cobranças saem em cada meio); as tarifas vêm daqui, e a proposta comercial lê a mesma
 * tabela pelo meio e prazo escolhidos. Uma fonte só: mudou a taxa, mudou no plano e na proposta.
 */

export type MeioPagamento = "boleto" | "pix" | "cartao";
/** mensal = parcela da assinatura; avista/3x/5x = implantação (só esses prazos). */
export type PrazoPagamento = "mensal" | "avista" | "3x" | "5x";

export type TaxaPagamento = {
  id: string;
  meio: MeioPagamento;
  prazo: PrazoPagamento;
  /** Fração (0,0299 = 2,99%) sobre o valor cobrado. */
  pct: number;
  /** R$ por cobrança paga. */
  fixo: number;
  uso: string | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  ativo: boolean;
};

export const MEIOS: { valor: MeioPagamento; rotulo: string }[] = [
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "pix", rotulo: "Pix" },
  { valor: "cartao", rotulo: "Cartão de crédito" },
];
export const PRAZOS: { valor: PrazoPagamento; rotulo: string; grupo: "assinatura" | "implantacao" }[] = [
  { valor: "mensal", rotulo: "Mensal (assinatura)", grupo: "assinatura" },
  { valor: "avista", rotulo: "À vista (implantação)", grupo: "implantacao" },
  { valor: "3x", rotulo: "3x (implantação)", grupo: "implantacao" },
  { valor: "5x", rotulo: "5x (implantação)", grupo: "implantacao" },
];

/** Taxas em vigor numa data (padrão hoje): a linha ativa, com início ≤ data e fim nulo ou ≥ data; empate = a mais recente. */
export function taxasVigentesEm(todas: TaxaPagamento[], dataIso = new Date().toISOString().slice(0, 10)): TaxaPagamento[] {
  const porChave = new Map<string, TaxaPagamento>();
  for (const t of todas) {
    if (!t.ativo || t.vigencia_inicio > dataIso || (t.vigencia_fim && t.vigencia_fim < dataIso)) continue;
    const chave = `${t.meio}|${t.prazo}`;
    const atual = porChave.get(chave);
    if (!atual || t.vigencia_inicio > atual.vigencia_inicio) porChave.set(chave, t);
  }
  return [...porChave.values()];
}

export function taxaPara(vigentes: TaxaPagamento[], meio: MeioPagamento, prazo: PrazoPagamento): TaxaPagamento | null {
  return vigentes.find((t) => t.meio === meio && t.prazo === prazo) ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function carregarTaxasVigentes(supabase: SupabaseClient<any, any, any>, dataIso?: string): Promise<TaxaPagamento[]> {
  const { data } = await supabase.from("taxas_pagamento").select("*").order("vigencia_inicio");
  return taxasVigentesEm(((data ?? []) as TaxaPagamento[]).map((t) => ({ ...t, pct: Number(t.pct), fixo: Number(t.fixo) })), dataIso);
}

/**
 * Sobrescreve as tarifas do bloco gateway das premissas de COGS com as taxas MENSAIS vigentes
 * (assinatura). O mix continua o que está nas premissas. Sem taxa cadastrada, mantém o que havia.
 */
export function aplicarTaxasNoGateway<T extends CogsPremissas | null | undefined>(premissas: T, vigentes: TaxaPagamento[]): T {
  if (!premissas || vigentes.length === 0) return premissas;
  const c = taxaPara(vigentes, "cartao", "mensal");
  const b = taxaPara(vigentes, "boleto", "mensal");
  const p = taxaPara(vigentes, "pix", "mensal");
  return {
    ...premissas,
    gateway: {
      ...(premissas.gateway ?? {}),
      ...(c ? { cartao_pct: c.pct, cartao_fixo: c.fixo } : {}),
      ...(b ? { boleto_fixo: b.fixo } : {}),
      ...(p ? { pix_fixo: p.fixo } : {}),
    },
  };
}
