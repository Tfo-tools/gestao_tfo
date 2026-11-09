"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomeArquivoSeguro } from "@/lib/nome-arquivo-seguro";
import { lerNotaFiscal, notaIaConfigurada, type NotaExtraida } from "@/lib/custos-ia";

const BUCKET = "comprovantes";
type TipoDoc = "fatura" | "comprovante_pagamento";

/** Link temporário para ver o documento que chegou na caixa de entrada. */
export async function urlDocumentoEntrada(caminho: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(caminho, 60 * 10);
  return error ? null : data.signedUrl;
}

/** Busca despesas pela descrição (as mais recentes), para associar um comprovante que já existe. */
export async function buscarDespesasPorDescricao(termo: string) {
  const supabase = await createClient();
  const t = termo.trim();
  let q = supabase
    .from("despesas")
    .select("id, data_gasto, descricao, valor_total, comprovado, plano_contas:plano_contas_id(codigo, conta)")
    .order("data_gasto", { ascending: false })
    .limit(15);
  if (t) q = q.ilike("descricao", `%${t}%`);
  const { data } = await q;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((d: any) => ({
    id: d.id as string,
    data_gasto: d.data_gasto as string,
    descricao: (d.descricao as string | null) ?? null,
    valor_total: Number(d.valor_total),
    comprovado: !!d.comprovado,
    conta: d.plano_contas ? `${d.plano_contas.codigo} — ${d.plano_contas.conta}` : null,
  }));
}

/** Copia o arquivo da caixa de entrada para os anexos da despesa, no campo certo (Fatura/NF ou
 * Comprovante). Opcionalmente marca a despesa como comprovada. Fecha o item da caixa de entrada. */
export async function associarDocumento(input: {
  docId: string;
  despesaId: string;
  tipo: TipoDoc;
  marcarComprovada: boolean;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: doc } = await supabase
    .from("entrada_documentos")
    .select("caminho_arquivo, nome_arquivo, tipo_mime, tamanho_bytes, status")
    .eq("id", input.docId)
    .maybeSingle();
  if (!doc) return { error: "Documento não encontrado." };
  if (doc.status !== "pendente") return { error: "Esse documento já foi tratado." };

  const nome = nomeArquivoSeguro(doc.nome_arquivo || "documento");
  const destino = `${input.despesaId}/${Date.now()}-${nome}`;
  const { error: copiaErro } = await admin.storage.from(BUCKET).copy(doc.caminho_arquivo, destino);
  if (copiaErro) return { error: "Não consegui anexar o arquivo à despesa." };

  const { error: anexoErro } = await supabase.from("anexos_despesa").insert({
    despesa_id: input.despesaId,
    nome_arquivo: nome,
    caminho_arquivo: destino,
    tipo_mime: doc.tipo_mime,
    tamanho_bytes: doc.tamanho_bytes,
    tipo: input.tipo,
  });
  if (anexoErro) return { error: "Não consegui registrar o anexo." };

  if (input.tipo === "comprovante_pagamento" && input.marcarComprovada) {
    await supabase.from("despesas").update({ comprovado: true }).eq("id", input.despesaId);
  }

  await supabase.from("entrada_documentos").update({ status: "processado", despesa_id: input.despesaId }).eq("id", input.docId);
  await admin.storage.from(BUCKET).remove([doc.caminho_arquivo]);

  revalidatePath("/custos");
  revalidatePath("/custos/extrato");
  return { error: null };
}

/** Lê o documento da caixa de entrada com IA e devolve os campos para um lançamento novo. */
export async function lerDocumentoEntrada(
  docId: string,
): Promise<{ error: string | null; nota?: NotaExtraida & { conta_nome: string | null } }> {
  if (!notaIaConfigurada()) return { error: "Leitura por IA indisponível (falta a chave do Gemini)." };
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: doc } = await supabase.from("entrada_documentos").select("caminho_arquivo, tipo_mime").eq("id", docId).maybeSingle();
  if (!doc) return { error: "Documento não encontrado." };

  const { data: blob, error: downErro } = await admin.storage.from(BUCKET).download(doc.caminho_arquivo);
  if (downErro || !blob) return { error: "Não consegui abrir o arquivo." };

  const { data: contas } = await supabase.from("plano_contas").select("codigo, conta").in("tipo", ["cogs", "opex", "financeiro", "ativo"]).order("codigo");
  const lista = (contas ?? []) as { codigo: string; conta: string }[];
  const r = await lerNotaFiscal(await blob.arrayBuffer(), doc.tipo_mime || "application/pdf", lista);
  if (r.error || !r.nota) return { error: r.error ?? "Não consegui ler o documento." };
  const conta_nome = r.nota.conta_codigo ? lista.find((c) => c.codigo === r.nota!.conta_codigo)?.conta ?? null : null;
  return { error: null, nota: { ...r.nota, conta_nome } };
}

/** Cria a despesa a partir do documento e anexa o arquivo no campo certo. Fecha o item da entrada. */
export async function lancarDoDocumento(input: {
  docId: string;
  tipo: TipoDoc;
  data_gasto: string;
  plano_contas_id: string;
  valor_total: number;
  descricao: string | null;
  pagador: string | null;
}): Promise<{ error: string | null }> {
  if (!input.data_gasto || !input.plano_contas_id || !input.valor_total) {
    return { error: "Preencha data, categoria e valor." };
  }
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: doc } = await supabase
    .from("entrada_documentos")
    .select("caminho_arquivo, nome_arquivo, tipo_mime, tamanho_bytes, status")
    .eq("id", input.docId)
    .maybeSingle();
  if (!doc) return { error: "Documento não encontrado." };
  if (doc.status !== "pendente") return { error: "Esse documento já foi tratado." };

  // Comprovante = prova de pagamento → despesa já nasce comprovada; fatura/NF entra como pendente.
  const comprovado = input.tipo === "comprovante_pagamento";
  const { data: despesa, error } = await supabase
    .from("despesas")
    .insert({
      data_gasto: input.data_gasto,
      plano_contas_id: input.plano_contas_id,
      valor_total: input.valor_total,
      descricao: input.descricao,
      comprovado,
      pagador: input.pagador,
      criado_por: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !despesa) return { error: "Não consegui criar a despesa." };

  const nome = nomeArquivoSeguro(doc.nome_arquivo || "documento");
  const destino = `${despesa.id}/${Date.now()}-${nome}`;
  const { error: copiaErro } = await admin.storage.from(BUCKET).copy(doc.caminho_arquivo, destino);
  if (!copiaErro) {
    await supabase.from("anexos_despesa").insert({
      despesa_id: despesa.id,
      nome_arquivo: nome,
      caminho_arquivo: destino,
      tipo_mime: doc.tipo_mime,
      tamanho_bytes: doc.tamanho_bytes,
      tipo: input.tipo,
    });
    await admin.storage.from(BUCKET).remove([doc.caminho_arquivo]);
  }

  await supabase.from("entrada_documentos").update({ status: "processado", despesa_id: despesa.id }).eq("id", input.docId);

  revalidatePath("/custos");
  revalidatePath("/custos/extrato");
  return { error: null };
}

/** Descarta um documento da caixa de entrada (apaga o arquivo e fecha o item). */
export async function descartarDocumento(docId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: doc } = await supabase.from("entrada_documentos").select("caminho_arquivo, status").eq("id", docId).maybeSingle();
  if (!doc) return { error: "Documento não encontrado." };
  if (doc.caminho_arquivo) await admin.storage.from(BUCKET).remove([doc.caminho_arquivo]);
  await supabase.from("entrada_documentos").update({ status: "descartado" }).eq("id", docId);
  revalidatePath("/custos");
  return { error: null };
}
