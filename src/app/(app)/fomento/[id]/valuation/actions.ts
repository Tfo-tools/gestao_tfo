"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calcularBerkus, PILARES_BERKUS, type GrauPilar, type RespostasBerkus } from "@/lib/valuation-berkus";

export type EstimativaFormState = { error: string | null; success?: boolean };

export async function salvarEstimativaValuation(
  _prevState: EstimativaFormState,
  formData: FormData,
): Promise<EstimativaFormState> {
  const supabase = await createClient();

  const programa_id = String(formData.get("programa_id") || "");
  const valor_final = Number(formData.get("valor_final") || 0);
  const decisao = String(formData.get("decisao") || "");
  const observacoes = String(formData.get("observacoes") || "").trim() || null;
  const data_aporte = String(formData.get("data_aporte") || "") || null;

  if (!programa_id || !valor_final || (decisao !== "acatado" && decisao !== "alterado")) {
    return { error: "Preencha o questionário e confirme o valor final." };
  }

  const respostas: RespostasBerkus = {};
  for (const p of PILARES_BERKUS) {
    const grau = String(formData.get(`grau_${p.chave}`) || "nenhum") as GrauPilar;
    const observacao = String(formData.get(`obs_${p.chave}`) || "").trim();
    respostas[p.chave] = { grau, observacao };
  }
  const { valorSugerido } = calcularBerkus(respostas);

  const { data: programa } = await supabase.from("programas_investimento").select("valor_total").eq("id", programa_id).single();
  if (!programa) return { error: "Programa não encontrado." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: erroEstimativa } = await supabase.from("valuation_estimativas").insert({
    programa_id,
    metodo: "berkus",
    respostas,
    valor_sugerido: valorSugerido,
    valor_final,
    decisao,
    observacoes,
    criado_por: user?.id ?? null,
  });
  if (erroEstimativa) return { error: "Não foi possível salvar a estimativa." };

  const valuation_post_money = valor_final + Number(programa.valor_total);
  const { error: erroPrograma } = await supabase
    .from("programas_investimento")
    .update({ valuation_pre_money: valor_final, valuation_post_money, data_aporte })
    .eq("id", programa_id);
  if (erroPrograma) return { error: "Estimativa salva, mas não foi possível atualizar o valuation do programa." };

  revalidatePath("/fomento");
  revalidatePath(`/fomento/${programa_id}/valuation`);
  revalidatePath("/relatorios");
  return { error: null, success: true };
}
