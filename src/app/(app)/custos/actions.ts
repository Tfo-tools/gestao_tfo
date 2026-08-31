"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DespesaFormState = { error: string | null; success?: boolean };

export async function criarDespesa(
  _prevState: DespesaFormState,
  formData: FormData,
): Promise<DespesaFormState> {
  const supabase = await createClient();

  const data_gasto = String(formData.get("data_gasto") || "");
  const plano_contas_id = String(formData.get("plano_contas_id") || "");
  const produto_id = String(formData.get("produto_id") || "") || null;
  const valor_total = Number(formData.get("valor_total") || 0);
  const descricao = String(formData.get("descricao") || "") || null;
  const comprovado = formData.get("comprovado") === "on";
  const file = formData.get("comprovante") as File | null;

  if (!data_gasto || !plano_contas_id || !valor_total) {
    return { error: "Preencha data, categoria e valor." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: despesa, error } = await supabase
    .from("despesas")
    .insert({
      data_gasto,
      plano_contas_id,
      produto_id,
      valor_total,
      descricao,
      comprovado,
      criado_por: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !despesa) {
    return { error: "Não foi possível salvar a despesa." };
  }

  if (file && file.size > 0) {
    const path = `${despesa.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("comprovantes")
      .upload(path, file, { contentType: file.type });

    if (!uploadError) {
      await supabase.from("anexos_despesa").insert({
        despesa_id: despesa.id,
        nome_arquivo: file.name,
        caminho_arquivo: path,
        tipo_mime: file.type,
        tamanho_bytes: file.size,
      });
    }
  }

  revalidatePath("/custos");
  revalidatePath("/custos/extrato");
  revalidatePath("/");
  return { error: null, success: true };
}

export async function getSignedUrl(path: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("comprovantes")
    .createSignedUrl(path, 60 * 5);

  if (error) return null;
  return data.signedUrl;
}
