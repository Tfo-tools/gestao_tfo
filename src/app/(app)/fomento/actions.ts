"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

export async function criarPrograma(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const nome = String(formData.get("nome") || "").trim();
  const tipo = String(formData.get("tipo") || "");
  const valor_total = Number(formData.get("valor_total") || 0);
  const valor_subvencao = formData.get("valor_subvencao") ? Number(formData.get("valor_subvencao")) : 0;
  const valor_contrapartida = formData.get("valor_contrapartida") ? Number(formData.get("valor_contrapartida")) : 0;
  const data_assinatura_prevista = String(formData.get("data_assinatura_prevista") || "") || null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!nome || !tipo || !valor_total) {
    return { error: "Preencha nome, tipo e valor total." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("programas_investimento").insert({
    nome,
    tipo,
    valor_total,
    valor_subvencao,
    valor_contrapartida,
    data_assinatura_prevista,
    observacoes,
    status: "em_negociacao",
  });

  if (error) return { error: "Não foi possível criar o programa." };

  revalidatePath("/fomento");
  return { error: null, success: true };
}

export async function atualizarStatusPrograma(id: string, status: string) {
  const supabase = await createClient();
  await supabase.from("programas_investimento").update({ status }).eq("id", id);
  revalidatePath("/fomento");
}

export async function excluirPrograma(id: string) {
  const supabase = await createClient();
  await supabase.from("programas_investimento").delete().eq("id", id);
  revalidatePath("/fomento");
}

export async function criarParcela(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const programa_id = String(formData.get("programa_id") || "");
  const numero_parcela = Number(formData.get("numero_parcela") || 1);
  const valor = Number(formData.get("valor") || 0);
  const percentual = formData.get("percentual") ? Number(formData.get("percentual")) : null;
  const data_prevista = String(formData.get("data_prevista") || "") || null;
  const condicao = String(formData.get("condicao") || "").trim() || null;

  if (!programa_id || !valor) {
    return { error: "Preencha o valor da parcela." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("parcelas_investimento").insert({
    programa_id,
    numero_parcela,
    valor,
    percentual,
    data_prevista,
    condicao,
    status: "prevista",
  });

  if (error) return { error: "Não foi possível salvar a parcela." };

  revalidatePath("/fomento");
  return { error: null, success: true };
}

export async function excluirParcela(id: string) {
  const supabase = await createClient();
  await supabase.from("parcelas_investimento").delete().eq("id", id);
  revalidatePath("/fomento");
}

export async function alternarVinculoCenario(programaId: string, cenarioId: string, vincular: boolean) {
  const supabase = await createClient();
  if (vincular) {
    await supabase.from("cenario_programas").insert({ cenario_id: cenarioId, programa_id: programaId });
  } else {
    await supabase
      .from("cenario_programas")
      .delete()
      .eq("cenario_id", cenarioId)
      .eq("programa_id", programaId);
  }
  revalidatePath("/fomento");
}
