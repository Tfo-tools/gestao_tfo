"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EquipeFormState = { error: string | null; success?: boolean };

type AlocacaoInput = { categoria: string; produtoId: string | null; horasPorDia: number };

function parseAlocacoes(raw: string): AlocacaoInput[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a) => a && typeof a.categoria === "string" && Number(a.horasPorDia) > 0)
      .map((a) => ({ categoria: a.categoria, produtoId: a.produtoId || null, horasPorDia: Number(a.horasPorDia) }));
  } catch {
    return [];
  }
}

async function salvarAlocacoes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  equipeId: string,
  alocacoes: AlocacaoInput[],
) {
  await supabase.from("equipe_realizado_alocacoes").delete().eq("equipe_id", equipeId);
  if (alocacoes.length === 0) return;
  await supabase.from("equipe_realizado_alocacoes").insert(
    alocacoes.map((a) => ({
      equipe_id: equipeId,
      categoria: a.categoria,
      produto_id: a.produtoId,
      horas_por_dia: a.horasPorDia,
    })),
  );
}

export async function criarMembroEquipe(_prevState: EquipeFormState, formData: FormData): Promise<EquipeFormState> {
  const supabase = await createClient();

  const tipo_contratacao = String(formData.get("tipo_contratacao") || "");
  const nome = String(formData.get("nome") || "").trim();
  const data_inicio = String(formData.get("data_inicio") || "");
  const data_fim = String(formData.get("data_fim") || "") || null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;
  const alocacoes = parseAlocacoes(String(formData.get("alocacoes") || "[]"));

  if (!nome || !data_inicio || (tipo_contratacao !== "clt" && tipo_contratacao !== "pj")) {
    return { error: "Preencha nome, tipo e data de início." };
  }
  if (alocacoes.length === 0) {
    return { error: "Adicione pelo menos uma alocação (P&D, Suporte, Vendas, Adm…)." };
  }

  let salario_bruto: number | null = null;
  let regime_id: string | null = null;
  let beneficios_mensal = 0;
  let valor_hora: number | null = null;

  if (tipo_contratacao === "clt") {
    salario_bruto = Number(formData.get("salario_bruto") || 0);
    regime_id = String(formData.get("regime_id") || "") || null;
    beneficios_mensal = Number(formData.get("beneficios_mensal") || 0);
    if (!salario_bruto || !regime_id) return { error: "Preencha salário bruto e regime tributário." };
  } else {
    valor_hora = Number(formData.get("valor_hora") || 0);
    if (!valor_hora) return { error: "Preencha o valor da hora." };
  }

  const { data: membro, error } = await supabase
    .from("equipe_realizado")
    .insert({
      nome,
      tipo_contratacao,
      data_inicio,
      data_fim,
      salario_bruto,
      regime_id,
      beneficios_mensal,
      valor_hora,
      observacoes,
    })
    .select("id")
    .single();

  if (error || !membro) return { error: "Não foi possível salvar." };

  await salvarAlocacoes(supabase, membro.id, alocacoes);

  revalidatePath("/contratacoes/realizado");
  return { error: null, success: true };
}

export async function atualizarMembroEquipe(_prevState: EquipeFormState, formData: FormData): Promise<EquipeFormState> {
  const supabase = await createClient();

  const id = String(formData.get("id") || "");
  const nome = String(formData.get("nome") || "").trim();
  const data_inicio = String(formData.get("data_inicio") || "");
  const data_fim = String(formData.get("data_fim") || "") || null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;
  const alocacoes = parseAlocacoes(String(formData.get("alocacoes") || "[]"));
  const tipo_contratacao = String(formData.get("tipo_contratacao") || "");

  if (!id || !nome || !data_inicio) return { error: "Preencha nome e data de início." };

  const patch: Record<string, unknown> = { nome, data_inicio, data_fim, observacoes, updated_at: new Date().toISOString() };

  if (tipo_contratacao === "clt") {
    patch.salario_bruto = Number(formData.get("salario_bruto") || 0);
    patch.regime_id = String(formData.get("regime_id") || "") || null;
    patch.beneficios_mensal = Number(formData.get("beneficios_mensal") || 0);
  } else if (tipo_contratacao === "pj") {
    patch.valor_hora = Number(formData.get("valor_hora") || 0);
  }

  const { error } = await supabase.from("equipe_realizado").update(patch).eq("id", id);
  if (error) return { error: "Não foi possível salvar a alteração." };

  await salvarAlocacoes(supabase, id, alocacoes);

  revalidatePath("/contratacoes/realizado");
  return { error: null, success: true };
}

export async function desligarMembroEquipe(id: string, dataFim: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("equipe_realizado").update({ ativo: false, data_fim: dataFim }).eq("id", id);
  if (error) return { error: "Não foi possível registrar o desligamento." };
  revalidatePath("/contratacoes/realizado");
  return { error: null };
}

export async function reativarMembroEquipe(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("equipe_realizado").update({ ativo: true, data_fim: null }).eq("id", id);
  if (error) return { error: "Não foi possível reativar." };
  revalidatePath("/contratacoes/realizado");
  return { error: null };
}

export async function excluirMembroEquipe(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("equipe_realizado").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/contratacoes/realizado");
  return { error: null };
}
