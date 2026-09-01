"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TipoModelo } from "@/lib/modelos-contratacao";

export type ActionState = { error: string | null; success?: boolean };

function num(formData: FormData, name: string): number | undefined {
  const v = formData.get(name);
  return v !== null && v !== "" ? Number(v) : undefined;
}
function pct(formData: FormData, name: string): number | undefined {
  const v = formData.get(name);
  return v !== null && v !== "" ? Number(v) / 100 : undefined;
}

function montarParametros(formData: FormData, tipo_modelo: TipoModelo): Record<string, unknown> {
  const parametros: Record<string, unknown> = {};
  if (tipo_modelo === "clt") {
    parametros.capacidade_unidade_mes = num(formData, "capacidade_unidade_mes");
    parametros.horas_semanais = num(formData, "horas_semanais");
    parametros.salario_bruto = num(formData, "salario_bruto");
    parametros.aliquota_encargos = pct(formData, "aliquota_encargos");
    parametros.custo_estrutura_mensal = num(formData, "custo_estrutura_mensal") ?? 0;
  } else if (tipo_modelo === "pj" || tipo_modelo === "empresa_fixo_escopo") {
    parametros.capacidade_unidade_mes = num(formData, "capacidade_unidade_mes");
    parametros.valor_mensal = num(formData, "valor_mensal");
    if (tipo_modelo === "pj") parametros.custo_estrutura_mensal = num(formData, "custo_estrutura_mensal") ?? 0;
    if (tipo_modelo === "empresa_fixo_escopo") parametros.canal = String(formData.get("canal") || "multicanal");
  } else if (tipo_modelo === "empresa_hibrido") {
    parametros.valor_fixo_mensal = num(formData, "valor_fixo_mensal");
    parametros.valor_por_unidade_convertida = num(formData, "valor_por_unidade_convertida");
  } else if (tipo_modelo === "empresa_creditos") {
    parametros.valor_por_credito = num(formData, "valor_por_credito");
    parametros.creditos_por_unidade = num(formData, "creditos_por_unidade") ?? 1;
  }
  return parametros;
}

export async function criarModeloContratacao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const cargo = String(formData.get("cargo") || "").trim();
  const tipo_modelo = String(formData.get("tipo_modelo") || "") as TipoModelo;
  const nome = String(formData.get("nome") || "").trim();
  const categoria = String(formData.get("categoria") || "sm");
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!cargo || !tipo_modelo || !nome) {
    return { error: "Preencha cargo, tipo de modelo e nome." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("modelos_contratacao").insert({
    cargo,
    tipo_modelo,
    nome,
    categoria,
    parametros: montarParametros(formData, tipo_modelo),
    observacoes,
  });

  if (error) {
    return { error: "Não foi possível salvar o modelo." };
  }

  revalidatePath("/contratacoes/modelos");
  revalidatePath("/contratacoes/necessidade");
  return { error: null, success: true };
}

export async function atualizarModeloContratacao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const cargo = String(formData.get("cargo") || "").trim();
  const tipo_modelo = String(formData.get("tipo_modelo") || "") as TipoModelo;
  const nome = String(formData.get("nome") || "").trim();
  const categoria = String(formData.get("categoria") || "sm");
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!id || !cargo || !tipo_modelo || !nome) {
    return { error: "Preencha cargo, tipo de modelo e nome." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("modelos_contratacao")
    .update({ cargo, tipo_modelo, nome, categoria, parametros: montarParametros(formData, tipo_modelo), observacoes })
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível salvar o modelo." };
  }

  revalidatePath("/contratacoes/modelos");
  revalidatePath("/contratacoes/necessidade");
  return { error: null, success: true };
}

export async function excluirModeloContratacao(id: string) {
  const supabase = await createClient();
  await supabase.from("modelos_contratacao").delete().eq("id", id);
  revalidatePath("/contratacoes/modelos");
  revalidatePath("/contratacoes/necessidade");
}
