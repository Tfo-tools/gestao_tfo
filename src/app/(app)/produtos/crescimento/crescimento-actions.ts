"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FaseCrescimento } from "@/lib/projecao-clientes";

async function socia() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false };
  const { data: perfil } = await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle();
  return { supabase, ok: perfil?.papel === "socia" };
}

const limpaFases = (f: FaseCrescimento[]): FaseCrescimento[] =>
  (f ?? []).map((x) => ({ nome: String(x.nome || "Fase").slice(0, 40), meses: Math.max(0, Math.round(Number(x.meses) || 0)), novos_mes: Math.max(0, Number(x.novos_mes) || 0), churn_pct: Math.max(0, Number(x.churn_pct) || 0) }));

/** Salva o padrão de primeiro lançamento (nos parâmetros) e as curvas por módulo (null = herda o padrão). */
export async function salvarCrescimento(padrao: FaseCrescimento[], porModulo: { id: string; herdaPadrao: boolean; fases: FaseCrescimento[] }[]): Promise<{ error: string | null }> {
  const { supabase, ok } = await socia();
  if (!ok) return { error: "Só as sócias editam o crescimento." };
  const { data: p } = await supabase.from("parametros_precificacao").select("valor").eq("id", 1).maybeSingle();
  const valor = { ...((p?.valor ?? {}) as Record<string, unknown>), crescimento_padrao: limpaFases(padrao) };
  const { error: eP } = await supabase.from("parametros_precificacao").update({ valor, atualizado_em: new Date().toISOString() }).eq("id", 1);
  if (eP) return { error: "Não foi possível salvar o padrão." };
  for (const m of porModulo) {
    const { error } = await supabase.from("catalogo_modulos").update({ crescimento: m.herdaPadrao ? null : limpaFases(m.fases) }).eq("id", m.id);
    if (error) return { error: `Não foi possível salvar o módulo: ${error.message}` };
  }
  revalidatePath("/produtos/crescimento");
  revalidatePath("/propostas", "layout");
  return { error: null };
}
