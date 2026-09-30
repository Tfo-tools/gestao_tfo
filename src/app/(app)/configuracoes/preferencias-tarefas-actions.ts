"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type VisaoTarefas = "projeto" | "situacao" | "quadro";

/** Preferência por pessoa: como a tela Tarefas abre (visão) e se mostra só as tarefas dela. */
export async function salvarPreferenciasTarefas(visao: VisaoTarefas, soMinhas: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada — entre de novo." };
  const { error } = await supabase.from("profiles").update({ tarefas_visao_padrao: visao, tarefas_so_minhas: soMinhas }).eq("id", user.id);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/tarefas");
  revalidatePath("/configuracoes");
  return { error: null };
}
