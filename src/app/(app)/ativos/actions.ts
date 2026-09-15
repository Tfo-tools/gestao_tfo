"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cicloValido, datasDasParcelas } from "@/lib/fatura-cartao";

export type AtivoFormState = { error: string | null; success?: boolean };

const LABEL_FORMA: Record<string, string> = {
  cartao_credito_socias: "Cartão de crédito (sócias)",
  cartao_corporativo: "Cartão corporativo",
  debito_conta: "Débito em conta",
  boleto: "Boleto",
  pix: "Pix",
};
const FORMAS_CARTAO = new Set(["cartao_credito_socias", "cartao_corporativo"]);

/** Mesma lógica de despesas (custos/actions.ts): grava a forma de pagamento do ativo e, se for
 * cartão com ciclo informado, calcula em qual(is) fatura(s) a compra cai — gera ativo_parcelas,
 * que alimenta o lembrete de pagamento, e lembra o ciclo (cartão ou sócia) pra próxima vez. */
async function salvarPagamentoAtivo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ativoId: string,
  formData: FormData,
): Promise<string | null> {
  const itensRaw = String(formData.get("pagamento_detalhe") || "");
  if (!itensRaw) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let itens: any[] = [];
  try {
    itens = JSON.parse(itensRaw);
  } catch {
    return null;
  }
  if (!Array.isArray(itens) || itens.length === 0) return null;

  const dataAquisicao = String(formData.get("data_aquisicao") || "");
  const pagador = String(formData.get("pagador") || "").trim();

  await supabase.from("ativos").update({ pagamento_detalhe: itens }).eq("id", ativoId);
  await supabase.from("ativo_parcelas").delete().eq("ativo_id", ativoId).eq("origem", "fatura_cartao");

  if (dataAquisicao) {
    for (const item of itens) {
      if (!FORMAS_CARTAO.has(item.forma) || !cicloValido(item.dia_vencimento, item.dias_fechamento_antes)) continue;
      const numParcelas = item.parcelado ? Math.max(2, Number(item.num_parcelas) || 2) : 1;
      const datas = datasDasParcelas(dataAquisicao, Number(item.dia_vencimento), Number(item.dias_fechamento_antes), numParcelas);
      const valorParcela = Math.round((Number(item.valor) / numParcelas) * 100) / 100;
      await supabase.from("ativo_parcelas").insert(
        datas.map((data_prevista, i) => ({
          ativo_id: ativoId,
          numero_parcela: i + 1,
          valor: i === datas.length - 1 ? Math.round((Number(item.valor) - valorParcela * (datas.length - 1)) * 100) / 100 : valorParcela,
          data_prevista,
          pagador: item.titular || pagador || null,
          origem: "fatura_cartao",
        })),
      );

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

export async function criarAtivo(_prevState: AtivoFormState, formData: FormData): Promise<AtivoFormState> {
  const supabase = await createClient();

  const descricao = String(formData.get("descricao") || "").trim();
  const plano_contas_id = String(formData.get("plano_contas_id") || "");
  const produto_id = String(formData.get("produto_id") || "") || null;
  const valor = Number(formData.get("valor") || 0);
  const data_aquisicao = String(formData.get("data_aquisicao") || "");
  const vidaUtilRaw = String(formData.get("vida_util_meses") || "").trim();
  const vida_util_meses = vidaUtilRaw ? Number(vidaUtilRaw) : null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;
  const pagador = String(formData.get("pagador") || "").trim() || null;

  if (!descricao || !plano_contas_id || !valor || !data_aquisicao) {
    return { error: "Preencha descrição, conta, valor e data." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: ativo, error } = await supabase
    .from("ativos")
    .insert({
      descricao,
      plano_contas_id,
      produto_id,
      valor,
      data_aquisicao,
      vida_util_meses,
      observacoes,
      pagador,
      criado_por: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !ativo) return { error: "Não foi possível salvar o ativo." };

  const resumoPagamento = await salvarPagamentoAtivo(supabase, ativo.id, formData);
  if (resumoPagamento) await supabase.from("ativos").update({ forma_pagamento: resumoPagamento }).eq("id", ativo.id);

  revalidatePath("/ativos");
  return { error: null, success: true };
}

export async function atualizarAtivo(_prevState: AtivoFormState, formData: FormData): Promise<AtivoFormState> {
  const supabase = await createClient();

  const id = String(formData.get("id") || "");
  const descricao = String(formData.get("descricao") || "").trim();
  const plano_contas_id = String(formData.get("plano_contas_id") || "");
  const produto_id = String(formData.get("produto_id") || "") || null;
  const valor = Number(formData.get("valor") || 0);
  const data_aquisicao = String(formData.get("data_aquisicao") || "");
  const vidaUtilRaw = String(formData.get("vida_util_meses") || "").trim();
  const vida_util_meses = vidaUtilRaw ? Number(vidaUtilRaw) : null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;
  const pagador = String(formData.get("pagador") || "").trim() || null;

  if (!id || !descricao || !plano_contas_id || !valor || !data_aquisicao) {
    return { error: "Preencha descrição, conta, valor e data." };
  }

  const resumoPagamento = await salvarPagamentoAtivo(supabase, id, formData);

  const { error } = await supabase
    .from("ativos")
    .update({
      descricao,
      plano_contas_id,
      produto_id,
      valor,
      data_aquisicao,
      vida_util_meses,
      observacoes,
      pagador,
      ...(resumoPagamento ? { forma_pagamento: resumoPagamento } : {}),
    })
    .eq("id", id);

  if (error) return { error: "Não foi possível salvar a alteração." };

  revalidatePath("/ativos");
  return { error: null, success: true };
}

export async function excluirAtivo(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("ativos").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/ativos");
  return { error: null };
}
