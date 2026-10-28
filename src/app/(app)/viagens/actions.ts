"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerDocumentoViagem, leituraViagemConfigurada, type ItemViagemExtraido, type TipoItemViagem } from "@/lib/viagens-ia";

export type ViagemFormState = { error: string | null; id?: string };

const data = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export async function criarViagem(_prev: ViagemFormState, formData: FormData): Promise<ViagemFormState> {
  const titulo = String(formData.get("titulo") || "").trim();
  if (!titulo) return { error: "Dê um nome para a viagem." };
  const destino = String(formData.get("destino") || "").trim() || null;
  const data_inicio = data(formData.get("data_inicio"));
  const data_fim = data(formData.get("data_fim"));
  const observacoes = String(formData.get("observacoes") || "").trim() || null;
  const participantes = formData.getAll("participantes").map((p) => String(p)).filter(Boolean);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: viagem, error } = await supabase
    .from("viagens")
    .insert({ titulo, destino, data_inicio, data_fim, observacoes, criado_por: user?.id ?? null })
    .select("id")
    .single();
  if (error || !viagem) return { error: "Não consegui criar a viagem." };

  const ids = new Set(participantes);
  if (user?.id) ids.add(user.id); // quem cria entra como participante
  if (ids.size > 0) {
    await supabase.from("viagem_participantes").insert([...ids].map((profile_id) => ({ viagem_id: viagem.id, profile_id })));
  }
  revalidatePath("/viagens");
  return { error: null, id: viagem.id };
}

export async function excluirViagem(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("viagens").delete().eq("id", id);
  if (error) return { error: "Não consegui excluir a viagem." };
  revalidatePath("/viagens");
  return { error: null };
}

export type ItemInput = {
  id?: string;
  viagemId: string;
  tipo: TipoItemViagem;
  titulo: string;
  fornecedor?: string | null;
  inicio?: string | null;
  fim?: string | null;
  origem?: string | null;
  destino?: string | null;
  local?: string | null;
  localizador?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
  valor?: number | null;
};

export async function salvarItem(input: ItemInput): Promise<{ error: string | null; id?: string }> {
  const supabase = await createClient();
  if (!input.titulo?.trim()) return { error: "O item precisa de um título." };
  const ts = (v?: string | null) => {
    const s = String(v ?? "").trim();
    return s ? new Date(s).toISOString() : null;
  };
  const campos = {
    viagem_id: input.viagemId,
    tipo: input.tipo ?? "outro",
    titulo: input.titulo.trim(),
    fornecedor: input.fornecedor?.trim() || null,
    inicio: ts(input.inicio),
    fim: ts(input.fim),
    origem: input.origem?.trim() || null,
    destino: input.destino?.trim() || null,
    local: input.local?.trim() || null,
    localizador: input.localizador?.trim() || null,
    endereco: input.endereco?.trim() || null,
    detalhes: { observacoes: input.observacoes?.trim() || null, valor: typeof input.valor === "number" ? input.valor : null },
  };
  if (input.id) {
    const { error } = await supabase.from("viagem_itens").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", input.id);
    if (error) return { error: "Não consegui salvar o item." };
    revalidatePath(`/viagens/${input.viagemId}`);
    return { error: null, id: input.id };
  }
  const { data: novo, error } = await supabase.from("viagem_itens").insert(campos).select("id").single();
  if (error || !novo) return { error: "Não consegui salvar o item." };
  revalidatePath(`/viagens/${input.viagemId}`);
  return { error: null, id: novo.id };
}

export async function excluirItem(id: string, viagemId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("viagem_itens").delete().eq("id", id);
  if (error) return { error: "Não consegui excluir o item." };
  revalidatePath(`/viagens/${viagemId}`);
  return { error: null };
}

/** Reserva o caminho no Storage e devolve o token do upload assinado (o navegador manda os bytes). */
export async function iniciarUploadEticket(viagemId: string, nomeArquivo: string): Promise<{ error: string | null; caminho?: string; token?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };
  const ext = (nomeArquivo.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "pdf";
  const caminho = `viagens/${viagemId}/${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from("comprovantes").createSignedUploadUrl(caminho);
  if (error || !data) return { error: "Não consegui preparar o envio do e-ticket." };
  return { error: null, caminho: data.path, token: data.token };
}

/** Lê o e-ticket (já no Storage) com IA e devolve os campos pra preencher o item. */
export async function lerEticket(caminho: string, mime: string): Promise<{ error: string | null; item: ItemViagemExtraido | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada.", item: null };
  if (!leituraViagemConfigurada()) return { error: "Leitura por IA indisponível (falta a chave do Gemini).", item: null };
  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from("comprovantes").download(caminho);
  if (error || !blob) return { error: "Não achei o e-ticket enviado.", item: null };
  const bytes = await blob.arrayBuffer();
  return lerDocumentoViagem(bytes, mime || blob.type || "application/pdf");
}

/** Registra o e-ticket (já enviado) ligado à viagem e, se houver, ao item. */
export async function registrarAnexo(
  viagemId: string,
  itemId: string | null,
  caminho: string,
  nome: string,
  mime: string,
  tamanho: number,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("viagem_anexos").insert({
    viagem_id: viagemId,
    item_id: itemId,
    nome_arquivo: nome,
    caminho_arquivo: caminho,
    tipo_mime: mime || null,
    tamanho_bytes: tamanho || null,
    enviado_por: user?.id ?? null,
  });
  if (error) return { error: "Não consegui registrar o e-ticket." };
  revalidatePath(`/viagens/${viagemId}`);
  return { error: null };
}

/** Link temporário pra abrir/baixar o e-ticket. */
export async function urlAnexo(caminho: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from("comprovantes").createSignedUrl(caminho, 60 * 30);
  return data?.signedUrl ?? null;
}

export async function excluirAnexo(id: string, caminho: string, viagemId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("viagem_anexos").delete().eq("id", id);
  if (error) return { error: "Não consegui excluir o e-ticket." };
  await createAdminClient().storage.from("comprovantes").remove([caminho]);
  revalidatePath(`/viagens/${viagemId}`);
  return { error: null };
}
