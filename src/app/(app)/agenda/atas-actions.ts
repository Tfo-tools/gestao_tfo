"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extrairAcoesDaAta, type AcaoSugerida } from "@/lib/anthropic";

export type ActionState = { error: string | null; success?: boolean };

/** Ata é um campo da própria reunião (interna, quando existe reuniao_id, ou de um compromisso do
 * Google, quando existe google_event_id) — no máximo uma por reunião, por isso é sempre "salvar",
 * nunca "criar mais uma": atualiza se já existir uma ata pra essa chave, senão insere. */
export async function salvarAta(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const titulo = String(formData.get("titulo") || "").trim();
  const data_reuniao = String(formData.get("data_reuniao") || "") || new Date().toISOString().slice(0, 10);
  const participantes = String(formData.get("participantes") || "").trim() || null;
  const conteudo = String(formData.get("conteudo") || "").trim();
  const reuniao_id = String(formData.get("reuniao_id") || "") || null;
  const google_event_id = String(formData.get("google_event_id") || "") || null;

  if (!conteudo) return { error: "Cole ou digite o conteúdo da ata." };
  if (!reuniao_id && !google_event_id) return { error: "Ata sem reunião vinculada." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const query = supabase.from("reuniao_atas").select("id");
  const { data: existente } = await (reuniao_id ? query.eq("reuniao_id", reuniao_id) : query.eq("google_event_id", google_event_id!)).maybeSingle();

  const dados = { titulo, data_reuniao, participantes, conteudo, reuniao_id, google_event_id };
  const { error } = existente
    ? await supabase.from("reuniao_atas").update({ ...dados, atualizado_em: new Date().toISOString() }).eq("id", existente.id)
    : await supabase.from("reuniao_atas").insert({ ...dados, criado_por: user?.id ?? null });
  if (error) return { error: "Não foi possível salvar a ata." };

  revalidatePath("/agenda");
  return { error: null, success: true };
}

export async function excluirAta(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("reuniao_atas").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/agenda");
  return { error: null };
}

/** Lê a ata salva e pede pra IA separar só os próximos passos — nada aqui vira tarefa sozinho,
 * só devolve a lista pra sócia revisar na tela antes de confirmar. */
export async function sugerirAcoesDaAta(ataId: string): Promise<{ error: string | null; acoes: AcaoSugerida[] }> {
  const supabase = await createClient();
  const { data: ata } = await supabase.from("reuniao_atas").select("conteudo").eq("id", ataId).single();
  if (!ata) return { error: "Ata não encontrada.", acoes: [] };

  const { data: pessoas } = await supabase.from("profiles").select("nome");
  return extrairAcoesDaAta(ata.conteudo, (pessoas ?? []).map((p) => p.nome));
}

export async function criarTarefasDaAta(
  ataId: string,
  itens: { titulo: string; responsavel_id: string | null; prazo: string | null }[],
): Promise<{ error: string | null; criadas: number }> {
  if (itens.length === 0) return { error: "Nenhuma tarefa selecionada.", criadas: 0 };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const linhas = itens.map((item) => ({
    titulo: item.titulo,
    responsavel_id: item.responsavel_id,
    prazo: item.prazo,
    origem_ata_id: ataId,
    criado_por: user?.id ?? null,
  }));

  const { error } = await supabase.from("tarefas").insert(linhas);
  if (error) return { error: "Não foi possível criar as tarefas.", criadas: 0 };

  revalidatePath("/tarefas");
  revalidatePath("/agenda");
  return { error: null, criadas: itens.length };
}
