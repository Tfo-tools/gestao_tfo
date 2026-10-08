"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MeioPagamento, PrazoPagamento } from "@/lib/taxas-pagamento";

export type LinhaTaxa = { id?: string; meio: MeioPagamento; prazo: PrazoPagamento; pct: number; fixo: number; uso: string | null; vigencia_inicio: string; vigencia_fim: string | null; ativo: boolean };

const MEIOS = new Set(["boleto", "pix", "cartao"]);
const PRAZOS = new Set(["mensal", "avista", "3x", "5x"]);

/** Salva o cadastro único de taxas (uma linha por meio × prazo × vigência). A tela manda % em percentual; o banco guarda fração. */
export async function salvarTaxasPagamento(linhas: LinhaTaxa[]): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada — entre de novo." };
  for (const l of linhas) {
    if (!MEIOS.has(l.meio) || !PRAZOS.has(l.prazo)) return { error: "Meio ou prazo inválido." };
    if (!Number.isFinite(l.pct) || l.pct < 0 || l.pct > 1) return { error: "Percentual fora da faixa (0 a 100%)." };
    if (!Number.isFinite(l.fixo) || l.fixo < 0) return { error: "Tarifa fixa inválida." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.vigencia_inicio)) return { error: "Informe a data de início da vigência." };
  }
  const payload = linhas.map((l) => ({
    ...(l.id ? { id: l.id } : {}),
    meio: l.meio,
    prazo: l.prazo,
    pct: l.pct,
    fixo: l.fixo,
    uso: l.uso?.trim() || null,
    vigencia_inicio: l.vigencia_inicio,
    vigencia_fim: l.vigencia_fim || null,
    ativo: l.ativo,
    atualizado_em: new Date().toISOString(),
    atualizado_por: user.id,
  }));
  const { error } = await supabase.from("taxas_pagamento").upsert(payload, { onConflict: "meio,prazo,vigencia_inicio" });
  if (error) return { error: `Não foi possível salvar as taxas: ${error.message}` };
  revalidatePath("/configuracoes");
  revalidatePath("/plano", "layout");
  return { error: null };
}

export async function excluirTaxaPagamento(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("taxas_pagamento").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/configuracoes");
  revalidatePath("/plano", "layout");
  return { error: null };
}
