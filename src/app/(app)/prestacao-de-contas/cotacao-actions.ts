"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomeArquivoSeguro } from "@/lib/nome-arquivo-seguro";

const BUCKET = "comprovantes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exigirEquipe(supabase: any): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Sessão expirada.";
  const { data: perfil } = await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle();
  const papel = perfil?.papel ?? "socia";
  if (papel !== "socia" && papel !== "equipe") return "Sem permissão.";
  return null;
}

/** Anexa um orçamento/cotação (proposta de fornecedor) no nível do serviço (rúbrica). */
export async function anexarCotacao(formData: FormData): Promise<{ error: string | null }> {
  const programaId = String(formData.get("programaId") || "");
  const rubricaId = String(formData.get("rubricaId") || "");
  const file = formData.get("arquivo") as File | null;
  if (!programaId || !rubricaId) return { error: "Rúbrica não informada." };
  if (!file || file.size === 0) return { error: "Anexe o arquivo da cotação." };
  if (file.size > 25 * 1024 * 1024) return { error: "Arquivo acima de 25 MB." };

  const supabase = await createClient();
  const erro = await exigirEquipe(supabase);
  if (erro) return { error: erro };

  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  const nome = nomeArquivoSeguro(file.name || "cotacao");
  const caminho = `cotacoes/${rubricaId}/${Date.now()}-${nome}`;
  const { error: upErro } = await admin.storage.from(BUCKET).upload(caminho, file, { contentType: file.type || "application/octet-stream" });
  if (upErro) return { error: "Não consegui subir a cotação." };

  const { error } = await admin.from("programa_rubrica_anexos").insert({
    programa_id: programaId, rubrica_id: rubricaId, tipo: "cotacao",
    caminho, nome, mime: file.type || null, criado_por: user?.id ?? null,
  });
  if (error) { await admin.storage.from(BUCKET).remove([caminho]); return { error: "Subi o arquivo mas não consegui registrar a cotação." }; }
  revalidatePath("/prestacao-de-contas");
  return { error: null };
}

export async function removerCotacao(anexoId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const erro = await exigirEquipe(supabase);
  if (erro) return { error: erro };
  const admin = createAdminClient();
  const { data: a } = await admin.from("programa_rubrica_anexos").select("caminho").eq("id", anexoId).maybeSingle();
  if (a?.caminho) await admin.storage.from(BUCKET).remove([a.caminho]);
  await admin.from("programa_rubrica_anexos").delete().eq("id", anexoId);
  revalidatePath("/prestacao-de-contas");
  return { error: null };
}

export async function urlCotacao(anexoId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: a } = await admin.from("programa_rubrica_anexos").select("caminho").eq("id", anexoId).maybeSingle();
  if (!a?.caminho) return null;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(a.caminho, 60 * 10);
  return error ? null : data.signedUrl;
}

export type CotacaoAnexo = { id: string; nome: string | null };

/** Cotações por rúbrica de um programa (para a aba Orçamento). Leitura via serviço (RLS fechada). */
export async function carregarCotacoesPorRubrica(programaId: string): Promise<Record<string, CotacaoAnexo[]>> {
  const admin = createAdminClient();
  const { data } = await admin.from("programa_rubrica_anexos").select("id, rubrica_id, nome").eq("programa_id", programaId);
  const out: Record<string, CotacaoAnexo[]> = {};
  for (const a of (data ?? []) as { id: string; rubrica_id: string; nome: string | null }[]) {
    (out[a.rubrica_id] ??= []).push({ id: a.id, nome: a.nome });
  }
  return out;
}
