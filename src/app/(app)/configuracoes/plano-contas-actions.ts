"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

const TIPOS_VALIDOS = ["receita", "deducao", "cogs", "opex", "financeiro", "capital", "ativo"];
const CLASSIFICACOES_VALIDAS = ["fixa", "variavel"];

function lerCampos(formData: FormData) {
  return {
    codigo: String(formData.get("codigo") || "").trim(),
    conta: String(formData.get("conta") || "").trim(),
    tipo: String(formData.get("tipo") || ""),
    classificacao: String(formData.get("classificacao") || "") || null,
    parent_codigo: String(formData.get("parent_codigo") || "") || null,
    descricao: String(formData.get("descricao") || "").trim() || null,
  };
}

export async function criarContaPlano(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const campos = lerCampos(formData);

  if (!campos.codigo || !campos.conta || !TIPOS_VALIDOS.includes(campos.tipo)) {
    return { error: "Preencha código, nome da conta e tipo." };
  }
  if (campos.classificacao && !CLASSIFICACOES_VALIDAS.includes(campos.classificacao)) {
    return { error: "Classificação inválida." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("plano_contas").insert(campos);

  if (error) {
    if (error.code === "23505") return { error: `Já existe uma conta com o código "${campos.codigo}".` };
    if (error.code === "23503") return { error: "Conta pai não encontrada — confira o código." };
    return { error: "Não foi possível criar a conta." };
  }

  revalidatePath("/configuracoes");
  return { error: null, success: true };
}

export async function atualizarContaPlano(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const campos = lerCampos(formData);

  if (!id || !campos.codigo || !campos.conta || !TIPOS_VALIDOS.includes(campos.tipo)) {
    return { error: "Preencha código, nome da conta e tipo." };
  }
  if (campos.classificacao && !CLASSIFICACOES_VALIDAS.includes(campos.classificacao)) {
    return { error: "Classificação inválida." };
  }
  if (campos.parent_codigo === campos.codigo) {
    return { error: "Uma conta não pode ser pai dela mesma." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("plano_contas").update(campos).eq("id", id);

  if (error) {
    if (error.code === "23505") return { error: `Já existe uma conta com o código "${campos.codigo}".` };
    if (error.code === "23503") return { error: "Conta pai não encontrada — confira o código." };
    return { error: "Não foi possível salvar." };
  }

  revalidatePath("/configuracoes");
  return { error: null, success: true };
}

export async function excluirContaPlano(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("plano_contas").delete().eq("id", id);

  if (error) {
    // 23503 = violação de FK — a conta tem lançamentos (despesas, orçamento de fomento) ou
    // subcontas apontando pra ela. Apagar isso em cascata seria perigoso, então bloqueamos.
    if (error.code === "23503") {
      return { error: "Essa conta tem lançamentos ou subcontas vinculadas — não é possível excluir. Você pode editá-la ou deixá-la sem uso." };
    }
    return { error: "Não foi possível excluir." };
  }

  revalidatePath("/configuracoes");
  return { error: null };
}
