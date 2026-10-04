"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Entrega = { titulo: string; feito: boolean };
export type FocoSemana = { id: string; texto: string; prazo: string | null; donas: string[]; entregas: Entrega[] };

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

/** Cria ou atualiza o foco da semana (manchete da tela inicial). Até 5 entregas; as já feitas são preservadas pelo título. */
export async function salvarFoco(dados: { id: string | null; texto: string; prazo: string | null; donas: string[]; entregas: string[] }): Promise<{ error: string | null }> {
  const texto = dados.texto.trim();
  if (!texto) return { error: "Escreva o foco da semana." };
  const { supabase, user } = await sessao();
  if (!user) return { error: "Sessão expirada — entre de novo." };

  let feitas = new Set<string>();
  if (dados.id) {
    const { data: atual } = await supabase.from("foco_semana").select("entregas").eq("id", dados.id).maybeSingle();
    feitas = new Set(((atual?.entregas ?? []) as Entrega[]).filter((e) => e.feito).map((e) => e.titulo));
  }
  const entregas: Entrega[] = dados.entregas
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((titulo) => ({ titulo, feito: feitas.has(titulo) }));
  const linha = { texto, prazo: dados.prazo || null, donas: dados.donas, entregas, atualizado_em: new Date().toISOString(), atualizado_por: user.id };

  const { error } = dados.id ? await supabase.from("foco_semana").update(linha).eq("id", dados.id) : await supabase.from("foco_semana").insert(linha);
  if (error) return { error: "Não foi possível salvar o foco." };
  revalidatePath("/");
  return { error: null };
}

/** Marca/desmarca uma entrega do foco. */
export async function alternarEntrega(id: string, indice: number, feito: boolean): Promise<{ error: string | null }> {
  const { supabase, user } = await sessao();
  if (!user) return { error: "Sessão expirada — entre de novo." };
  const { data: atual } = await supabase.from("foco_semana").select("entregas").eq("id", id).maybeSingle();
  if (!atual) return { error: "Foco não encontrado." };
  const entregas = (atual.entregas as Entrega[]).map((e, i) => (i === indice ? { ...e, feito } : e));
  const { error } = await supabase.from("foco_semana").update({ entregas, atualizado_em: new Date().toISOString(), atualizado_por: user.id }).eq("id", id);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/");
  return { error: null };
}
