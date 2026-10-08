"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParametrosPrecificacao } from "@/lib/precificacao";

async function socia() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, ok: false };
  const { data: perfil } = await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle();
  return { supabase, user, ok: perfil?.papel === "socia" };
}

export async function salvarParametrosPrecificacao(valor: ParametrosPrecificacao): Promise<{ error: string | null }> {
  const { supabase, user, ok } = await socia();
  if (!user) return { error: "Sessão expirada — entre de novo." };
  if (!ok) return { error: "Só as sócias editam os parâmetros." };
  const { error } = await supabase.from("parametros_precificacao").upsert({ id: 1, valor, atualizado_em: new Date().toISOString(), atualizado_por: user.id });
  if (error) return { error: "Não foi possível salvar os parâmetros." };
  revalidatePath("/propostas", "layout");
  return { error: null };
}

export type BlocoEntrada = { id?: string; modulo_id: string; codigo: string; nome: string; descricao: string | null; peso_pct: number; remove_se: string[]; motivo: string | null; adesao_pct: number; ordem: number; ativo: boolean };

export async function salvarBloco(b: BlocoEntrada): Promise<{ error: string | null }> {
  const { supabase, user, ok } = await socia();
  if (!user) return { error: "Sessão expirada — entre de novo." };
  if (!ok) return { error: "Só as sócias editam o catálogo." };
  if (!b.nome.trim()) return { error: "O bloco precisa de nome." };
  const codigo = (b.codigo || b.nome).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const linha = {
    ...(b.id ? { id: b.id } : {}),
    modulo_id: b.modulo_id, codigo, nome: b.nome.trim(), descricao: b.descricao?.trim() || null,
    peso_pct: Number(b.peso_pct) || 0, adesao_pct: Math.min(1, Math.max(0, Number(b.adesao_pct) || 0)), ordem: Number(b.ordem) || 0, ativo: b.ativo,
    regra_perfil: b.remove_se.length > 0 ? { remove_se: b.remove_se, motivo: b.motivo?.trim() || null } : {},
  };
  const { error } = await supabase.from("catalogo_blocos").upsert(linha, { onConflict: "modulo_id,codigo" });
  if (error) return { error: `Não foi possível salvar o bloco: ${error.message}` };
  revalidatePath("/propostas", "layout");
  return { error: null };
}

export async function excluirBloco(id: string): Promise<{ error: string | null }> {
  const { supabase, user, ok } = await socia();
  if (!user || !ok) return { error: "Só as sócias editam o catálogo." };
  const { error } = await supabase.from("catalogo_blocos").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/propostas", "layout");
  return { error: null };
}

export async function salvarModulo(m: { id: string; nome: string; descricao: string | null; ativo: boolean; ordem: number }): Promise<{ error: string | null }> {
  const { supabase, user, ok } = await socia();
  if (!user || !ok) return { error: "Só as sócias editam o catálogo." };
  const { error } = await supabase.from("catalogo_modulos").update({ nome: m.nome.trim(), descricao: m.descricao?.trim() || null, ativo: m.ativo, ordem: m.ordem }).eq("id", m.id);
  if (error) return { error: "Não foi possível salvar o módulo." };
  revalidatePath("/propostas", "layout");
  return { error: null };
}
