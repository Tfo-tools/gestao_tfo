"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

export async function criarRubrica(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const programa_id = String(formData.get("programa_id") || "");
  const nome = String(formData.get("nome") || "").trim();
  const fonte = String(formData.get("fonte") || "");

  if (!programa_id || !nome || !fonte) {
    return { error: "Preencha o nome e a fonte da rubrica." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("programa_rubricas").insert({ programa_id, nome, fonte });

  if (error) return { error: "Não foi possível salvar a rubrica." };

  revalidatePath(`/fomento/${programa_id}/orcamento`);
  return { error: null, success: true };
}

export async function excluirRubrica(id: string, programaId: string) {
  const supabase = await createClient();
  await supabase.from("programa_rubricas").delete().eq("id", id);
  revalidatePath(`/fomento/${programaId}/orcamento`);
}

export async function criarLinhaPrevista(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const programa_id = String(formData.get("programa_id") || "");
  const rubrica_id = String(formData.get("rubrica_id") || "") || null;
  const plano_contas_id = String(formData.get("plano_contas_id") || "") || null;
  const atividade = String(formData.get("atividade") || "").trim();
  const mesInicio = String(formData.get("data_inicio") || "");
  const mesFim = String(formData.get("data_fim") || "");
  const valor = Number(formData.get("valor") || 0);
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!programa_id || !atividade || !mesInicio || !mesFim || !plano_contas_id || !valor) {
    return { error: "Preencha atividade, início, fim, conta do plano de contas e valor." };
  }
  if (mesFim < mesInicio) {
    return { error: "O mês fim precisa ser depois (ou igual) do mês início." };
  }
  const data_inicio = `${mesInicio}-01`;
  const data_fim = `${mesFim}-01`;

  const supabase = await createClient();

  // tipo_custo fica como cópia legível da conta, no momento do lançamento — se a conta for
  // renomeada depois, esse texto continua contando a história de quando foi previsto.
  const { data: conta } = await supabase.from("plano_contas").select("codigo, conta").eq("id", plano_contas_id).single();
  const tipo_custo = conta ? `${conta.codigo} — ${conta.conta}` : "Conta não encontrada";

  const { error } = await supabase.from("programa_linhas_previstas").insert({
    programa_id,
    rubrica_id,
    plano_contas_id,
    atividade,
    data_inicio,
    data_fim,
    tipo_custo,
    valor,
    observacoes,
  });

  if (error) return { error: "Não foi possível salvar a linha." };

  revalidatePath(`/fomento/${programa_id}/orcamento`);
  return { error: null, success: true };
}

export async function excluirLinhaPrevista(id: string, programaId: string) {
  const supabase = await createClient();
  await supabase.from("programa_linhas_previstas").delete().eq("id", id);
  revalidatePath(`/fomento/${programaId}/orcamento`);
}
