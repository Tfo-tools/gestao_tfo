"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RecorrenteFormState = { error: string | null; success?: boolean };

export async function criarRecorrente(_prevState: RecorrenteFormState, formData: FormData): Promise<RecorrenteFormState> {
  const supabase = await createClient();

  const plano_contas_id = String(formData.get("plano_contas_id") || "");
  const produto_id = String(formData.get("produto_id") || "") || null;
  const descricao = String(formData.get("descricao") || "").trim();
  const valor = Number(formData.get("valor") || 0);
  const pagador = String(formData.get("pagador") || "").trim() || null;
  const dia_do_mes = Number(formData.get("dia_do_mes") || 5);
  const data_inicio = String(formData.get("data_inicio") || "") || new Date().toISOString().slice(0, 10);

  if (!plano_contas_id || !descricao || !valor) {
    return { error: "Preencha a conta, a descrição e o valor." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("despesas_recorrentes").insert({
    plano_contas_id,
    produto_id,
    descricao,
    valor,
    pagador,
    dia_do_mes,
    data_inicio,
    criado_por: user?.id ?? null,
  });

  if (error) return { error: "Não foi possível salvar a despesa recorrente." };

  revalidatePath("/custos/recorrentes");
  return { error: null, success: true };
}

export async function alternarRecorrente(id: string, ativo: boolean) {
  const supabase = await createClient();
  await supabase.from("despesas_recorrentes").update({ ativo, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/custos/recorrentes");
}

export type AnexoFormState = { error: string | null; success?: boolean };

export async function anexarComprovantePendente(_prevState: AnexoFormState, formData: FormData): Promise<AnexoFormState> {
  const supabase = await createClient();

  const despesaId = String(formData.get("despesa_id") || "");
  const pagador = String(formData.get("pagador") || "").trim() || null;
  const file = formData.get("comprovante") as File | null;

  if (!despesaId || !file || file.size === 0) {
    return { error: "Selecione um arquivo (foto, PDF, JPG ou PNG)." };
  }

  const path = `${despesaId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("comprovantes").upload(path, file, { contentType: file.type });

  if (uploadError) return { error: "Não foi possível enviar o arquivo." };

  await supabase.from("anexos_despesa").insert({
    despesa_id: despesaId,
    nome_arquivo: file.name,
    caminho_arquivo: path,
    tipo_mime: file.type,
    tamanho_bytes: file.size,
  });

  const atualizacao: { comprovado: boolean; pagador?: string | null } = { comprovado: true };
  if (pagador) atualizacao.pagador = pagador;
  await supabase.from("despesas").update(atualizacao).eq("id", despesaId);

  revalidatePath("/custos/recorrentes");
  revalidatePath("/custos/extrato");
  revalidatePath("/custos");
  return { error: null, success: true };
}
