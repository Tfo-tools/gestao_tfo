"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomeArquivoSeguro } from "@/lib/nome-arquivo-seguro";

const BUCKET = "comprovantes";

/** Só sócia/equipe mexem na execução. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exigirEquipe(supabase: any): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Sessão expirada.";
  const { data: perfil } = await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle();
  const papel = perfil?.papel ?? "socia";
  if (papel !== "socia" && papel !== "equipe") return "Sem permissão para registrar entregas.";
  return null;
}

/**
 * Marca uma entrega como feita (fato gerador do pagamento): anexa a evidência e informa a DATA REAL
 * da entrega — que pode cair antes ou depois do mês previsto. O slot é (atividade, rúbrica, mês
 * previsto): o marcador fica verde e vai pro mês real. Vários no mesmo mês são permitidos.
 */
export async function marcarEntrega(formData: FormData): Promise<{ error: string | null }> {
  const programaId = String(formData.get("programaId") || "");
  const atividadeId = String(formData.get("atividadeId") || "");
  const rubricaId = String(formData.get("rubricaId") || "");
  const mesPrevisto = String(formData.get("mesPrevisto") || ""); // YYYY-MM
  const dataReal = String(formData.get("dataReal") || ""); // YYYY-MM-DD
  const valorRaw = String(formData.get("valor") || "").replace(/\./g, "").replace(",", ".");
  const valor = valorRaw ? Number(valorRaw) : null;
  const file = formData.get("arquivo") as File | null;
  if (!programaId || !atividadeId || !rubricaId || !/^\d{4}-\d{2}$/.test(mesPrevisto)) return { error: "Dados da entrega incompletos." };
  if (!dataReal) return { error: "Informe a data real da entrega." };
  if (valor !== null && (Number.isNaN(valor) || valor < 0)) return { error: "Valor inválido." };
  if (!file || file.size === 0) return { error: "Anexe a evidência da entrega." };
  if (file.size > 25 * 1024 * 1024) return { error: "Arquivo acima de 25 MB." };

  const supabase = await createClient();
  const erro = await exigirEquipe(supabase);
  if (erro) return { error: erro };

  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  const nome = nomeArquivoSeguro(file.name || "evidencia");
  const caminho = `entregas/${atividadeId}/${rubricaId}/${Date.now()}-${nome}`;
  const { error: upErro } = await admin.storage.from(BUCKET).upload(caminho, file, { contentType: file.type || "application/octet-stream" });
  if (upErro) return { error: "Não consegui subir a evidência." };

  const { error } = await admin.from("entregas").insert({
    programa_id: programaId,
    atividade_id: atividadeId,
    rubrica_id: rubricaId,
    mes_previsto: mesPrevisto,
    mes_real: dataReal.slice(0, 7),
    valor,
    evidencia_caminho: caminho,
    evidencia_nome: nome,
    evidencia_mime: file.type || null,
    criado_por: user?.id ?? null,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([caminho]);
    return { error: "Subi a evidência mas não consegui registrar a entrega." };
  }
  revalidatePath("/prestacao-de-contas");
  return { error: null };
}

/** Desfaz uma entrega: apaga a evidência e o registro — o slot volta a "pendente" no mês previsto. */
export async function removerEntrega(entregaId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const erro = await exigirEquipe(supabase);
  if (erro) return { error: erro };
  const admin = createAdminClient();
  const { data: e } = await admin.from("entregas").select("evidencia_caminho").eq("id", entregaId).maybeSingle();
  if (e?.evidencia_caminho) await admin.storage.from(BUCKET).remove([e.evidencia_caminho]);
  await admin.from("entregas").delete().eq("id", entregaId);
  revalidatePath("/prestacao-de-contas");
  return { error: null };
}

/** Link temporário pra ver a evidência de uma entrega. */
export async function urlEvidenciaEntrega(entregaId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: e } = await admin.from("entregas").select("evidencia_caminho").eq("id", entregaId).maybeSingle();
  if (!e?.evidencia_caminho) return null;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(e.evidencia_caminho, 60 * 10);
  return error ? null : data.signedUrl;
}
