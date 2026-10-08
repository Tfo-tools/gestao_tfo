"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AVISO_SEM_BANCO_COMERCIAL, createComercialClient } from "@/lib/supabase/comercial";
import { carregarBasesProposta } from "@/lib/precificacao-bases";
import { calcularProposta, type Desconto, type Pagamento, type PerfilCliente, type Selecao } from "@/lib/precificacao";

export type DadosProposta = {
  marca: string; contato: string | null; email: string | null; telefone: string | null; origem: string | null;
  perfil: PerfilCliente; selecao: Selecao; pagamento: Pagamento; desconto: Desconto; observacoes: string | null;
};

/**
 * Duas conexões por action: `supabase` (sessão do Gestão) diz quem é a pessoa e lê catálogo,
 * parâmetros e bases do plano; `db` (banco comercial = Supabase do Forms, service role) guarda as
 * propostas. Sem sessão válida nada acontece.
 */
async function contexto() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada — entre de novo." as string | null, supabase, db: null, user: null, nome: "", socia: false };
  const db = createComercialClient();
  if (!db) return { erro: AVISO_SEM_BANCO_COMERCIAL as string | null, supabase, db: null, user, nome: "", socia: false };
  const { data: perfil } = await supabase.from("profiles").select("nome, papel").eq("id", user.id).maybeSingle();
  return { erro: null as string | null, supabase, db, user, nome: perfil?.nome ?? user.email ?? "", socia: perfil?.papel === "socia" };
}

/**
 * Salva a proposta recalculando no servidor e guardando a CÓPIA dos valores usados (resultado).
 * Situação inicial: rascunho; "enviar para validação" muda para aguardando_aprovacao quando o
 * desconto sai da tabela comercial, ou aprovada direto quando está dentro.
 */
export async function salvarProposta(id: string | null, dados: DadosProposta): Promise<{ error: string | null; id?: string }> {
  const marca = dados.marca.trim();
  if (!marca) return { error: "Informe a marca." };
  const c = await contexto();
  if (c.erro || !c.db || !c.user) return { error: c.erro ?? "Sem acesso." };
  const bases = await carregarBasesProposta(c.supabase);
  const resultado = calcularProposta({ perfil: dados.perfil, selecao: dados.selecao, pagamento: dados.pagamento, desconto: dados.desconto, modulos: bases.modulos, blocos: bases.blocos, params: bases.params, bases: bases.bases });
  const linha = {
    marca, contato: dados.contato, email: dados.email, telefone: dados.telefone, origem: dados.origem,
    perfil: dados.perfil, selecao: dados.selecao, pagamento: dados.pagamento, desconto: dados.desconto,
    resultado: { ...resultado, bases: bases.bases, params_usados: bases.params, cenario: bases.cenario, mes: bases.mes, calculado_em: new Date().toISOString() },
    observacoes: dados.observacoes, atualizado_em: new Date().toISOString(),
  };
  if (id) {
    const { data: atual } = await c.db.from("propostas").select("status").eq("id", id).maybeSingle();
    if (atual && !["rascunho", "aguardando_aprovacao"].includes(atual.status)) return { error: "Proposta já aprovada ou enviada: crie uma nova a partir dela." };
    const { error } = await c.db.from("propostas").update({ ...linha, status: "rascunho" }).eq("id", id);
    if (error) return { error: "Não foi possível salvar." };
    revalidatePath("/propostas");
    return { error: null, id };
  }
  const { data, error } = await c.db.from("propostas").insert({ ...linha, criado_por: c.user.id, criado_por_nome: c.nome }).select("id").single();
  if (error || !data) return { error: "Não foi possível criar a proposta." };
  revalidatePath("/propostas");
  return { error: null, id: data.id };
}

/** Rascunho → validação: dentro da tabela comercial vira aprovada; fora, aguarda Vanessa ou Emyli. */
export async function enviarParaValidacao(id: string): Promise<{ error: string | null; status?: string }> {
  const c = await contexto();
  if (c.erro || !c.db || !c.user) return { error: c.erro ?? "Sem acesso." };
  const { data: p } = await c.db.from("propostas").select("status, resultado").eq("id", id).maybeSingle();
  if (!p) return { error: "Proposta não encontrada." };
  const sit = (p.resultado as { desconto_situacao?: string })?.desconto_situacao;
  if (sit === "bloqueado") return { error: "Desconto abaixo do piso sem margem: ajuste antes de enviar." };
  const status = sit === "precisa_aprovacao" ? "aguardando_aprovacao" : "aprovada";
  const agora = new Date().toISOString();
  const { error } = await c.db
    .from("propostas")
    .update({ status, ...(status === "aprovada" ? { aprovada_por: c.user.id, aprovada_por_nome: c.nome, aprovada_em: agora } : {}), atualizado_em: agora })
    .eq("id", id);
  if (error) return { error: "Não foi possível enviar para validação." };
  revalidatePath("/propostas");
  return { error: null, status };
}

/** Só sócias aprovam ou devolvem o que saiu da tabela comercial. */
export async function decidirAprovacao(id: string, aprovar: boolean): Promise<{ error: string | null }> {
  const c = await contexto();
  if (c.erro || !c.db || !c.user) return { error: c.erro ?? "Sem acesso." };
  if (!c.socia) return { error: "Só as sócias aprovam propostas fora da tabela comercial." };
  const agora = new Date().toISOString();
  const { error } = await c.db
    .from("propostas")
    .update(aprovar ? { status: "aprovada", aprovada_por: c.user.id, aprovada_por_nome: c.nome, aprovada_em: agora, atualizado_em: agora } : { status: "rascunho", atualizado_em: agora })
    .eq("id", id)
    .eq("status", "aguardando_aprovacao");
  if (error) return { error: "Não foi possível registrar a decisão." };
  revalidatePath("/propostas");
  return { error: null };
}

export async function mudarStatusProposta(id: string, status: "enviada" | "aceita" | "recusada" | "vencida"): Promise<{ error: string | null }> {
  const c = await contexto();
  if (c.erro || !c.db) return { error: c.erro ?? "Sem acesso." };
  const agora = new Date().toISOString();
  const extra = status === "enviada" ? { enviada_em: agora } : { decidida_em: agora };
  const { error } = await c.db.from("propostas").update({ status, ...extra, atualizado_em: agora }).eq("id", id);
  if (error) return { error: "Não foi possível mudar a situação." };
  revalidatePath("/propostas");
  return { error: null };
}

export async function excluirProposta(id: string): Promise<{ error: string | null }> {
  const c = await contexto();
  if (c.erro || !c.db) return { error: c.erro ?? "Sem acesso." };
  const { error } = await c.db.from("propostas").delete().eq("id", id).in("status", ["rascunho", "recusada", "vencida"]);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/propostas");
  return { error: null };
}
