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

export type BlocoEntrada = { id?: string; modulo_id: string; codigo: string; nome: string; descricao: string | null; peso_pct: number; remove_se: string[]; motivo: string | null; adesao_pct: number; ordem: number; ativo: boolean; custo_processamento_mes: number };

export async function salvarBloco(b: BlocoEntrada): Promise<{ error: string | null }> {
  const { supabase, user, ok } = await socia();
  if (!user) return { error: "Sessão expirada — entre de novo." };
  if (!ok) return { error: "Só as sócias editam o catálogo." };
  if (!b.nome.trim()) return { error: "O bloco precisa de nome." };
  const codigo = (b.codigo || b.nome).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const linha = {
    ...(b.id ? { id: b.id } : {}),
    modulo_id: b.modulo_id, codigo, nome: b.nome.trim(), descricao: b.descricao?.trim() || null,
    peso_pct: Number(b.peso_pct) || 0, adesao_pct: Math.min(1, Math.max(0, Number(b.adesao_pct) || 0)), ordem: Number(b.ordem) || 0, ativo: b.ativo, custo_processamento_mes: Math.max(0, Number(b.custo_processamento_mes) || 0),
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

export type CargoEntrada = { id?: string; area: string; cargo: string; senioridade: string; tipo_contratacao: string; valor_hora: number };

/** Adiciona ou edita um cargo e seu custo/hora na tabela de custo/hora (lista usada no suporte). */
export async function salvarCargo(c: CargoEntrada): Promise<{ error: string | null }> {
  const { supabase, user, ok } = await socia();
  if (!user) return { error: "Sessão expirada — entre de novo." };
  if (!ok) return { error: "Só as sócias editam a lista de cargos." };
  if (!c.cargo.trim()) return { error: "Informe o cargo." };
  const linha = { area: c.area.trim() || "Geral", cargo: c.cargo.trim(), senioridade: c.senioridade, tipo_contratacao: c.tipo_contratacao, valor_hora: Math.max(0, Number(c.valor_hora) || 0) };
  const resp = c.id
    ? await supabase.from("tabela_custo_hora").update(linha).eq("id", c.id)
    : await supabase.from("tabela_custo_hora").insert(linha);
  if (resp.error) return { error: `Não foi possível salvar o cargo: ${resp.error.message}` };
  revalidatePath("/propostas", "layout");
  return { error: null };
}

export async function excluirCargo(id: string): Promise<{ error: string | null }> {
  const { user, ok, supabase } = await socia();
  if (!user || !ok) return { error: "Só as sócias editam a lista de cargos." };
  const { error } = await supabase.from("tabela_custo_hora").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/propostas", "layout");
  return { error: null };
}
