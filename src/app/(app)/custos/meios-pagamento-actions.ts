"use server";

import { createClient } from "@/lib/supabase/server";

export type MeioPagamento = {
  id: string;
  banco: string;
  tipo: "conta" | "cartao";
  titular_tipo: "pessoa" | "empresa";
  titular_pessoa_id: string | null;
  bandeira: string | null;
};

export async function criarMeioPagamento(input: {
  banco: string;
  tipo: "conta" | "cartao";
  titular_tipo: "pessoa" | "empresa";
  titular_pessoa_id: string | null;
  bandeira: string | null;
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
    })
    .select("id, banco, tipo, titular_tipo, titular_pessoa_id, bandeira")
    .single();

  if (error || !data) return { error: "Não foi possível cadastrar." };
  return { error: null, meio: data as MeioPagamento };
}
