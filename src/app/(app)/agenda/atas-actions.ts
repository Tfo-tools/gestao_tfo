"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extrairAcoesDaAta, type AcaoSugerida } from "@/lib/ia";
import { buscarTranscricaoFathom, transcricaoParaTexto } from "@/lib/fathom";
import { importarEntrevistaParaForms, type SaidaImportacao } from "@/lib/clientex-importar";
import { notasPerfilParaTexto } from "@/lib/roteiro-perfil";

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

/**
 * Botão "Enviar para ficha ClienteX": quando a regra automática não reconheceu a reunião como
 * entrevista de perfil. Busca a transcrição completa no Fathom pela gravação (a ata guarda só o
 * resumo) e roda o mesmo pipeline do webhook. Sem gravação do Fathom, tabula o próprio texto da ata.
 */
export async function enviarAtaParaClienteX(ataId: string): Promise<SaidaImportacao> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada.", resultado: null };
  const { data: ata } = await supabase
    .from("reuniao_atas")
    .select("id, titulo, data_reuniao, participantes, conteudo, fathom_recording_id, reuniao_id, reunioes_agendadas(contatos_externos(email))")
    .eq("id", ataId)
    .maybeSingle();
  if (!ata) return { error: "Ata não encontrada.", resultado: null };

  let transcricao = "";
  if (ata.fathom_recording_id) transcricao = transcricaoParaTexto(await buscarTranscricaoFathom(String(ata.fathom_recording_id)));
  if (!transcricao.trim()) transcricao = String(ata.conteudo ?? "");

  // Soma as notas ao vivo da entrevista (formulário de perfil), se houver, à tabulação da ficha.
  if (ata.reuniao_id) {
    const { data: r } = await supabase.from("reunioes_agendadas").select("notas_perfil").eq("id", ata.reuniao_id).maybeSingle();
    const bloco = notasPerfilParaTexto((r?.notas_perfil ?? null) as Record<string, string> | null);
    if (bloco) transcricao = `${transcricao}\n\n${bloco}`;
  }

  const emails = new Set<string>();
  const ra = (ata as { reunioes_agendadas?: { contatos_externos?: { email?: string | null } | { email?: string | null }[] | null } | null }).reunioes_agendadas;
  const ce = ra?.contatos_externos;
  for (const c of Array.isArray(ce) ? ce : ce ? [ce] : []) if (c?.email) emails.add(c.email.toLowerCase());
  const urlGravacao = String(ata.conteudo ?? "").match(/Gravação completa: (\S+)/)?.[1] ?? null;

  const saida = await importarEntrevistaParaForms({
    transcricao,
    titulo: ata.titulo,
    dataReuniao: ata.data_reuniao,
    participantes: ata.participantes,
    emails,
    recordingId: ata.fathom_recording_id ? String(ata.fathom_recording_id) : null,
    url: urlGravacao,
    ataId: ata.id,
  });
  revalidatePath("/agenda");
  revalidatePath("/tarefas");
  return saida;
}
