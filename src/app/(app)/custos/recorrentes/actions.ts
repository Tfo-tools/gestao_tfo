"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function alternarRecorrente(id: string, ativo: boolean) {
  const supabase = await createClient();
  await supabase.from("despesas_recorrentes").update({ ativo, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/custos/recorrentes");
}

export type AnexoFormState = { error: string | null; success?: boolean };

async function anexarArquivo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  despesaId: string,
  file: File | null,
  tipo: "fatura" | "comprovante_pagamento",
) {
  if (!file || file.size === 0) return false;
  const path = `${despesaId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("comprovantes").upload(path, file, { contentType: file.type });
  if (uploadError) return false;
  await supabase.from("anexos_despesa").insert({
    despesa_id: despesaId,
    nome_arquivo: file.name,
    caminho_arquivo: path,
    tipo_mime: file.type,
    tamanho_bytes: file.size,
    tipo,
  });
  return true;
}

export async function anexarComprovantePendente(_prevState: AnexoFormState, formData: FormData): Promise<AnexoFormState> {
  const supabase = await createClient();

  const despesaId = String(formData.get("despesa_id") || "");
  const pagador = String(formData.get("pagador") || "").trim() || null;
  const fatura = formData.get("fatura") as File | null;
  const comprovantePagamento = formData.get("comprovante_pagamento") as File | null;

  if (!despesaId || (!fatura?.size && !comprovantePagamento?.size)) {
    return { error: "Selecione ao menos um arquivo (foto, PDF, JPG ou PNG)." };
  }

  const enviouFatura = await anexarArquivo(supabase, despesaId, fatura, "fatura");
  const enviouComprovante = await anexarArquivo(supabase, despesaId, comprovantePagamento, "comprovante_pagamento");

  if (!enviouFatura && !enviouComprovante) return { error: "Não foi possível enviar o(s) arquivo(s)." };

  const atualizacao: { comprovado: boolean; pagador?: string | null } = { comprovado: true };
  if (pagador) atualizacao.pagador = pagador;
  await supabase.from("despesas").update(atualizacao).eq("id", despesaId);

  revalidatePath("/custos/recorrentes");
  revalidatePath("/custos/extrato");
  revalidatePath("/custos");
  return { error: null, success: true };
}
