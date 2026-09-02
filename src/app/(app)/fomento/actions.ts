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

export async function atualizarValuationPrograma(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("programa_id") || "");
  const valuation_pre_money = Number(formData.get("valuation_pre_money") || 0);
  const data_aporte = String(formData.get("data_aporte") || "") || null;

  if (!id || !valuation_pre_money) {
    return { error: "Informe o valuation pré-money." };
  }

  const supabase = await createClient();
  const { data: programa } = await supabase.from("programas_investimento").select("valor_total").eq("id", id).single();
  if (!programa) return { error: "Programa não encontrado." };

  const valuation_post_money = valuation_pre_money + Number(programa.valor_total);

  const { error } = await supabase
    .from("programas_investimento")
    .update({ valuation_pre_money, valuation_post_money, data_aporte })
    .eq("id", id);

  if (error) return { error: "Não foi possível salvar o valuation." };

  revalidatePath("/fomento");
  revalidatePath("/relatorios");
  return { error: null, success: true };
}

export async function criarReavaliacao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const programa_id = String(formData.get("programa_id") || "");
  const data_referencia = String(formData.get("data_referencia") || "");
  const novo_valuation = Number(formData.get("novo_valuation") || 0);
  const fator_diluicao = Number(formData.get("fator_diluicao") || 0) / 100;
  const tipo_evento = String(formData.get("tipo_evento") || "reavaliacao");
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!programa_id || !data_referencia || !novo_valuation) {
    return { error: "Preencha data e novo valuation." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reavaliacoes_valuation").insert({
    programa_id,
    data_referencia,
    novo_valuation,
    fator_diluicao,
    tipo_evento,
    observacoes,
  });

  if (error) return { error: "Não foi possível salvar a reavaliação." };

  revalidatePath("/fomento");
  revalidatePath("/relatorios");
  return { error: null, success: true };
}

export async function excluirReavaliacao(id: string) {
  const supabase = await createClient();
  await supabase.from("reavaliacoes_valuation").delete().eq("id", id);
  revalidatePath("/fomento");
  revalidatePath("/relatorios");
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
  revalidatePath("/relatorios");
}
