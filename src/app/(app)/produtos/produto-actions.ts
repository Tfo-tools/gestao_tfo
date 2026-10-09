"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { enviarPush } from "@/lib/push";
import type { FasesDatas, TesteProduto, CrescimentoFases } from "@/lib/fases-lancamento";
import type { PerfilSimulado } from "@/lib/perfis";

async function socia() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false };
  const { data: perfil } = await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle();
  return { supabase, ok: perfil?.papel === "socia" };
}

function revalida() {
  revalidatePath("/realizado/produtos");
  revalidatePath("/realizado/cogs");
  revalidatePath("/plano", "layout");
  revalidatePath("/propostas", "layout");
}

type Linha = { tipo: "modulo" | "bloco"; id: string };
const tabela = (t: "modulo" | "bloco") => (t === "modulo" ? "catalogo_modulos" : "catalogo_blocos");

/** Aba 1 — datas das fases de lançamento por funcionalidade. */
export async function salvarFases(itens: (Linha & { fases_datas: FasesDatas })[]): Promise<{ error: string | null }> {
  const { supabase, ok } = await socia();
  if (!ok) return { error: "Só as sócias editam o produto." };
  for (const it of itens) {
    const { error } = await supabase.from(tabela(it.tipo)).update({ fases_datas: it.fases_datas ?? {} }).eq("id", it.id);
    if (error) return { error: `Não foi possível salvar as fases: ${error.message}` };
  }
  revalida();
  return { error: null };
}

/** Aba 2 — plano de testes por funcionalidade. */
export async function salvarTestes(itens: (Linha & { teste: TesteProduto })[]): Promise<{ error: string | null }> {
  const { supabase, ok } = await socia();
  if (!ok) return { error: "Só as sócias editam o produto." };
  for (const it of itens) {
    const t = it.teste ?? {};
    const limpo: TesteProduto = {
      beta_testers: t.beta_testers != null && Number.isFinite(Number(t.beta_testers)) ? Math.max(0, Math.round(Number(t.beta_testers))) : null,
      inicio: t.inicio || null,
      fim: t.fim || null,
      modelo: t.modelo === "pago" ? "pago" : "gratuito",
      valor: t.modelo === "pago" && t.valor != null && Number.isFinite(Number(t.valor)) ? Number(t.valor) : null,
    };
    const { error } = await supabase.from(tabela(it.tipo)).update({ teste: limpo }).eq("id", it.id);
    if (error) return { error: `Não foi possível salvar os testes: ${error.message}` };
  }
  revalida();
  return { error: null };
}

/** Aba 4 — crescimento e churn por fase (PMF→Maturidade), por funcionalidade. */
export async function salvarCrescimentoFases(itens: (Linha & { crescimento_fases: CrescimentoFases })[]): Promise<{ error: string | null }> {
  const { supabase, ok } = await socia();
  if (!ok) return { error: "Só as sócias editam o produto." };
  for (const it of itens) {
    const { error } = await supabase.from(tabela(it.tipo)).update({ crescimento_fases: it.crescimento_fases ?? {} }).eq("id", it.id);
    if (error) return { error: `Não foi possível salvar o crescimento: ${error.message}` };
  }
  revalida();
  return { error: null };
}

const numOrNull = (v: unknown) => (v == null || v === ("" as unknown) || !Number.isFinite(Number(v)) ? null : Number(v));

/** Aba 3 — cria ou atualiza um perfil de cliente. */
export async function salvarPerfil(p: Partial<PerfilSimulado> & { id?: string }): Promise<{ error: string | null; id?: string }> {
  const { supabase, ok } = await socia();
  if (!ok) return { error: "Só as sócias editam os perfis." };
  const row = {
    codigo: (p.codigo ?? "").trim(),
    nome: (p.nome ?? "").trim(),
    descricao: p.descricao ?? null,
    ordem: Number(p.ordem) || 0,
    ativo: p.ativo ?? true,
    participacao_pct: Math.max(0, Number(p.participacao_pct) || 0),
    faturamento_anual: numOrNull(p.faturamento_anual),
    producao_anual_pecas: numOrNull(p.producao_anual_pecas),
    compra_pronto_pecas: numOrNull(p.compra_pronto_pecas),
    lojas: Number(p.lojas) || 0,
    usuarios: Number(p.usuarios) || 0,
    preco_medio: numOrNull(p.preco_medio),
    atacado: !!p.atacado,
    ecommerce: !!p.ecommerce,
    tem_erp_qualidade: !!p.tem_erp_qualidade,
    tem_pcp: !!p.tem_pcp,
    tem_plm: !!p.tem_plm,
    integracao_pronta: !!p.integracao_pronta,
    canais: p.canais ?? {},
    sistema: p.sistema ?? null,
  };
  if (!row.codigo || !row.nome) return { error: "Código e nome do perfil são obrigatórios." };
  if (p.id) {
    const { error } = await supabase.from("perfis_cliente").update(row).eq("id", p.id);
    if (error) return { error: error.message };
    revalida();
    return { error: null, id: p.id };
  }
  const { data, error } = await supabase.from("perfis_cliente").insert(row).select("id").single();
  if (error) return { error: error.message };
  revalida();
  return { error: null, id: data?.id };
}

/** Aba 3 — salva vários perfis de uma vez (participação, números, subparticipação). */
export async function salvarPerfis(perfis: (Partial<PerfilSimulado> & { id: string })[]): Promise<{ error: string | null }> {
  for (const p of perfis) {
    const r = await salvarPerfil(p);
    if (r.error) return { error: r.error };
  }
  return { error: null };
}

/** Estrutura — adiciona uma funcionalidade (bloco) a um módulo. */
export async function adicionarFuncionalidade(modulo_id: string, nome = "Nova funcionalidade"): Promise<{ error: string | null; id?: string }> {
  const { supabase, ok } = await socia();
  if (!ok) return { error: "Só as sócias editam o produto." };
  const { data: ult } = await supabase.from("catalogo_blocos").select("ordem").eq("modulo_id", modulo_id).order("ordem", { ascending: false }).limit(1).maybeSingle();
  const ordem = (Number(ult?.ordem) || 0) + 1;
  const { data, error } = await supabase
    .from("catalogo_blocos")
    .insert({ modulo_id, nome, ordem, ativo: true, peso_pct: 0, adesao_pct: 1, custo_processamento_mes: 0, proc_fracao_volume: 1 })
    .select("id")
    .single();
  if (error) return { error: error.message };
  // Pendência: a funcionalidade nasce com custo zero no COGS; avisa as sócias por push pra preencher.
  const { data: socias } = await supabase.from("profiles").select("id").eq("papel", "socia");
  const ids = ((socias ?? []) as { id: string }[]).map((s) => s.id);
  if (ids.length) await enviarPush(ids, { title: "Nova funcionalidade sem custo", body: `Defina o processamento de "${nome}" no COGS → Infra.`, url: "/realizado/cogs" });
  revalida();
  return { error: null, id: data?.id };
}

/** COGS/Infra — salva o processamento por funcionalidade (período, dias, fração do volume). */
export async function salvarProcFuncionalidades(
  itens: { id: string; proc_periodo: string | null; proc_dias: number | null; proc_fracao_volume: number | null; custo_processamento_mes: number | null }[],
): Promise<{ error: string | null }> {
  const { supabase, ok } = await socia();
  if (!ok) return { error: "Só as sócias editam o COGS." };
  for (const it of itens) {
    const { error } = await supabase
      .from("catalogo_blocos")
      .update({
        proc_periodo: it.proc_periodo || null,
        proc_dias: it.proc_dias == null || !Number.isFinite(Number(it.proc_dias)) ? null : Number(it.proc_dias),
        proc_fracao_volume: it.proc_fracao_volume == null || !Number.isFinite(Number(it.proc_fracao_volume)) ? 1 : Number(it.proc_fracao_volume),
        custo_processamento_mes: it.custo_processamento_mes == null || !Number.isFinite(Number(it.custo_processamento_mes)) ? 0 : Number(it.custo_processamento_mes),
      })
      .eq("id", it.id);
    if (error) return { error: error.message };
  }
  revalida();
  return { error: null };
}

/** Estrutura — renomeia uma funcionalidade. */
export async function renomearFuncionalidade(id: string, nome: string): Promise<{ error: string | null }> {
  const { supabase, ok } = await socia();
  if (!ok) return { error: "Só as sócias editam o produto." };
  const { error } = await supabase.from("catalogo_blocos").update({ nome: nome.trim() || "Sem nome" }).eq("id", id);
  if (error) return { error: error.message };
  revalida();
  return { error: null };
}

/** Estrutura — exclui uma funcionalidade. */
export async function excluirFuncionalidade(id: string): Promise<{ error: string | null }> {
  const { supabase, ok } = await socia();
  if (!ok) return { error: "Só as sócias editam o produto." };
  const { error } = await supabase.from("catalogo_blocos").delete().eq("id", id);
  if (error) return { error: error.message };
  revalida();
  return { error: null };
}

export async function excluirPerfil(id: string): Promise<{ error: string | null }> {
  const { supabase, ok } = await socia();
  if (!ok) return { error: "Só as sócias editam os perfis." };
  const { error } = await supabase.from("perfis_cliente").delete().eq("id", id);
  if (error) return { error: error.message };
  revalida();
  return { error: null };
}
