"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { congelarPlanoDoMes } from "@/lib/acompanhamento-plano";
import { nomeArquivoSeguro } from "@/lib/nome-arquivo-seguro";
import { lerNotaFiscal, notaIaConfigurada, type NotaExtraida } from "@/lib/custos-ia";
import { salvarPagamentoDetalhe, resumoFormaPagamentoJson } from "@/lib/pagamento-detalhe";

/** Lê uma nota/comprovante com IA e devolve os campos pra preencher o lançamento (data/valor/
 * descrição) + sugestão de conta. A sócia confere tudo antes de salvar. */
export async function lerNotaDespesa(formData: FormData): Promise<{ error: string | null; nota?: NotaExtraida & { conta_nome: string | null } }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };
  if (!notaIaConfigurada()) return { error: "Leitura por IA indisponível (falta a chave do Gemini)." };
  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha um arquivo." };
  if (file.size > 10 * 1024 * 1024) return { error: "Arquivo muito grande para ler pela IA (máx 10 MB)." };
  const { data: contas } = await supabase.from("plano_contas").select("codigo, conta").in("tipo", ["cogs", "opex", "financeiro", "ativo"]).order("codigo");
  const lista = (contas ?? []) as { codigo: string; conta: string }[];
  const r = await lerNotaFiscal(await file.arrayBuffer(), file.type || "application/pdf", lista);
  if (r.error || !r.nota) return { error: r.error ?? "Não consegui ler a nota." };
  const conta_nome = r.nota.conta_codigo ? lista.find((c) => c.codigo === r.nota!.conta_codigo)?.conta ?? null : null;
  return { error: null, nota: { ...r.nota, conta_nome } };
}

export type DespesaFormState = { error: string | null; success?: boolean };

function inicioDoMes(dataIso: string) {
  return `${dataIso.slice(0, 7)}-01`;
}

async function mesFechado(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dataGasto: string,
): Promise<boolean> {
  const { data } = await supabase.from("meses_fechados").select("mes").eq("mes", inicioDoMes(dataGasto)).maybeSingle();
  return !!data;
}

type TipoAnexo = "fatura" | "comprovante_pagamento";

async function anexarArquivo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  despesaId: string,
  file: File | null,
  tipo: TipoAnexo,
) {
  if (!file || file.size === 0) return;
  const nome = nomeArquivoSeguro(file.name);
  const path = `${despesaId}/${Date.now()}-${nome}`;
  const { error: uploadError } = await supabase.storage.from("comprovantes").upload(path, file, { contentType: file.type });
  if (uploadError) return;
  await supabase.from("anexos_despesa").insert({
    despesa_id: despesaId,
    nome_arquivo: nome,
    caminho_arquivo: path,
    tipo_mime: file.type,
    tamanho_bytes: file.size,
    tipo,
  });
}

/** Único ponto de entrada do formulário de lançamento — decide entre um lançamento avulso e uma
 * despesa recorrente pelo campo "recorrente" (checkbox), pra não precisar de duas telas/decisões
 * separadas. */
export async function criarLancamento(
  _prevState: DespesaFormState,
  formData: FormData,
): Promise<DespesaFormState> {
  const recorrente = formData.get("recorrente") === "on";
  return recorrente ? criarRecorrente(formData) : criarDespesaAvulsa(formData);
}

async function criarDespesaAvulsa(formData: FormData): Promise<DespesaFormState> {
  const supabase = await createClient();

  const data_gasto = String(formData.get("data_gasto") || "");
  const plano_contas_id = String(formData.get("plano_contas_id") || "");
  const produtoIds = formData.getAll("produtos").map(String).filter(Boolean);
  const valor_total = Number(formData.get("valor_total") || 0);
  const descricao = String(formData.get("descricao") || "") || null;
  const comprovado = formData.get("comprovado") === "on";
  const pagador = String(formData.get("pagador") || "").trim() || null;
  const forma_pagamento = String(formData.get("forma_pagamento") || "").trim() || null;
  const valorFaturaRaw = String(formData.get("valor_fatura") || "").trim();
  const valor_fatura = valorFaturaRaw ? Number(valorFaturaRaw) : null;
  const fatura = formData.get("fatura") as File | null;
  const comprovantePagamento = formData.get("comprovante_pagamento") as File | null;
  // Programa que a despesa comprova (pago com o recurso dele) — define o "usado" da prestação.
  const programa_id = String(formData.get("programa_id") || "") || null;

  if (!data_gasto || !plano_contas_id || !valor_total) {
    return { error: "Preencha data, categoria e valor." };
  }

  if (await mesFechado(supabase, data_gasto)) {
    return { error: "Esse mês já foi fechado — reabra em Extrato antes de lançar algo nele." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: despesa, error } = await supabase
    .from("despesas")
    .insert({
      data_gasto,
      plano_contas_id,
      produto_id: produtoIds[0] ?? null,
      valor_total,
      descricao,
      comprovado,
      pagador,
      forma_pagamento,
      valor_fatura,
      programa_id,
      criado_por: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !despesa) {
    return { error: "Não foi possível salvar a despesa." };
  }

  if (produtoIds.length > 0) {
    await supabase.from("despesa_produtos").insert(produtoIds.map((produto_id) => ({ despesa_id: despesa.id, produto_id })));
  }

  const resumoPagamento = await salvarPagamentoDetalhe(supabase, despesa.id, {
    pagamentoDetalheJson: String(formData.get("pagamento_detalhe") || ""),
    efetivacaoJson: String(formData.get("efetivacao_detalhe") || ""),
    dataGasto: data_gasto,
    pagador,
  });
  if (resumoPagamento) await supabase.from("despesas").update({ forma_pagamento: resumoPagamento }).eq("id", despesa.id);

  await anexarArquivo(supabase, despesa.id, fatura, "fatura");
  await anexarArquivo(supabase, despesa.id, comprovantePagamento, "comprovante_pagamento");

  revalidatePath("/custos");
  revalidatePath("/custos/extrato");
  revalidatePath("/");
  return { error: null, success: true };
}

async function criarRecorrente(formData: FormData): Promise<DespesaFormState> {
  const supabase = await createClient();

  const plano_contas_id = String(formData.get("plano_contas_id") || "");
  const produtoIds = formData.getAll("produtos").map(String).filter(Boolean);
  const descricao = String(formData.get("descricao") || "").trim();
  const valor = Number(formData.get("valor_total") || 0);
  const pagador = String(formData.get("pagador") || "").trim() || null;
  const forma_pagamento = String(formData.get("forma_pagamento") || "").trim() || null;
  const dia_do_mes = Number(formData.get("dia_do_mes") || 5);
  const data_inicio = String(formData.get("data_inicio") || "") || new Date().toISOString().slice(0, 10);
  const data_fim = String(formData.get("data_fim") || "") || null;
  const { resumo: resumoPagamentoRec, detalheJson: pagamento_detalhe } = resumoFormaPagamentoJson(String(formData.get("pagamento_detalhe") || ""));

  if (!plano_contas_id || !descricao || !valor) {
    return { error: "Preencha categoria, descrição e valor." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: recorrente, error } = await supabase
    .from("despesas_recorrentes")
    .insert({
      plano_contas_id,
      produto_id: produtoIds[0] ?? null,
      descricao,
      valor,
      pagador,
      forma_pagamento: resumoPagamentoRec ?? forma_pagamento,
      pagamento_detalhe: pagamento_detalhe ? JSON.parse(pagamento_detalhe) : null,
      dia_do_mes,
      data_inicio,
      data_fim,
      criado_por: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !recorrente) return { error: "Não foi possível salvar a despesa recorrente." };

  if (produtoIds.length > 0) {
    await supabase
      .from("despesa_recorrente_produtos")
      .insert(produtoIds.map((produto_id) => ({ despesa_recorrente_id: recorrente.id, produto_id })));
  }

  revalidatePath("/custos");
  revalidatePath("/custos/recorrentes");
  return { error: null, success: true };
}

export async function atualizarRecorrente(
  _prevState: DespesaFormState,
  formData: FormData,
): Promise<DespesaFormState> {
  const supabase = await createClient();

  const id = String(formData.get("id") || "");
  const plano_contas_id = String(formData.get("plano_contas_id") || "");
  const produtoIds = formData.getAll("produtos").map(String).filter(Boolean);
  const descricao = String(formData.get("descricao") || "").trim();
  const valor = Number(formData.get("valor") || 0);
  const pagador = String(formData.get("pagador") || "").trim() || null;
  const forma_pagamento = String(formData.get("forma_pagamento") || "").trim() || null;
  const dia_do_mes = Number(formData.get("dia_do_mes") || 5);
  const data_inicio = String(formData.get("data_inicio") || "");
  const data_fim = String(formData.get("data_fim") || "") || null;
  const { resumo: resumoPagamentoRec2, detalheJson: pagamento_detalhe2 } = resumoFormaPagamentoJson(String(formData.get("pagamento_detalhe") || ""));

  if (!id || !plano_contas_id || !descricao || !valor || !data_inicio) {
    return { error: "Preencha categoria, descrição, valor e data de início." };
  }

  const { error } = await supabase
    .from("despesas_recorrentes")
    .update({
      plano_contas_id,
      produto_id: produtoIds[0] ?? null,
      descricao,
      valor,
      pagador,
      forma_pagamento: resumoPagamentoRec2 ?? forma_pagamento,
      pagamento_detalhe: pagamento_detalhe2 ? JSON.parse(pagamento_detalhe2) : null,
      dia_do_mes,
      data_inicio,
      data_fim,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: "Não foi possível salvar a alteração." };

  await supabase.from("despesa_recorrente_produtos").delete().eq("despesa_recorrente_id", id);
  if (produtoIds.length > 0) {
    await supabase.from("despesa_recorrente_produtos").insert(produtoIds.map((produto_id) => ({ despesa_recorrente_id: id, produto_id })));
  }

  revalidatePath("/custos/recorrentes");
  return { error: null, success: true };
}

export async function atualizarDespesa(
  _prevState: DespesaFormState,
  formData: FormData,
): Promise<DespesaFormState> {
  const supabase = await createClient();

  const id = String(formData.get("id") || "");
  const data_gasto = String(formData.get("data_gasto") || "");
  const plano_contas_id = String(formData.get("plano_contas_id") || "");
  const produtoIds = formData.getAll("produtos").map(String).filter(Boolean);
  const valor_total = Number(formData.get("valor_total") || 0);
  const descricao = String(formData.get("descricao") || "") || null;
  const comprovado = formData.get("comprovado") === "on";
  const pagador = String(formData.get("pagador") || "").trim() || null;
  const forma_pagamento = String(formData.get("forma_pagamento") || "").trim() || null;
  const valorFaturaRaw = String(formData.get("valor_fatura") || "").trim();
  const valor_fatura = valorFaturaRaw ? Number(valorFaturaRaw) : null;
  const fatura = formData.get("fatura") as File | null;
  const comprovantePagamento = formData.get("comprovante_pagamento") as File | null;

  if (!id || !data_gasto || !plano_contas_id || !valor_total) {
    return { error: "Preencha data, categoria e valor." };
  }

  const { data: atual } = await supabase.from("despesas").select("data_gasto").eq("id", id).single();
  if (!atual) return { error: "Despesa não encontrada." };

  if ((await mesFechado(supabase, atual.data_gasto)) || (await mesFechado(supabase, data_gasto))) {
    return { error: "Esse mês está fechado — reabra em Extrato antes de editar." };
  }

  const resumoPagamento = await salvarPagamentoDetalhe(supabase, id, {
    pagamentoDetalheJson: String(formData.get("pagamento_detalhe") || ""),
    efetivacaoJson: String(formData.get("efetivacao_detalhe") || ""),
    dataGasto: data_gasto,
    pagador,
  });

  const { error } = await supabase
    .from("despesas")
    .update({
      data_gasto,
      plano_contas_id,
      produto_id: produtoIds[0] ?? null,
      valor_total,
      descricao,
      comprovado,
      pagador,
      forma_pagamento: resumoPagamento ?? forma_pagamento,
      valor_fatura,
      ...(formData.has("programa_id") ? { programa_id: String(formData.get("programa_id") || "") || null } : {}),
    })
    .eq("id", id);

  if (error) return { error: "Não foi possível salvar a alteração." };

  await supabase.from("despesa_produtos").delete().eq("despesa_id", id);
  if (produtoIds.length > 0) {
    await supabase.from("despesa_produtos").insert(produtoIds.map((produto_id) => ({ despesa_id: id, produto_id })));
  }

  await anexarArquivo(supabase, id, fatura, "fatura");
  await anexarArquivo(supabase, id, comprovantePagamento, "comprovante_pagamento");

  revalidatePath("/custos");
  revalidatePath("/custos/extrato");
  revalidatePath("/custos/recorrentes");
  revalidatePath("/");
  return { error: null, success: true };
}

export async function excluirDespesa(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: atual } = await supabase.from("despesas").select("data_gasto").eq("id", id).single();
  if (!atual) return { error: "Despesa não encontrada." };
  if (await mesFechado(supabase, atual.data_gasto)) {
    return { error: "Esse mês está fechado — reabra em Extrato antes de excluir." };
  }

  const { error } = await supabase.from("despesas").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };

  revalidatePath("/custos");
  revalidatePath("/custos/extrato");
  revalidatePath("/custos/recorrentes");
  revalidatePath("/");
  return { error: null };
}

export async function fecharMes(mes: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("meses_fechados").insert({ mes: `${mes}-01`, fechado_por: user?.id ?? null });
  if (error) return { error: "Não foi possível fechar o mês." };

  // O mês fechado vira realizado no plano oficial: guarda o plano dele como estava hoje, pra o
  // comparativo não mudar quando o plano for revisado. Falha aqui não impede o fechamento.
  try {
    await congelarPlanoDoMes(supabase, `${mes}-01`, user?.id ?? null);
  } catch (e) {
    console.error("Plano do mês não guardado", e);
  }

  revalidatePath("/custos/extrato");
  revalidatePath("/relatorios");
  revalidatePath("/indicadores");
  return { error: null };
}

export async function reabrirMes(mes: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("meses_fechados").delete().eq("mes", `${mes}-01`);
  if (error) return { error: "Não foi possível reabrir o mês." };

  revalidatePath("/custos/extrato");
  return { error: null };
}

export type ParcelaFormState = { error: string | null; success?: boolean };

export async function criarParcelaDespesa(
  _prevState: ParcelaFormState,
  formData: FormData,
): Promise<ParcelaFormState> {
  const supabase = await createClient();

  const despesa_id = String(formData.get("despesa_id") || "");
  const numero_parcela = Number(formData.get("numero_parcela") || 1);
  const valor = Number(formData.get("valor") || 0);
  const data_prevista = String(formData.get("data_prevista") || "");
  const pagador = String(formData.get("pagador") || "").trim() || null;

  if (!despesa_id || !valor || !data_prevista) {
    return { error: "Preencha valor e data prevista." };
  }

  const { error } = await supabase.from("despesa_parcelas").insert({
    despesa_id,
    numero_parcela,
    valor,
    data_prevista,
    pagador,
  });

  if (error) return { error: "Não foi possível salvar a parcela." };

  revalidatePath("/custos/extrato");
  revalidatePath("/custos");
  return { error: null, success: true };
}

export async function marcarParcelaPaga(id: string, paga: boolean, pagador: string | null) {
  const supabase = await createClient();
  await supabase
    .from("despesa_parcelas")
    .update({
      status: paga ? "paga" : "prevista",
      paga_em: paga ? new Date().toISOString().slice(0, 10) : null,
      ...(paga && pagador ? { pagador } : {}),
    })
    .eq("id", id);
  revalidatePath("/custos/extrato");
  revalidatePath("/custos");
}

export async function excluirParcelaDespesa(id: string) {
  const supabase = await createClient();
  await supabase.from("despesa_parcelas").delete().eq("id", id);
  revalidatePath("/custos/extrato");
  revalidatePath("/custos");
}

/** Divide o valor da despesa igualmente entre as duas primeiras sócias da lista de pagadores —
 * usa o mesmo mecanismo de despesa_parcelas (já marcadas como pagas) pra alimentar o rateio entre
 * sócias que já existe no Extrato. Chamar de novo substitui a divisão anterior. */
export async function ratearIgualmente(despesaId: string, valorTotal: number, dataGasto: string, pagadores: string[]): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const dupla = pagadores.slice(0, 2);
  if (dupla.length < 2) return { error: "É preciso ter pelo menos duas sócias cadastradas pra ratear." };

  await supabase.from("despesa_parcelas").delete().eq("despesa_id", despesaId);
  const metade = Math.round((valorTotal / 2) * 100) / 100;
  const { error } = await supabase.from("despesa_parcelas").insert([
    { despesa_id: despesaId, numero_parcela: 1, valor: metade, data_prevista: dataGasto, pagador: dupla[0], status: "paga", paga_em: dataGasto },
    {
      despesa_id: despesaId,
      numero_parcela: 2,
      valor: Math.round((valorTotal - metade) * 100) / 100,
      data_prevista: dataGasto,
      pagador: dupla[1],
      status: "paga",
      paga_em: dataGasto,
    },
  ]);
  if (error) return { error: "Não foi possível ratear essa despesa." };

  revalidatePath("/custos/extrato");
  revalidatePath("/custos");
  return { error: null };
}

export async function desfazerRateio(despesaId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("despesa_parcelas").delete().eq("despesa_id", despesaId);
  if (error) return { error: "Não foi possível desfazer o rateio." };

  revalidatePath("/custos/extrato");
  revalidatePath("/custos");
  return { error: null };
}

/** Reclassifica um anexo pra Fatura ou Comprovante — corrige tanto quando o arquivo foi anexado no
 * campo errado (sobe a NF no lugar do comprovante ou vice-versa) quanto o "documento" genérico de
 * uploads antigos (a extinta tela de pendentes de Recorrentes salvava assim, sem diferenciar). */
export async function trocarTipoAnexo(id: string, novoTipo: string): Promise<{ error: string | null }> {
  if (novoTipo !== "fatura" && novoTipo !== "comprovante_pagamento") {
    return { error: "Tipo inválido." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("anexos_despesa").update({ tipo: novoTipo }).eq("id", id);
  if (error) return { error: "Não foi possível trocar." };
  revalidatePath("/custos");
  revalidatePath("/custos/extrato");
  revalidatePath("/custos/recorrentes");
  return { error: null };
}

export async function excluirAnexo(id: string, path: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  await supabase.storage.from("comprovantes").remove([path]);
  const { error } = await supabase.from("anexos_despesa").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir o arquivo." };
  revalidatePath("/custos");
  revalidatePath("/custos/extrato");
  revalidatePath("/custos/recorrentes");
  return { error: null };
}

export async function getSignedUrl(path: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("comprovantes")
    .createSignedUrl(path, 60 * 5);

  if (error) return null;
  return data.signedUrl;
}
