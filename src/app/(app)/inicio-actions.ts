"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function sessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Caixa de ações da tela inicial abre em "minhas" ou "todas" — por pessoa, vale em qualquer aparelho. */
export async function salvarPreferenciaInicio(soMinhas: boolean): Promise<{ error: string | null }> {
  const { supabase, user } = await sessao();
  if (!user) return { error: "Sessão expirada — entre de novo." };
  const { error } = await supabase.from("profiles").update({ inicio_so_minhas: soMinhas }).eq("id", user.id);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/");
  return { error: null };
}
