"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cicloValido, datasDasParcelas } from "@/lib/fatura-cartao";

const FORMAS_CARTAO = new Set(["cartao_credito_socias", "cartao_corporativo"]);

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

const LABEL_FORMA: Record<string, string> = {
  cartao_credito_socias: "Cartão de crédito (sócias)",
  cartao_corporativo: "Cartão corporativo",
  debito_conta: "Débito em conta",
  boleto: "Boleto",
  pix: "Pix",
};

/** Resumo curto da forma de pagamento a partir do JSON do modal — usado pra despesas avulsas
 * (junto com despesa_pagamentos) e também pra recorrentes, que não têm join table própria. */
function resumoFormaPagamento(formData: FormData): { resumo: string | null; detalheJson: string | null } {
  const itensRaw = String(formData.get("pagamento_detalhe") || "");
  if (!itensRaw) return { resumo: null, detalheJson: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let itens: any[] = [];
  try {
    itens = JSON.parse(itensRaw);
  } catch {
    return { resumo: null, detalheJson: null };
  }
  if (!Array.isArray(itens) || itens.length === 0) return { resumo: null, detalheJson: null };
  const resumo = itens.length === 1 ? (LABEL_FORMA[itens[0].forma] ?? itens[0].forma) : `Combinada (${itens.length} formas)`;
  return { resumo, detalheJson: itensRaw };
}

/** Lê o JSON do modal de forma de pagamento (itens) e, se a despesa foi marcada comprovada, o de
 * efetivação (onde cada item não-cartão efetivamente saiu) — substitui as linhas antigas de
 * despesa_pagamentos pelas novas e devolve um resumo curto pra salvar em despesas.forma_pagamento
 * (só pra exibição rápida em telas que não detalham). */
async function salvarPagamentoDetalhe(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  despesaId: string,
  formData: FormData,
): Promise<string | null> {
  const itensRaw = String(formData.get("pagamento_detalhe") || "");
  const efetivacaoRaw = String(formData.get("efetivacao_detalhe") || "");
  if (!itensRaw) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let itens: any[] = [];
  try {
    itens = JSON.parse(itensRaw);
  } catch {
    return null;
  }
  if (!Array.isArray(itens) || itens.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let efetivacao: Record<string, any> = {};
  if (efetivacaoRaw) {
    try {
      efetivacao = JSON.parse(efetivacaoRaw);
    } catch {
      efetivacao = {};
    }
  }

  const dataGasto = String(formData.get("data_gasto") || formData.get("data_inicio") || "");
  const pagador = String(formData.get("pagador") || "").trim();

  await supabase.from("despesa_pagamentos").delete().eq("despesa_id", despesaId);

  const linhas = itens.map((item, idx) => {
    const efet = efetivacao[String(idx)] ?? efetivacao[idx];
    return {
      despesa_id: despesaId,
      forma_pagamento: item.forma,
      valor: Number(item.valor) || 0,
      banco: item.banco || null,
      bandeira: item.bandeira || null,
      titular: item.titular || null,
      parcelado: !!item.parcelado,
      num_parcelas: item.parcelado ? Number(item.num_parcelas) || null : null,
      codigo: item.codigo || null,
      meio_pagamento_id: item.meio_pagamento_id || null,
      dia_vencimento: FORMAS_CARTAO.has(item.forma) && item.dia_vencimento ? Number(item.dia_vencimento) : null,
      dias_fechamento_antes:
        FORMAS_CARTAO.has(item.forma) && item.dias_fechamento_antes != null ? Number(item.dias_fechamento_antes) : null,
      efetivado_banco: efet?.banco || null,
      efetivado_conta: efet?.conta || null,
      efetivado_data: efet?.data || null,
      efetivado_obs: efet?.observacao || null,
    };
  });

  await supabase.from("despesa_pagamentos").insert(linhas);

  // Fatura do cartão: com o ciclo (vencimento + dias antes do fechamento) e a data do gasto, dá
  // pra calcular em qual(is) fatura(s) a compra cai — vira o cronograma em despesa_parcelas, que é
  // o que alimenta o lembrete de pagamento (diferente da data do gasto, que pode ser retroativa).
  await supabase.from("despesa_parcelas").delete().eq("despesa_id", despesaId).eq("origem", "fatura_cartao");
  if (dataGasto) {
    for (const item of itens) {
      if (!FORMAS_CARTAO.has(item.forma) || !cicloValido(item.dia_vencimento, item.dias_fechamento_antes)) continue;
      const numParcelas = item.parcelado ? Math.max(2, Number(item.num_parcelas) || 2) : 1;
      const datas = datasDasParcelas(dataGasto, Number(item.dia_vencimento), Number(item.dias_fechamento_antes), numParcelas);
      const valorParcela = Math.round((Number(item.valor) / numParcelas) * 100) / 100;
      await supabase.from("despesa_parcelas").insert(
        datas.map((data_prevista, i) => ({
          despesa_id: despesaId,
          numero_parcela: i + 1,
          valor: i === datas.length - 1 ? Math.round((Number(item.valor) - valorParcela * (datas.length - 1)) * 100) / 100 : valorParcela,
          data_prevista,
          pagador: item.titular || pagador || null,
          origem: "fatura_cartao",
        })),
      );

      // O ciclo digitado vira o padrão da próxima vez — no cartão específico (empresa) ou no
      // cartão pessoal da sócia que pagou (sem precisar detalhar banco).
      if (item.meio_pagamento_id) {
        await supabase
          .from("meios_pagamento")
          .update({ dia_vencimento: Number(item.dia_vencimento), dias_fechamento_antes: Number(item.dias_fechamento_antes) })
          .eq("id", item.meio_pagamento_id);
      } else if (pagador) {
        const { data: perfil } = await supabase.from("profiles").select("id").eq("nome", pagador).maybeSingle();
        if (perfil)
          await supabase
            .from("profiles")
            .update({ cartao_dia_vencimento: Number(item.dia_vencimento), cartao_dias_fechamento_antes: Number(item.dias_fechamento_antes) })
            .eq("id", perfil.id);
      }
    }
  }

  if (itens.length === 1) return LABEL_FORMA[itens[0].forma] ?? itens[0].forma;
  return `Combinada (${itens.length} formas)`;
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

  const resumoPagamento = await salvarPagamentoDetalhe(supabase, despesa.id, formData);
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
  const { resumo: resumoPagamentoRec, detalheJson: pagamento_detalhe } = resumoFormaPagamento(formData);

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
  const { resumo: resumoPagamentoRec2, detalheJson: pagamento_detalhe2 } = resumoFormaPagamento(formData);

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

  const resumoPagamento = await salvarPagamentoDetalhe(supabase, id, formData);

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

export async function getSignedUrl(path: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("comprovantes")
    .createSignedUrl(path, 60 * 5);

  if (error) return null;
  return data.signedUrl;
}
