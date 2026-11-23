"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomeArquivoSeguro } from "@/lib/nome-arquivo-seguro";

const BUCKET = "comprovantes";

/** Amarra (ou desamarra) uma despesa a uma rubrica do programa — é o que faz ela aparecer na célula. */
export async function atribuirRubrica(despesaId: string, rubricaId: string | null): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("despesas").update({ rubrica_id: rubricaId }).eq("id", despesaId);
  if (error) return { error: "Não consegui classificar a despesa." };
  revalidatePath("/prestacao-de-contas");
  return { error: null };
}

/** Anexa uma evidência (nota, cotação, comprovante, RPA…) a uma despesa, com o tipo da evidência. */
export async function anexarEvidencia(formData: FormData): Promise<{ error: string | null }> {
  const despesaId = String(formData.get("despesaId") || "");
  const tipo = String(formData.get("tipo") || "");
  const file = formData.get("arquivo") as File | null;
  if (!despesaId || !tipo) return { error: "Falta a despesa ou o tipo da evidência." };
  if (!file || file.size === 0) return { error: "Nenhum arquivo." };
  if (file.size > 25 * 1024 * 1024) return { error: "Arquivo acima de 25 MB." };

  const supabase = await createClient();
  const admin = createAdminClient();
  const nome = nomeArquivoSeguro(file.name || "evidencia");
  const caminho = `${despesaId}/${Date.now()}-${nome}`;
  const { error: upErro } = await admin.storage.from(BUCKET).upload(caminho, file, { contentType: file.type || "application/octet-stream" });
  if (upErro) return { error: "Não consegui subir o arquivo." };

  const { error: insErro } = await supabase.from("anexos_despesa").insert({
    despesa_id: despesaId,
    nome_arquivo: nome,
    caminho_arquivo: caminho,
    tipo_mime: file.type || null,
    tamanho_bytes: file.size,
    tipo,
  });
  if (insErro) {
    await admin.storage.from(BUCKET).remove([caminho]);
    return { error: "Subi o arquivo mas não consegui registrar o anexo." };
  }
  revalidatePath("/prestacao-de-contas");
  return { error: null };
}

/** Remove uma evidência (apaga o arquivo e o registro). */
export async function removerEvidencia(anexoId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: anexo } = await supabase.from("anexos_despesa").select("caminho_arquivo").eq("id", anexoId).maybeSingle();
  if (anexo?.caminho_arquivo) await admin.storage.from(BUCKET).remove([anexo.caminho_arquivo]);
  await supabase.from("anexos_despesa").delete().eq("id", anexoId);
  revalidatePath("/prestacao-de-contas");
  return { error: null };
}

/** Link temporário pra ver uma evidência anexada. */
export async function urlAnexo(anexoId: string): Promise<string | null> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: anexo } = await supabase.from("anexos_despesa").select("caminho_arquivo").eq("id", anexoId).maybeSingle();
  if (!anexo?.caminho_arquivo) return null;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(anexo.caminho_arquivo, 60 * 10);
  return error ? null : data.signedUrl;
}
