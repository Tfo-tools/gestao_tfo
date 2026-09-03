"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const path = `${despesaId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("comprovantes").upload(path, file, { contentType: file.type });
  if (uploadError) return;
  await supabase.from("anexos_despesa").insert({
    despesa_id: despesaId,
    nome_arquivo: file.name,
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
  const fatura = formData.get("fatura") as File | null;
  const comprovantePagamento = formData.get("comprovante_pagamento") as File | null;

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
  const dia_do_mes = Number(formData.get("dia_do_mes") || 5);
  const data_inicio = String(formData.get("data_inicio") || "") || new Date().toISOString().slice(0, 10);
  const data_fim = String(formData.get("data_fim") || "") || null;

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

  const { error } = await supabase
    .from("despesas")
    .update({ data_gasto, plano_contas_id, produto_id: produtoIds[0] ?? null, valor_total, descricao, comprovado, pagador })
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

  revalidatePath("/custos/extrato");
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

export async function getSignedUrl(path: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("comprovantes")
    .createSignedUrl(path, 60 * 5);

  if (error) return null;
  return data.signedUrl;
}
