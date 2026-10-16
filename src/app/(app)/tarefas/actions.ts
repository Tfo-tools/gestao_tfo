"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { acessoDrive, enviarParaDrive, iniciarUploadDrive, lixeiraDrive, obterArquivoDrive } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/server";
import { nomeArquivoSeguro } from "@/lib/nome-arquivo-seguro";
import { gerarOcorrenciasRotinas } from "@/lib/rotinas";
import { COLUNAS_GRADE, type ColunaGrade } from "./grade-colunas";
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
  const { data: tarefa, error } = await supabase
    .from("tarefas")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("rotina_id")
    .maybeSingle();
  if (error) return { error: "Não foi possível atualizar o status." };
  // Tarefa de rotina: concluir a atual é o que libera a próxima ocorrência (uma aberta por vez);
  // reabrir uma concluída recolhe a próxima. Roda na hora, sem esperar o cron.
  if (tarefa?.rotina_id) await gerarOcorrenciasRotinas(supabase);
  revalidatePath("/tarefas");
  revalidatePath("/agenda");
  return { error: null };
}

/** Prazo direto na caixinha (cliente pediu outra data): sem abrir o "editar". Vazio tira o prazo. */
export async function mudarPrazoTarefa(id: string, prazo: string | null): Promise<{ error: string | null }> {
  const valor = prazo && /^\d{4}-\d{2}-\d{2}$/.test(prazo) ? prazo : null;
  if (prazo && !valor) return { error: "Data inválida." };
  const supabase = await createClient();
  const { error } = await supabase.from("tarefas").update({ prazo: valor, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Não foi possível mudar o prazo." };
  revalidatePath("/tarefas");
  revalidatePath("/agenda");
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

/** Uma linha da grade de projeto (estilo quadro do monday). `id` = tarefa que já existe. Campo ausente = coluna desligada. */
export type LinhaProjetoRapido = {
  id?: string | null;
  titulo: string;
  responsavel_id: string | null;
  prazo: string | null;
  depende_de_linha: number | null;
  data_inicio?: string | null;
  fase_id?: string | null;
  status?: string | null;
  /** Texto "a, b, c" como na tela; vira lista ao gravar. */
  etiquetas?: string | null;
  area?: string | null;
  descricao?: string | null;
};
export type ProjetoRapidoState = TarefaFormState & { projetoId?: string; criadas?: number };

const dataOuNull = (v: unknown) => (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
const textoOuNull = (v: unknown) => {
  const t = String(v ?? "").trim();
  return t ? t : null;
};

function lerLinhas(formData: FormData): LinhaProjetoRapido[] | null {
  let brutas: unknown = [];
  try {
    brutas = JSON.parse(String(formData.get("linhas") || "[]"));
  } catch {
    return null;
  }
  return (Array.isArray(brutas) ? brutas : [])
    .map((l) => {
      const r = (l ?? {}) as Partial<LinhaProjetoRapido>;
      return {
        id: r.id ? String(r.id) : null,
        titulo: String(r.titulo ?? "").trim(),
        responsavel_id: r.responsavel_id ? String(r.responsavel_id) : null,
        prazo: dataOuNull(r.prazo),
        depende_de_linha: typeof r.depende_de_linha === "number" ? r.depende_de_linha : null,
        data_inicio: dataOuNull(r.data_inicio),
        fase_id: r.fase_id ? String(r.fase_id) : null,
        status: ["a_fazer", "fazendo", "feito"].includes(String(r.status)) ? String(r.status) : null,
        etiquetas: textoOuNull(r.etiquetas),
        area: textoOuNull(r.area),
        descricao: textoOuNull(r.descricao),
      };
    })
    .filter((l) => l.titulo);
}

/** Colunas ligadas na grade (campo `colunas`, JSON). Só o que está ligado é gravado — o resto fica como estava. */
function lerColunas(formData: FormData): Set<ColunaGrade> {
  try {
    const lista = JSON.parse(String(formData.get("colunas") || "[]"));
    return new Set((Array.isArray(lista) ? lista : []).filter((c): c is ColunaGrade => COLUNAS_GRADE.includes(c)));
  } catch {
    return new Set(["responsavel", "prazo", "depende"]);
  }
}

/** Os campos da tarefa que a linha manda gravar, conforme as colunas ligadas. */
function camposDaLinha(l: LinhaProjetoRapido, colunas: Set<ColunaGrade>): Record<string, unknown> {
  const campos: Record<string, unknown> = { titulo: l.titulo };
  if (colunas.has("responsavel")) campos.responsavel_id = l.responsavel_id;
  if (colunas.has("prazo")) campos.prazo = l.prazo;
  if (colunas.has("inicio")) campos.data_inicio = l.data_inicio ?? null;
  if (colunas.has("fase")) campos.fase_id = l.fase_id ?? null;
  if (colunas.has("status") && l.status) campos.status = l.status;
  if (colunas.has("etiquetas")) campos.etiquetas = [...new Set((l.etiquetas ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (colunas.has("area")) campos.area = l.area ?? null;
  if (colunas.has("descricao")) campos.descricao = l.descricao ?? null;
  return campos;
}

/**
 * Grade de um projeto que já existe: atualiza título, responsável e prazo das tarefas que estavam
 * na grade, cria as linhas novas e ajusta as dependências ENTRE as tarefas da grade (dependência
 * com tarefa de fora da grade fica como está). Tarefa que a sócia não quer mais sai pelo × do card.
 */
export async function salvarGradeProjeto(_prev: ProjetoRapidoState, formData: FormData): Promise<ProjetoRapidoState> {
  const projetoId = texto(formData, "projeto_id");
  const nome = texto(formData, "nome");
  if (!projetoId) return { error: "Escolha o projeto." };
  if (!nome) return { error: "Dê um nome pro projeto." };
  const linhas = lerLinhas(formData);
  if (!linhas) return { error: "Não entendi as tarefas da grade." };
  const colunas = lerColunas(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error: erroProjeto } = await supabase
    .from("projetos")
    .update({ nome, objetivo: opcional(formData, "objetivo"), updated_at: new Date().toISOString() })
    .eq("id", projetoId);
  if (erroProjeto) return { error: "Não foi possível salvar o projeto." };

  // Só mexe em tarefa que é mesmo deste projeto — um id de fora é ignorado.
  const { data: doProjeto } = await supabase.from("tarefas").select("id, ordem").eq("projeto_id", projetoId);
  const idsDoProjeto = new Set((doProjeto ?? []).map((t) => t.id as string));
  const idPorLinha = new Map<number, string>();
  let ordemBase = Math.max(-1, ...(doProjeto ?? []).map((t) => Number(t.ordem ?? 0))) + 1;

  for (const [i, l] of linhas.entries()) {
    if (l.id && idsDoProjeto.has(l.id)) {
      const { error } = await supabase
        .from("tarefas")
        .update({ ...camposDaLinha(l, colunas), updated_at: new Date().toISOString() })
        .eq("id", l.id);
      if (error) return { error: `Não foi possível salvar a linha ${i + 1}.`, projetoId };
      idPorLinha.set(i, l.id);
    } else {
      const { data, error } = await supabase
        .from("tarefas")
        .insert({ status: "a_fazer", ...camposDaLinha(l, colunas), projeto_id: projetoId, ordem: ordemBase++, criado_por: user?.id ?? null })
        .select("id")
        .single();
      if (error || !data) return { error: `Não foi possível criar a linha ${i + 1}.`, projetoId };
      idPorLinha.set(i, data.id as string);
    }
  }

  if (!colunas.has("depende")) {
    revalidatePath("/tarefas");
    return { error: null, success: true, projetoId, criadas: linhas.filter((l) => !l.id).length };
  }
  const ids = [...idPorLinha.values()];
  const desejadas = new Set(
    linhas
      .map((l, i) => (l.depende_de_linha != null && l.depende_de_linha !== i ? `${idPorLinha.get(i)}|${idPorLinha.get(l.depende_de_linha)}` : null))
      .filter((p): p is string => !!p && !p.includes("undefined")),
  );
  const { data: atuaisRaw } = await supabase.from("tarefa_dependencias").select("tarefa_id, depende_de_id").in("tarefa_id", ids).in("depende_de_id", ids);
  const atuais = new Set(((atuaisRaw ?? []) as { tarefa_id: string; depende_de_id: string }[]).map((d) => `${d.tarefa_id}|${d.depende_de_id}`));
  for (const par of atuais) {
    if (desejadas.has(par)) continue;
    const [tarefa_id, depende_de_id] = par.split("|");
    await supabase.from("tarefa_dependencias").delete().eq("tarefa_id", tarefa_id).eq("depende_de_id", depende_de_id);
  }
  const novas = [...desejadas].filter((p) => !atuais.has(p)).map((p) => ({ tarefa_id: p.split("|")[0], depende_de_id: p.split("|")[1] }));
  if (novas.length > 0) await supabase.from("tarefa_dependencias").insert(novas);

  revalidatePath("/tarefas");
  return { error: null, success: true, projetoId, criadas: linhas.filter((l) => !l.id).length };
}

/**
 * "+ Projeto": cria o projeto e, de uma vez, as tarefas escritas na grade (título, responsável,
 * prazo, depende de outra linha). Depois a sócia entra em cada uma pra detalhar (descrição,
 * subtarefas, participantes). As linhas vêm em JSON no campo `linhas`.
 */
export async function criarProjetoRapido(_prev: ProjetoRapidoState, formData: FormData): Promise<ProjetoRapidoState> {
  const nome = texto(formData, "nome");
  if (!nome) return { error: "Dê um nome pro projeto." };
  const linhas = lerLinhas(formData);
  if (!linhas) return { error: "Não entendi as tarefas da grade." };
  const colunas = lerColunas(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: projeto, error } = await supabase
    .from("projetos")
    .insert({ nome, objetivo: opcional(formData, "objetivo"), produto_fase_id: opcional(formData, "produto_fase_id"), criado_por: user?.id ?? null })
    .select("id")
    .single();
  if (error || !projeto) return { error: "Não foi possível criar o projeto." };

  if (linhas.length > 0) {
    const { data: criadas, error: erroTarefas } = await supabase
      .from("tarefas")
      .insert(
        linhas.map((l, i) => ({
          status: "a_fazer",
          ...camposDaLinha(l, colunas),
          // Fase é do projeto; projeto novo ainda não tem fase.
          fase_id: null,
          projeto_id: projeto.id,
          ordem: i,
          criado_por: user?.id ?? null,
        })),
      )
      .select("id, ordem");
    if (erroTarefas || !criadas) return { error: "O projeto foi criado, mas as tarefas não.", projetoId: projeto.id };

    // "Depende da linha N": a ordem foi gravada em `ordem`, então dá pra casar linha ↔ id criado.
    const idPorLinha = new Map((criadas as { id: string; ordem: number }[]).map((t) => [t.ordem, t.id]));
    const deps = !colunas.has("depende") ? [] : linhas
      .map((l, i) => ({ tarefa_id: idPorLinha.get(i), depende_de_id: l.depende_de_linha != null && l.depende_de_linha !== i ? idPorLinha.get(l.depende_de_linha) : undefined }))
      .filter((d): d is { tarefa_id: string; depende_de_id: string } => !!d.tarefa_id && !!d.depende_de_id);
    if (deps.length > 0) await supabase.from("tarefa_dependencias").insert(deps);
  }

  revalidatePath("/tarefas");
  return { error: null, success: true, projetoId: projeto.id, criadas: linhas.length };
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

export type MetaAnexo = { nome: string; tipo: string; tamanho: number };
export type InicioAnexo =
  | { error: string }
  | { error: null; destino: "drive"; uploadUrl: string }
  | { error: null; destino: "storage"; caminho: string; token: string };

/**
 * Anexar é em duas etapas porque o arquivo NÃO passa pelo servidor: a Vercel recusa corpo acima de
 * ~4,5 MB, bem abaixo do LIMITE_ANEXO_MB. Aqui o servidor só abre a sessão (Drive) ou assina a URL
 * (Storage, reserva); o navegador manda os bytes direto e depois chama `concluirAnexo`.
 */
export async function iniciarAnexo(tarefaId: string, meta: MetaAnexo): Promise<InicioAnexo> {
  if (!meta?.nome || !meta.tamanho) return { error: "Escolha um arquivo." };
  // Documento/planilha/print cabe folgado; vídeo é o que estoura o 1 GB do plano grátis.
  if (meta.tamanho > LIMITE_ANEXO_MB * 1024 * 1024) {
    return { error: `Arquivo maior que ${LIMITE_ANEXO_MB} MB — guarde no Drive e cole o link na descrição.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada — entre de novo." };

  // NFC: o Finder do macOS grava acento decomposto e a Storage recusa esse nome com 400.
  const nome = nomeArquivoSeguro(meta.nome);

  // 1) Drive compartilhado (Espaço TFO/Arquivos_tarefas, nome da tarefa no fim do arquivo):
  //    docx/xlsx/pptx viram Docs/Sheets/Slides e abrem editáveis pras duas.
  const acesso = await acessoDrive(user.id);
  const { data: tarefa } = acesso ? await supabase.from("tarefas").select("titulo").eq("id", tarefaId).maybeSingle() : { data: null };
  if (acesso && tarefa) {
    const origem = (await headers()).get("origin");
    const uploadUrl = await iniciarUploadDrive(acesso, { nome, tipo: meta.tipo, tamanho: meta.tamanho }, tarefa.titulo, origem);
    if (uploadUrl) return { error: null, destino: "drive", uploadUrl };
  }

  // 2) Reserva: Storage do Supabase (como era antes do Drive) — abre só pra baixar.
  const caminho = `tarefas/${tarefaId}/${Date.now()}-${nome}`;
  const { data, error } = await supabase.storage.from("comprovantes").createSignedUploadUrl(caminho);
  if (error || !data) return { error: "Não foi possível preparar o envio." };
  return { error: null, destino: "storage", caminho, token: data.token };
}

export async function concluirAnexo(
  tarefaId: string,
  dados: MetaAnexo & ({ destino: "drive"; driveFileId: string } | { destino: "storage"; caminho: string }),
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada — entre de novo." };
  const nome = nomeArquivoSeguro(dados.nome);

  if (dados.destino === "drive") {
    // Não confiar no id que veio do navegador: conferir que o arquivo existe e está na nossa pasta.
    const acesso = await acessoDrive(user.id);
    const noDrive = acesso && dados.driveFileId ? await obterArquivoDrive(acesso, dados.driveFileId) : null;
    if (!acesso || !noDrive || noDrive.trashed || !noDrive.parents.includes(acesso.pastaRaizId)) {
      return { error: "O Drive não confirmou o arquivo — tente de novo." };
    }
    const { error } = await supabase.from("anexos_tarefa").insert({
      tarefa_id: tarefaId,
      nome_arquivo: nome,
      caminho_arquivo: null,
      tipo_mime: noDrive.mime,
      tamanho_bytes: dados.tamanho,
      enviado_por: user.id,
      drive_file_id: noDrive.id,
      url: noDrive.url,
    });
    if (error) return { error: "Subiu no Drive, mas não registrou o anexo." };
    revalidatePath("/tarefas");
    return { error: null };
  }

  // Storage: só aceita caminho dentro da pasta desta tarefa (foi o servidor que o gerou).
  if (!dados.caminho.startsWith(`tarefas/${tarefaId}/`)) return { error: "Caminho do arquivo inválido." };
  const { error } = await supabase.from("anexos_tarefa").insert({
    tarefa_id: tarefaId,
    nome_arquivo: nome,
    caminho_arquivo: dados.caminho,
    tipo_mime: dados.tipo,
    tamanho_bytes: dados.tamanho,
    enviado_por: user.id,
  });
  if (error) return { error: "Não foi possível registrar o anexo." };
  revalidatePath("/tarefas");
  return { error: null };
}

/**
 * Caminho antigo, pelo servidor: o navegador só usa como reserva, em arquivo pequeno, se o envio
 * direto falhar (CORS, rede). Acima de ~4,5 MB a Vercel recusa antes de chegar aqui.
 */
export async function anexarNaTarefa(tarefaId: string, arquivo: File): Promise<{ error: string | null }> {
  if (!arquivo || arquivo.size === 0) return { error: "Escolha um arquivo." };
  if (arquivo.size > LIMITE_ANEXO_MB * 1024 * 1024) {
    return { error: `Arquivo maior que ${LIMITE_ANEXO_MB} MB — guarde no Drive e cole o link na descrição.` };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada — entre de novo." };
  const nome = nomeArquivoSeguro(arquivo.name);

  const acesso = await acessoDrive(user.id);
  const { data: tarefa } = acesso ? await supabase.from("tarefas").select("titulo").eq("id", tarefaId).maybeSingle() : { data: null };
  if (acesso && tarefa) {
    const noDrive = await enviarParaDrive(acesso, { nome, tipo: arquivo.type, bytes: await arquivo.arrayBuffer() }, tarefa.titulo);
    if (noDrive) return concluirAnexo(tarefaId, { nome, tipo: arquivo.type, tamanho: arquivo.size, destino: "drive", driveFileId: noDrive.id });
  }

  const caminho = `tarefas/${tarefaId}/${Date.now()}-${nome}`;
  const { error: uploadError } = await supabase.storage.from("comprovantes").upload(caminho, arquivo, { contentType: arquivo.type });
  if (uploadError) return { error: "Não foi possível subir o arquivo." };
  return concluirAnexo(tarefaId, { nome, tipo: arquivo.type, tamanho: arquivo.size, destino: "storage", caminho });
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
