"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cancelarEventoReuniao } from "@/lib/google-calendar";

export type ActionState = { error: string | null; success?: boolean };

function slugify(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function criarTipoReuniao(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const nome = String(formData.get("nome") || "").trim();
  const duracao_minutos = Number(formData.get("duracao_minutos") || 0);
  const descricao = String(formData.get("descricao") || "").trim() || null;
  const mensagem_convite = String(formData.get("mensagem_convite") || "").trim() || null;

  if (!nome || !duracao_minutos || duracao_minutos <= 0) {
    return { error: "Preencha o nome e a duração." };
  }

  const supabase = await createClient();
  let slug = slugify(nome);
  const { data: existente } = await supabase.from("tipos_reuniao").select("slug").eq("slug", slug).maybeSingle();
  if (existente) slug = `${slug}-${Date.now().toString(36)}`;

  const { error } = await supabase.from("tipos_reuniao").insert({ nome, slug, duracao_minutos, descricao, mensagem_convite });
  if (error) return { error: "Não foi possível criar o tipo de reunião." };

  revalidatePath("/agenda");
  return { error: null, success: true };
}

/**
 * Edita o tipo: nome, duração, descrição (aparece pro cliente ao escolher o horário) e texto do
 * convite. Se o nome muda, o link acompanha (o slug é refeito) — quem abrir o link antigo não vê
 * erro: a página mostra a escolha de tipo, ou vai direto quando há um tipo só.
 */
export async function atualizarTipoReuniao(
  id: string,
  campos: { nome: string; duracao_minutos: number; descricao: string | null; mensagem_convite: string | null },
): Promise<{ error: string | null }> {
  const nome = campos.nome.trim();
  if (!nome) return { error: "Dê um nome pro tipo de reunião." };
  if (!campos.duracao_minutos || campos.duracao_minutos <= 0) return { error: "Informe a duração." };

  const supabase = await createClient();
  const { data: atual } = await supabase.from("tipos_reuniao").select("nome, slug").eq("id", id).single();
  let slug = atual?.slug as string | undefined;
  if (atual && atual.nome !== nome) {
    slug = slugify(nome);
    const { data: outro } = await supabase.from("tipos_reuniao").select("id").eq("slug", slug).neq("id", id).maybeSingle();
    if (outro) slug = `${slug}-${Date.now().toString(36)}`;
  }
  const { error } = await supabase
    .from("tipos_reuniao")
    .update({
      nome,
      slug,
      duracao_minutos: campos.duracao_minutos,
      descricao: campos.descricao?.trim() || null,
      mensagem_convite: campos.mensagem_convite?.trim() || null,
    })
    .eq("id", id);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/agenda");
  return { error: null };
}

export async function alternarAtivoTipoReuniao(id: string, ativo: boolean) {
  const supabase = await createClient();
  await supabase.from("tipos_reuniao").update({ ativo }).eq("id", id);
  revalidatePath("/agenda");
}

/**
 * Exclui o tipo. Só reunião ATIVA impede — cancelada não: ela sai junto (a ata, se houver, continua
 * existindo; o banco só desfaz o vínculo com a reunião).
 */
export async function excluirTipoReuniao(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { count: ativas } = await supabase
    .from("reunioes_agendadas")
    .select("id", { count: "exact", head: true })
    .eq("tipo_reuniao_id", id)
    .neq("status", "cancelada");
  if ((ativas ?? 0) > 0) {
    return { error: "Esse tipo tem reunião marcada — cancele a reunião ou desative o tipo em vez de excluir." };
  }
  await supabase.from("reunioes_agendadas").delete().eq("tipo_reuniao_id", id).eq("status", "cancelada");
  const { error } = await supabase.from("tipos_reuniao").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/agenda");
  return { error: null };
}

export async function criarRegraDisponibilidade(formData: FormData): Promise<{ error: string | null }> {
  const tipo_reuniao_id = String(formData.get("tipo_reuniao_id") || "");
  const dia_semana = Number(formData.get("dia_semana"));
  const hora_inicio = String(formData.get("hora_inicio") || "");
  const hora_fim = String(formData.get("hora_fim") || "");

  if (!tipo_reuniao_id || Number.isNaN(dia_semana) || !hora_inicio || !hora_fim) {
    return { error: "Preencha dia da semana e horário." };
  }
  if (hora_fim <= hora_inicio) {
    return { error: "O horário final precisa ser depois do inicial." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("disponibilidade_regras").insert({ tipo_reuniao_id, dia_semana, hora_inicio, hora_fim });
  if (error) return { error: "Não foi possível salvar." };

  revalidatePath("/agenda");
  return { error: null };
}

export async function excluirRegraDisponibilidade(id: string) {
  const supabase = await createClient();
  await supabase.from("disponibilidade_regras").delete().eq("id", id);
  revalidatePath("/agenda");
}

export async function cancelarReuniao(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: reuniao } = await supabase.from("reunioes_agendadas").select("google_event_id").eq("id", id).single();

  const { error } = await supabase.from("reunioes_agendadas").update({ status: "cancelada" }).eq("id", id);
  if (error) return { error: "Não foi possível cancelar." };

  if (reuniao?.google_event_id) {
    await cancelarEventoReuniao(reuniao.google_event_id);
  }

  revalidatePath("/agenda");
  return { error: null };
}

/** Salva (ou limpa, se vazio) o link "Calendário Público" do iCloud da sócia logada. Valida lendo o
 * .ics uma vez — se o link não devolver um calendário, não grava. */
export async function salvarIcsPessoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const url = String(formData.get("url") || "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  if (url) {
    if (!/^(webcal|https?):\/\//i.test(url)) return { error: "Cole o link completo (começa com webcal:// ou https://)." };
    try {
      const resp = await fetch(url.replace(/^webcal:\/\//i, "https://"), { cache: "no-store" });
      const texto = resp.ok ? await resp.text() : "";
      if (!texto.includes("BEGIN:VCALENDAR")) return { error: "Esse link não devolveu um calendário. Confira se \"Calendário Público\" está ligado." };
    } catch {
      return { error: "Não consegui abrir esse link." };
    }
  }

  const { error } = await supabase.from("profiles").update({ ics_pessoal_url: url || null }).eq("id", user.id);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/agenda");
  return { error: null, success: true };
}
