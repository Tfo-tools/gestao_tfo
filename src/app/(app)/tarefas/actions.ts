"use server";

import { revalidatePath } from "next/cache";
import { acessoDrive, enviarParaDrive, lixeiraDrive, pastaDaTarefa } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/server";
import { nomeArquivoSeguro } from "@/lib/nome-arquivo-seguro";
import { LIMITE_ANEXO_MB } from "./limites";

export type TarefaFormState = { error: string | null; success?: boolean };

function texto(fd: FormData, k: string) {
  return String(fd.get(k) || "").trim();
}
function opcional(fd: FormData, k: string) {
  return texto(fd, k) || null;
}
/** "centelha, jurídico" → ["centelha","jurídico"] (minúsculas, sem repetição). */
function etiquetas(fd: FormData) {
  return [...new Set(texto(fd, "etiquetas").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))];
}
function lista(fd: FormData, k: string) {
  return [...new Set(fd.getAll(k).map(String).filter(Boolean))];
}
function dependencias(fd: FormData) {
  return fd.getAll("depende_de").map(String).filter(Boolean);
}

function camposTarefa(fd: FormData) {
  return {
    titulo: texto(fd, "titulo"),
    descricao: opcional(fd, "descricao"),
    responsavel_id: opcional(fd, "responsavel_id"),
    prazo: opcional(fd, "prazo"),
    data_inicio: opcional(fd, "data_inicio"),
    produtos: lista(fd, "produtos"),
    area: opcional(fd, "area"),
    projeto_id: opcional(fd, "projeto_id"),
    fase_id: opcional(fd, "fase_id"),
    parent_id: opcional(fd, "parent_id"),
    etiquetas: etiquetas(fd),
    participantes: lista(fd, "participantes"),
  };
}

/** "Projeto: + novo…" no formulário da tarefa cria o projeto na hora e devolve o id dele. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolverProjeto(supabase: any, fd: FormData, projetoId: string | null, userId: string | null): Promise<string | null | { error: string }> {
  if (projetoId !== "__novo") return projetoId;
  const nome = texto(fd, "novo_projeto");
  if (!nome) return { error: "Dê um nome pro projeto novo." };
  const { data, error } = await supabase.from("projetos").insert({ nome, criado_por: userId }).select("id").single();
  if (error || !data) return { error: "Não foi possível criar o projeto." };
  return data.id as string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function salvarDependencias(supabase: any, tarefaId: string, dependeDe: string[]) {
  await supabase.from("tarefa_dependencias").delete().eq("tarefa_id", tarefaId);
  const validas = dependeDe.filter((d) => d !== tarefaId);
  if (validas.length > 0) {
    await supabase.from("tarefa_dependencias").insert(validas.map((d) => ({ tarefa_id: tarefaId, depende_de_id: d })));
  }
}

export async function criarTarefa(_prevState: TarefaFormState, formData: FormData): Promise<TarefaFormState> {
  const campos = camposTarefa(formData);
  if (!campos.titulo) return { error: "Dê um título pra tarefa." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const projeto = await resolverProjeto(supabase, formData, campos.projeto_id, user?.id ?? null);
  if (projeto && typeof projeto === "object") return projeto;
  campos.projeto_id = projeto;

  // Subtarefa herda projeto e fase da mãe quando não vierem preenchidos.
  if (campos.parent_id && (!campos.projeto_id || !campos.fase_id)) {
    const { data: mae } = await supabase.from("tarefas").select("projeto_id, fase_id").eq("id", campos.parent_id).maybeSingle();
    campos.projeto_id = campos.projeto_id ?? mae?.projeto_id ?? null;
    campos.fase_id = campos.fase_id ?? mae?.fase_id ?? null;
  }

  const { data, error } = await supabase
    .from("tarefas")
    .insert({ ...campos, criado_por: user?.id ?? null })
    .select("id")
    .single();
  if (error || !data) return { error: "Não foi possível criar a tarefa." };

  const deps = dependencias(formData);
  if (deps.length > 0) await salvarDependencias(supabase, data.id, deps);

  // Subtarefas escritas junto no formulário de criação (uma por linha do campo "subtarefas"):
  // herdam projeto, fase e responsável da mãe — quem está criando já pensou no conjunto.
  const subtarefas = String(formData.get("subtarefas") ?? "")
    .split("\n")
    .map((linha) => linha.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean);
  if (subtarefas.length > 0) {
    await supabase.from("tarefas").insert(
      subtarefas.map((titulo, i) => ({
        titulo,
        parent_id: data.id,
        projeto_id: campos.projeto_id,
        fase_id: campos.fase_id,
        responsavel_id: campos.responsavel_id,
        ordem: i,
        criado_por: user?.id ?? null,
      })),
    );
  }

  revalidatePath("/tarefas");
  return { error: null, success: true };
}

export async function atualizarTarefa(_prevState: TarefaFormState, formData: FormData): Promise<TarefaFormState> {
  const id = texto(formData, "id");
  const campos = camposTarefa(formData);
  if (!id || !campos.titulo) return { error: "Preencha o título." };
  if (campos.parent_id === id) return { error: "Uma tarefa não pode ser subtarefa dela mesma." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const projeto = await resolverProjeto(supabase, formData, campos.projeto_id, user?.id ?? null);
  if (projeto && typeof projeto === "object") return projeto;
  campos.projeto_id = projeto;
  // Trocou de projeto: a fase antiga não pertence mais a ele.
  if (campos.projeto_id !== opcional(formData, "projeto_id")) campos.fase_id = null;

  const { error } = await supabase
    .from("tarefas")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Não foi possível salvar." };

  await salvarDependencias(supabase, id, dependencias(formData));

  revalidatePath("/tarefas");
  return { error: null, success: true };
}

export async function mudarStatusTarefa(id: string, status: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tarefas").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Não foi possível atualizar o status." };
  revalidatePath("/tarefas");
  return { error: null };
}

export async function excluirTarefa(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tarefas").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/tarefas");
  return { error: null };
}

// ── Projetos e fases ─────────────────────────────────────────────────────────────────────────

export async function criarProjeto(_prev: TarefaFormState, formData: FormData): Promise<TarefaFormState> {
  const nome = texto(formData, "nome");
  if (!nome) return { error: "Dê um nome pro projeto." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("projetos").insert({
    nome,
    objetivo: opcional(formData, "objetivo"),
    produto_fase_id: opcional(formData, "produto_fase_id"),
    criado_por: user?.id ?? null,
  });
  if (error) return { error: "Não foi possível criar o projeto." };
  revalidatePath("/tarefas");
  return { error: null, success: true };
}

export async function atualizarProjeto(_prev: TarefaFormState, formData: FormData): Promise<TarefaFormState> {
  const id = texto(formData, "id");
  const nome = texto(formData, "nome");
  if (!id || !nome) return { error: "Preencha o nome." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("projetos")
    .update({
      nome,
      objetivo: opcional(formData, "objetivo"),
      produto_fase_id: opcional(formData, "produto_fase_id"),
      status: texto(formData, "status") || "ativo",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: "Não foi possível salvar o projeto." };
  revalidatePath("/tarefas");
  return { error: null, success: true };
}

/** Só apaga projeto sem tarefas — as tarefas ficariam órfãs (projeto_id vira null) e a EAP some sem aviso. */
export async function excluirProjeto(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { count } = await supabase.from("tarefas").select("id", { count: "exact", head: true }).eq("projeto_id", id);
  if ((count ?? 0) > 0) return { error: `Esse projeto tem ${count} tarefa(s). Mova ou exclua elas antes, ou arquive o projeto.` };
  const { error } = await supabase.from("projetos").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/tarefas");
  return { error: null };
}

export async function criarFaseProjeto(formData: FormData): Promise<{ error: string | null }> {
  const projeto_id = texto(formData, "projeto_id");
  const nome = texto(formData, "nome");
  if (!projeto_id || !nome) return { error: "Dê um nome pra fase." };
  const supabase = await createClient();
  const { count } = await supabase.from("projeto_fases").select("id", { count: "exact", head: true }).eq("projeto_id", projeto_id);
  const { error } = await supabase.from("projeto_fases").insert({
    projeto_id,
    nome,
    ordem: count ?? 0,
    data_inicio: opcional(formData, "data_inicio"),
    data_fim: opcional(formData, "data_fim"),
  });
  if (error) return { error: "Não foi possível criar a fase." };
  revalidatePath("/tarefas");
  return { error: null };
}

export async function excluirFaseProjeto(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("projeto_fases").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir a fase." };
  revalidatePath("/tarefas");
  return { error: null };
}

export async function anexarNaTarefa(tarefaId: string, arquivo: File): Promise<{ error: string | null }> {
  if (!arquivo || arquivo.size === 0) return { error: "Escolha um arquivo." };
  // Documento/planilha/print cabe folgado; vídeo é o que estoura o 1 GB do plano grátis.
  if (arquivo.size > LIMITE_ANEXO_MB * 1024 * 1024) {
    return { error: `Arquivo maior que ${LIMITE_ANEXO_MB} MB — guarde no Drive e cole o link na descrição.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // NFC: o Finder do macOS grava acento decomposto e a Storage recusa esse nome com 400.
  const nome = nomeArquivoSeguro(arquivo.name);

  // 1) Drive compartilhado (Espaço TFO/Arquivos_tarefas/<tarefa>): docx/xlsx/pptx viram
  //    Docs/Sheets/Slides e abrem editáveis pras duas. Usa a conexão Google de uma sócia com Drive.
  const acesso = await acessoDrive(user?.id ?? null);
  const { data: tarefa } = acesso ? await supabase.from("tarefas").select("titulo, drive_pasta_id").eq("id", tarefaId).maybeSingle() : { data: null };
  if (acesso && tarefa) {
    const pastaId = await pastaDaTarefa(acesso, tarefa.titulo, tarefa.drive_pasta_id);
    if (pastaId) {
      if (pastaId !== tarefa.drive_pasta_id) await supabase.from("tarefas").update({ drive_pasta_id: pastaId }).eq("id", tarefaId);
      const noDrive = await enviarParaDrive(acesso, { nome, tipo: arquivo.type, bytes: await arquivo.arrayBuffer() }, pastaId);
      if (noDrive) {
        const { error } = await supabase.from("anexos_tarefa").insert({
          tarefa_id: tarefaId,
          nome_arquivo: nome,
          caminho_arquivo: null,
          tipo_mime: noDrive.mime,
          tamanho_bytes: arquivo.size,
          enviado_por: user?.id ?? null,
          drive_file_id: noDrive.id,
          url: noDrive.url,
        });
        if (error) return { error: "Subiu no Drive, mas não registrou o anexo." };
        revalidatePath("/tarefas");
        return { error: null };
      }
    }
  }

  // 2) Reserva: Storage do Supabase (como era antes do Drive) — abre só pra baixar.
  const path = `tarefas/${tarefaId}/${Date.now()}-${nome}`;
  const { error: uploadError } = await supabase.storage.from("comprovantes").upload(path, arquivo, { contentType: arquivo.type });
  if (uploadError) return { error: "Não foi possível subir o arquivo." };

  const { error } = await supabase.from("anexos_tarefa").insert({
    tarefa_id: tarefaId,
    nome_arquivo: nome,
    caminho_arquivo: path,
    tipo_mime: arquivo.type,
    tamanho_bytes: arquivo.size,
    enviado_por: user?.id ?? null,
  });
  if (error) return { error: "Não foi possível registrar o anexo." };
  revalidatePath("/tarefas");
  return { error: null };
}

export async function excluirAnexoTarefa(id: string, caminho: string | null, driveFileId: string | null = null): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (driveFileId) await lixeiraDrive(driveFileId, user?.id ?? null); // lixeira do Drive: dá pra recuperar por 30 dias
  if (caminho) await supabase.storage.from("comprovantes").remove([caminho]);
  const { error } = await supabase.from("anexos_tarefa").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/tarefas");
  return { error: null };
}

export async function urlAnexoTarefa(caminho: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(caminho, 60 * 10);
  return error ? null : data.signedUrl;
}

/** A IA às vezes cria como tarefa o que é só uma etapa de outra: isto rebaixa a tarefa pra
 * atividade (subtarefa) da escolhida, herdando projeto e fase dela. As atividades que ela já
 * tinha sobem junto (ficam na mesma lista plana da nova mãe). */
export async function tornarAtividadeDe(id: string, maeId: string): Promise<{ error: string | null }> {
  if (!id || !maeId || id === maeId) return { error: "Escolha outra tarefa." };
  const supabase = await createClient();
  const { data: mae } = await supabase.from("tarefas").select("id, projeto_id, fase_id, parent_id").eq("id", maeId).maybeSingle();
  if (!mae) return { error: "Tarefa de destino não encontrada." };
  if (mae.parent_id) return { error: "A tarefa escolhida já é uma atividade — escolha uma tarefa principal." };
  const { error } = await supabase.from("tarefas").update({ parent_id: maeId, projeto_id: mae.projeto_id, fase_id: mae.fase_id, prazo: null }).eq("id", id);
  if (error) return { error: "Não foi possível mover." };
  await supabase.from("tarefas").update({ parent_id: maeId, projeto_id: mae.projeto_id, fase_id: mae.fase_id }).eq("parent_id", id);
  await supabase.from("tarefa_dependencias").delete().or(`tarefa_id.eq.${id},depende_de_id.eq.${id}`);
  revalidatePath("/tarefas");
  return { error: null };
}
