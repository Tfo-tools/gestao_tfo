"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerDocumentoViagem, leituraViagemConfigurada, type ItemViagemExtraido, type TipoItemViagem } from "@/lib/viagens-ia";
import { enviarPush } from "@/lib/push";
import { salvarPagamentoDetalhe } from "@/lib/pagamento-detalhe";
import { gerarAcertoAvulso, rateioIgual, salvarRateio } from "@/lib/acertos-socias";
import { hojeSP } from "@/lib/rotinas";

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

/** Atualiza nome/destino/datas da viagem — usado quando a IA lê o 1º e-ticket e preenche a viagem. */
export async function atualizarDadosViagem(
  id: string,
  campos: { titulo?: string | null; destino?: string | null; data_inicio?: string | null; data_fim?: string | null },
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (campos.titulo != null && campos.titulo.trim()) patch.titulo = campos.titulo.trim();
  if (campos.destino !== undefined) patch.destino = campos.destino?.trim() || null;
  if (campos.data_inicio !== undefined) patch.data_inicio = data(campos.data_inicio) || null;
  if (campos.data_fim !== undefined) patch.data_fim = data(campos.data_fim) || null;
  if (Object.keys(patch).length === 0) return { error: null };
  const { error } = await supabase.from("viagens").update(patch).eq("id", id);
  if (error) return { error: "Não consegui atualizar a viagem." };
  revalidatePath("/viagens");
  revalidatePath(`/viagens/${id}`);
  return { error: null };
}

/**
 * Avisa por push TODOS os usuários do app (menos quem criou) que entrou uma viagem nova — assim a
 * Emyli/Rayssa ficam sabendo da viagem da sócia. Silencioso se a pessoa não tiver notificação ligada.
 * Chamado pelo cliente depois que a viagem já tem nome (manual ou lido pela IA).
 */
export async function avisarNovaViagem(viagemId: string): Promise<void> {
  const supabase = await createClient();
  const { data: v } = await supabase.from("viagens").select("titulo, destino, criado_por").eq("id", viagemId).maybeSingle();
  if (!v) return;
  let criador = "Alguém";
  if (v.criado_por) {
    const { data: p } = await supabase.from("profiles").select("nome").eq("id", v.criado_por).maybeSingle();
    if (p?.nome) criador = p.nome.charAt(0).toUpperCase() + p.nome.slice(1);
  }
  const { data: todos } = await supabase.from("profiles").select("id").in("papel", ["socia", "equipe"]);
  const ids = ((todos ?? []) as { id: string }[]).map((t) => t.id).filter((id) => id !== v.criado_por);
  if (ids.length === 0) return;
  const destino = v.destino ? ` — ${v.destino}` : "";
  await enviarPush(ids, { title: "Nova viagem", body: `${criador} criou "${v.titulo}"${destino}`, url: `/viagens/${viagemId}` });
}

export async function excluirViagem(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  // E-tickets no Storage saem primeiro (não entram no cascade do banco).
  const { data: anexos } = await supabase.from("viagem_anexos").select("caminho_arquivo").eq("viagem_id", id);
  const caminhos = (anexos ?? []).map((a) => a.caminho_arquivo).filter(Boolean);
  if (caminhos.length) await createAdminClient().storage.from("comprovantes").remove(caminhos);
  // Desvincula despesas já lançadas (mantém a despesa, só tira o laço com a viagem).
  await supabase.from("despesas").update({ viagem_id: null }).eq("viagem_id", id);
  // Filhos antes da viagem (caso não haja ON DELETE CASCADE).
  const { data: itensDel } = await supabase.from("viagem_itens").select("id").eq("viagem_id", id);
  const itemIds = (itensDel ?? []).map((i) => i.id);
  if (itemIds.length) await supabase.from("viagem_item_participantes").delete().in("item_id", itemIds);
  await supabase.from("viagem_itens").delete().eq("viagem_id", id);
  await supabase.from("viagem_anexos").delete().eq("viagem_id", id);
  await supabase.from("viagem_participantes").delete().eq("viagem_id", id);
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
  conexoes?: string | null;
  valor?: number | null;
  participantes?: string[];
};

export async function salvarItem(input: ItemInput): Promise<{ error: string | null; id?: string }> {
  const supabase = await createClient();
  if (!input.titulo?.trim()) return { error: "O item precisa de um título." };
  const ts = (v?: string | null) => {
    const s = String(v ?? "").trim();
    return s ? new Date(s).toISOString() : null;
  };
  // Ao editar, preserva o vínculo com a despesa já lançada (detalhes.despesa_id).
  let despesaIdExistente: string | null = null;
  if (input.id) {
    const { data: atual } = await supabase.from("viagem_itens").select("detalhes").eq("id", input.id).maybeSingle();
    despesaIdExistente = ((atual?.detalhes ?? {}) as { despesa_id?: string }).despesa_id ?? null;
  }
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
    detalhes: {
      observacoes: input.observacoes?.trim() || null,
      conexoes: input.conexoes?.trim() || null,
      valor: typeof input.valor === "number" ? input.valor : null,
      despesa_id: despesaIdExistente,
    },
  };
  let itemId = input.id ?? null;
  if (input.id) {
    const { error } = await supabase.from("viagem_itens").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", input.id);
    if (error) return { error: "Não consegui salvar o item." };
  } else {
    const { data: novo, error } = await supabase.from("viagem_itens").insert(campos).select("id").single();
    if (error || !novo) return { error: "Não consegui salvar o item." };
    itemId = novo.id;
  }
  // "Quem está neste trecho": substitui a lista do item.
  if (input.participantes && itemId) {
    await supabase.from("viagem_item_participantes").delete().eq("item_id", itemId);
    const ps = [...new Set(input.participantes)].filter(Boolean);
    if (ps.length > 0) await supabase.from("viagem_item_participantes").insert(ps.map((profile_id) => ({ item_id: itemId!, profile_id })));
  }
  revalidatePath(`/viagens/${input.viagemId}`);
  return { error: null, id: itemId! };
}

/** Divide a despesa do item entre as sócias participantes dele (a passagem de uma fica só com ela).
 * Não mexe se alguma parte já entrou num acerto entre sócias. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dividirPelosParticipantes(supabase: any, itemId: string, despesaId: string) {
  const { count } = await supabase.from("acerto_itens").select("id", { count: "exact", head: true }).eq("despesa_id", despesaId);
  if ((count ?? 0) > 0) return;
  const { data: participantes } = await supabase.from("viagem_item_participantes").select("profiles(nome, papel)").eq("item_id", itemId);
  const socias = ((participantes ?? []) as { profiles: { nome: string; papel: string } | { nome: string; papel: string }[] | null }[])
    .map((p) => (Array.isArray(p.profiles) ? p.profiles[0] : p.profiles))
    .filter((p): p is { nome: string; papel: string } => !!p && p.papel === "socia")
    .map((p) => p.nome);
  await salvarRateio(supabase, despesaId, rateioIgual(socias));
  // Pago à vista depois da geração do acerto do mês: vira acerto avulso na hora.
  try {
    const { avisos } = await gerarAcertoAvulso(supabase, despesaId, hojeSP());
    for (const a of avisos) await enviarPush([a.usuarioId], { title: a.title, body: a.body, url: "/tarefas" });
  } catch (e) {
    console.error("Acerto avulso não gerado", e);
  }
}

/**
 * Salva o item E, se tiver valor, lança/atualiza a despesa no Custos já classificada e COM a forma
 * de pagamento (cartão/parcelas/titular) — tudo no mesmo fluxo do assistente. Substitui o antigo
 * "Lançar no Custos" solto, que criava a despesa sem detalhe de pagamento. O nome do item vira a
 * descrição (campo de busca) da despesa. Sem valor ou sem detalhe, só salva o item.
 */
export async function salvarItemComCusto(
  input: ItemInput & { custo?: { contaId?: string | null; pagador?: string | null; pagamentoDetalheJson?: string | null } | null },
): Promise<{ error: string | null; id?: string }> {
  const base = await salvarItem(input);
  if (base.error || !base.id) return base;
  const itemId = base.id;

  const valor = typeof input.valor === "number" ? input.valor : 0;
  if (!input.custo || !valor || valor <= 0) return { error: null, id: itemId };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: itemAtual } = await supabase.from("viagem_itens").select("detalhes, inicio, titulo").eq("id", itemId).maybeSingle();
  const det = (itemAtual?.detalhes ?? {}) as { despesa_id?: string | null };
  let despesaId = det.despesa_id ?? null;

  const conta = input.custo.contaId || CONTA_POR_TIPO[input.tipo] || CONTA_POR_TIPO.outro;
  // Data do gasto = dia da COMPRA, não da viagem: é ela que define em qual fatura do cartão cai.
  // Na criação é hoje; depois vale a que estiver na despesa (corrigível editando no Custos).
  const { data: despesaAtual } = despesaId ? await supabase.from("despesas").select("data_gasto").eq("id", despesaId).maybeSingle() : { data: null };
  const dataGasto = (despesaAtual?.data_gasto as string | undefined) ?? hojeSP();
  const descricao = (input.titulo || itemAtual?.titulo || "Item da viagem").trim();
  const pagador = input.custo.pagador?.trim() || null;

  if (despesaId) {
    const { error } = await supabase
      .from("despesas")
      .update({ plano_contas_id: conta, valor_total: valor, descricao, pagador })
      .eq("id", despesaId);
    if (error) return { error: "Item salvo, mas não consegui atualizar a despesa no Custos.", id: itemId };
  } else {
    const { data: desp, error } = await supabase
      .from("despesas")
      .insert({ data_gasto: dataGasto, plano_contas_id: conta, valor_total: valor, descricao, comprovado: false, pagador, criado_por: user?.id ?? null, viagem_id: input.viagemId })
      .select("id")
      .single();
    if (error || !desp) return { error: "Item salvo, mas não consegui criar a despesa no Custos.", id: itemId };
    despesaId = desp.id;
  }
  if (!despesaId) return { error: null, id: itemId };

  const resumo = await salvarPagamentoDetalhe(supabase, despesaId, {
    pagamentoDetalheJson: input.custo.pagamentoDetalheJson ?? "",
    dataGasto,
    pagador,
  });
  if (resumo) await supabase.from("despesas").update({ forma_pagamento: resumo }).eq("id", despesaId);

  await supabase.from("viagem_itens").update({ detalhes: { ...det, despesa_id: despesaId } }).eq("id", itemId);
  await dividirPelosParticipantes(supabase, itemId, despesaId);
  revalidatePath(`/viagens/${input.viagemId}`);
  revalidatePath("/custos");
  revalidatePath("/custos/extrato");
  return { error: null, id: itemId };
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

/**
 * Lê o e-ticket direto do arquivo enviado (sem precisar criar viagem antes) — assim só criamos a
 * viagem DEPOIS que a IA leu com sucesso, evitando viagens vazias. Usado na criação por e-ticket.
 */
export async function lerEticketArquivo(formData: FormData): Promise<{ error: string | null; item: ItemViagemExtraido | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada.", item: null };
  if (!leituraViagemConfigurada()) return { error: "Leitura por IA indisponível (falta a chave do Gemini).", item: null };
  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha um arquivo.", item: null };
  if (file.size > 10 * 1024 * 1024) return { error: "Arquivo muito grande para a IA (máx 10 MB).", item: null };
  return lerDocumentoViagem(await file.arrayBuffer(), file.type || "application/pdf");
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

// Conta do plano de contas por tipo de item (classificação pela natureza — não há conta "Viagens").
const CONTA_POR_TIPO: Record<string, string> = {
  voo: "2df5c9c6-d529-4441-9d9a-9da7fff18b94", // 2.3.7 Locomoção e Transporte
  carro: "2df5c9c6-d529-4441-9d9a-9da7fff18b94",
  transporte: "2df5c9c6-d529-4441-9d9a-9da7fff18b94",
  hospedagem: "0096b299-d99d-4499-8599-53bf6bd0624b", // 2.3.8 Alimentação e Hospedagem
  evento: "54c459b5-649d-4a7e-86ca-840eaa6d5e17", // 2.1.8 Feiras e Eventos Setoriais
  seguro: "d893e912-d998-44ad-a249-76f6998355b0", // 2.3.9 Seguros
  outro: "2df5c9c6-d529-4441-9d9a-9da7fff18b94",
};

/**
 * Cria a despesa no Custos (Lançamentos) a partir de um item da viagem, já classificada na conta
 * certa e ligada à viagem. Não duplica: guarda o despesa_id no item. Já sai dividida entre as
 * sócias participantes do item; o acerto com quem pagou vem do fluxo de acertos entre sócias.
 */
export async function lancarDespesaDoItem(itemId: string): Promise<{ error: string | null; despesaId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: item } = await supabase.from("viagem_itens").select("*, viagens(titulo)").eq("id", itemId).maybeSingle();
  if (!item) return { error: "Item não encontrado." };
  const det = (item.detalhes ?? {}) as { valor?: number; despesa_id?: string };
  const valor = Number(det.valor);
  if (!valor || valor <= 0) return { error: "Esse item não tem valor para lançar." };
  if (det.despesa_id) return { error: "Esse item já foi lançado no Custos." };

  const conta = CONTA_POR_TIPO[item.tipo] ?? CONTA_POR_TIPO.outro;
  const dataGasto = hojeSP(); // dia da compra (ao lançar), não da viagem
  const viagemTitulo = (item.viagens as { titulo?: string } | null)?.titulo ?? "";
  const descricao = `Viagem: ${viagemTitulo} — ${item.titulo}`.trim();

  const { data: desp, error } = await supabase
    .from("despesas")
    .insert({ data_gasto: dataGasto, plano_contas_id: conta, valor_total: valor, descricao, comprovado: false, criado_por: user?.id ?? null, viagem_id: item.viagem_id })
    .select("id")
    .single();
  if (error || !desp) return { error: "Não consegui criar a despesa no Custos." };

  await supabase.from("viagem_itens").update({ detalhes: { ...det, despesa_id: desp.id } }).eq("id", itemId);
  await dividirPelosParticipantes(supabase, itemId, desp.id);
  revalidatePath(`/viagens/${item.viagem_id}`);
  revalidatePath("/custos");
  return { error: null, despesaId: desp.id };
}
