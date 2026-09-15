"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nomeArquivoSeguro } from "@/lib/nome-arquivo-seguro";

export type DocumentoFormState = { error: string | null; success?: boolean };

/** Cria um novo slot de documento, com arquivo opcional já anexado. */
export async function adicionarDocumento(_prevState: DocumentoFormState, formData: FormData): Promise<DocumentoFormState> {
  const nome = String(formData.get("nome") || "").trim();
  if (!nome) return { error: "Dê um nome pro documento." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: doc, error } = await supabase.from("documentos_empresa").insert({ nome }).select("id").single();
  if (error || !doc) return { error: "Não foi possível criar." };

  const arquivo = formData.get("arquivo") as File | null;
  if (arquivo && arquivo.size > 0) {
    const r = await subirArquivo(supabase, doc.id, arquivo, user?.id ?? null);
    if (r.error) {
      revalidatePath("/documentos");
      return { error: `Documento criado, mas o arquivo não subiu: ${r.error}` };
    }
  }

  revalidatePath("/documentos");
  return { error: null, success: true };
}

async function subirArquivo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  id: string,
  arquivo: File,
  userId: string | null,
): Promise<{ error: string | null }> {
  const nome = nomeArquivoSeguro(arquivo.name);
  const path = `empresa/${id}/${Date.now()}-${nome}`;
  const { error: uploadError } = await supabase.storage.from("comprovantes").upload(path, arquivo, { contentType: arquivo.type });
  if (uploadError) return { error: "Não foi possível subir o arquivo." };
  await supabase
    .from("documentos_empresa")
    .update({
      caminho_arquivo: path,
      nome_arquivo: nome,
      tipo_mime: arquivo.type,
      tamanho_bytes: arquivo.size,
      atualizado_por: userId,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);
  return { error: null };
}

/** Substitui o arquivo de um documento já existente — apaga o anterior do storage, se houver. */
export async function substituirArquivo(id: string, arquivo: File): Promise<{ error: string | null }> {
  if (!arquivo || arquivo.size === 0) return { error: "Escolha um arquivo." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: atual } = await supabase.from("documentos_empresa").select("caminho_arquivo").eq("id", id).maybeSingle();
  if (atual?.caminho_arquivo) {
    await supabase.storage.from("comprovantes").remove([atual.caminho_arquivo]);
  }

  const r = await subirArquivo(supabase, id, arquivo, user?.id ?? null);
  if (r.error) return r;
  revalidatePath("/documentos");
  return { error: null };
}

export async function excluirDocumento(id: string, caminhoArquivo: string | null): Promise<{ error: string | null }> {
  const supabase = await createClient();
  if (caminhoArquivo) {
    await supabase.storage.from("comprovantes").remove([caminhoArquivo]);
  }
  const { error } = await supabase.from("documentos_empresa").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/documentos");
  return { error: null };
}

export async function getSignedUrlDocumento(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}
