"use server";

import { createClient } from "@/lib/supabase/server";

export type MeioPagamento = {
  id: string;
  banco: string;
  tipo: "conta" | "cartao";
  titular_tipo: "pessoa" | "empresa";
  titular_pessoa_id: string | null;
  bandeira: string | null;
  /** Ciclo da fatura (só cartão): dia de vencimento e quantos dias antes ela fecha. */
  dia_vencimento?: number | null;
  dias_fechamento_antes?: number | null;
  /** Conta específica de um programa (o Centelha exige uma): o que sai dela comprova o programa. */
  programa_id?: string | null;
};

export async function criarMeioPagamento(input: {
  banco: string;
  tipo: "conta" | "cartao";
  titular_tipo: "pessoa" | "empresa";
  titular_pessoa_id: string | null;
  bandeira: string | null;
  programa_id?: string | null;
}): Promise<{ error: string | null; meio?: MeioPagamento }> {
  const banco = input.banco.trim();
  if (!banco) return { error: "Informe o banco." };
  if (input.titular_tipo === "pessoa" && !input.titular_pessoa_id) {
    return { error: "Selecione de quem é." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meios_pagamento")
    .insert({
      banco,
      tipo: input.tipo,
      titular_tipo: input.titular_tipo,
      titular_pessoa_id: input.titular_tipo === "pessoa" ? input.titular_pessoa_id : null,
      bandeira: input.tipo === "cartao" ? input.bandeira?.trim() || null : null,
      programa_id: input.tipo === "conta" ? input.programa_id || null : null,
    })
    .select("id, banco, tipo, titular_tipo, titular_pessoa_id, bandeira, dia_vencimento, dias_fechamento_antes, programa_id")
    .single();

  if (error || !data) return { error: "Não foi possível cadastrar." };
  return { error: null, meio: data as MeioPagamento };
}
