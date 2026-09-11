"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AtivoFormState = { error: string | null; success?: boolean };

export async function criarAtivo(_prevState: AtivoFormState, formData: FormData): Promise<AtivoFormState> {
  const supabase = await createClient();

  const descricao = String(formData.get("descricao") || "").trim();
  const plano_contas_id = String(formData.get("plano_contas_id") || "");
  const produto_id = String(formData.get("produto_id") || "") || null;
  const valor = Number(formData.get("valor") || 0);
  const data_aquisicao = String(formData.get("data_aquisicao") || "");
  const vidaUtilRaw = String(formData.get("vida_util_meses") || "").trim();
  const vida_util_meses = vidaUtilRaw ? Number(vidaUtilRaw) : null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!descricao || !plano_contas_id || !valor || !data_aquisicao) {
    return { error: "Preencha descrição, conta, valor e data." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("ativos").insert({
    descricao,
    plano_contas_id,
    produto_id,
    valor,
    data_aquisicao,
    vida_util_meses,
    observacoes,
    criado_por: user?.id ?? null,
  });

  if (error) return { error: "Não foi possível salvar o ativo." };

  revalidatePath("/ativos");
  return { error: null, success: true };
}

export async function atualizarAtivo(_prevState: AtivoFormState, formData: FormData): Promise<AtivoFormState> {
  const supabase = await createClient();

  const id = String(formData.get("id") || "");
  const descricao = String(formData.get("descricao") || "").trim();
  const plano_contas_id = String(formData.get("plano_contas_id") || "");
  const produto_id = String(formData.get("produto_id") || "") || null;
  const valor = Number(formData.get("valor") || 0);
  const data_aquisicao = String(formData.get("data_aquisicao") || "");
  const vidaUtilRaw = String(formData.get("vida_util_meses") || "").trim();
  const vida_util_meses = vidaUtilRaw ? Number(vidaUtilRaw) : null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!id || !descricao || !plano_contas_id || !valor || !data_aquisicao) {
    return { error: "Preencha descrição, conta, valor e data." };
  }

  const { error } = await supabase
    .from("ativos")
    .update({ descricao, plano_contas_id, produto_id, valor, data_aquisicao, vida_util_meses, observacoes })
    .eq("id", id);

  if (error) return { error: "Não foi possível salvar a alteração." };

  revalidatePath("/ativos");
  return { error: null, success: true };
}

export async function excluirAtivo(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("ativos").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/ativos");
  return { error: null };
}
