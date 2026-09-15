"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function alternarRecorrente(id: string, ativo: boolean) {
  const supabase = await createClient();
  await supabase.from("despesas_recorrentes").update({ ativo, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/custos/recorrentes");
}

/** Só pra recorrência criada errada (cadastro duplicado, valor trocado etc). Se algum mês dela já
 * virou despesa lançada, o banco recusa a exclusão (a recorrência é referência daquele lançamento
 * real) — nesse caso, pausar é o caminho, não excluir. */
export async function excluirRecorrente(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("despesas_recorrentes").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return { error: "Essa recorrência já gerou despesas lançadas — não dá pra excluir sem apagar histórico real. Pause em vez de excluir." };
    }
    return { error: "Não foi possível excluir." };
  }
  revalidatePath("/custos/recorrentes");
  return { error: null };
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

  // Só marca comprovado quando os DOIS tipos existem (o que já tinha + o que acabou de subir) —
  // anexar só a fatura não prova o pagamento ainda, e marcar comprovado cedo demais tirava o
  // lançamento desta lista antes da hora, parecendo que o anexo "não tinha efeito".
  const { data: anexosAtuais } = await supabase.from("anexos_despesa").select("tipo").eq("despesa_id", despesaId);
  const tipos = new Set((anexosAtuais ?? []).map((a: { tipo: string }) => a.tipo));
  const atualizacao: { comprovado?: boolean; pagador?: string | null } = {};
  if (tipos.has("fatura") && tipos.has("comprovante_pagamento")) atualizacao.comprovado = true;
  if (pagador) atualizacao.pagador = pagador;
  if (Object.keys(atualizacao).length > 0) await supabase.from("despesas").update(atualizacao).eq("id", despesaId);

  revalidatePath("/custos/recorrentes");
  revalidatePath("/custos/extrato");
  revalidatePath("/custos");
  return { error: null, success: true };
}
