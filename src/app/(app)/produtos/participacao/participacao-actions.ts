"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ItemParticipacao = {
  id: string;
  adesao_pct: number;
  data_inicio_testes: string | null;
  modelo_cobranca: "pago" | "gratuito";
  valor_mensal: number | null;
};

async function socia() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false };
  const { data: perfil } = await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle();
  return { supabase, ok: perfil?.papel === "socia" };
}

/** Salva a tela 1 do plano de produto: participação, início dos testes e modelo de cobrança, por módulo e por bloco. */
export async function salvarParticipacao(modulos: ItemParticipacao[], blocos: ItemParticipacao[]): Promise<{ error: string | null }> {
  const { supabase, ok } = await socia();
  if (!ok) return { error: "Só as sócias editam o plano de produto." };
  const limpa = (it: ItemParticipacao) => ({
    adesao_pct: Math.min(1, Math.max(0, Number(it.adesao_pct) || 0)),
    data_inicio_testes: it.data_inicio_testes || null,
    modelo_cobranca: it.modelo_cobranca === "gratuito" ? "gratuito" : "pago",
    valor_mensal: it.modelo_cobranca === "gratuito" ? null : it.valor_mensal != null && Number.isFinite(Number(it.valor_mensal)) ? Number(it.valor_mensal) : null,
  });
  for (const m of modulos) {
    const { error } = await supabase.from("catalogo_modulos").update(limpa(m)).eq("id", m.id);
    if (error) return { error: `Não foi possível salvar o módulo: ${error.message}` };
  }
  for (const b of blocos) {
    const { error } = await supabase.from("catalogo_blocos").update(limpa(b)).eq("id", b.id);
    if (error) return { error: `Não foi possível salvar o bloco: ${error.message}` };
  }
  revalidatePath("/produtos/participacao");
  revalidatePath("/propostas", "layout");
  return { error: null };
}
