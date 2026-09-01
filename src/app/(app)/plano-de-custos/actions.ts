"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FASES, type FaseValue } from "@/lib/fases";

export type ActionState = { error: string | null; success?: boolean };

async function getOrCreateFaseId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  produto_id: string,
  cenario_id: string,
  fase: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("fases_produto")
    .select("id")
    .eq("produto_id", produto_id)
    .eq("cenario_id", cenario_id)
    .eq("fase", fase)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("fases_produto")
    .insert({ produto_id, cenario_id, fase })
    .select("id")
    .single();

  return created?.id ?? null;
}

export async function criarCustoFixo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const fase = String(formData.get("fase") || "");
  const item = String(formData.get("item") || "").trim();
  const plano_contas_id = String(formData.get("plano_contas_id") || "") || null;
  const quantidade = Number(formData.get("quantidade") || 1);
  const valor_unitario = Number(formData.get("valor_unitario") || 0);

  if (!produto_id || !cenario_id || !fase || !item || !valor_unitario) {
    return { error: "Preencha item e valor." };
  }

  const supabase = await createClient();
  const faseProdutoId = await getOrCreateFaseId(supabase, produto_id, cenario_id, fase);
  if (!faseProdutoId) return { error: "Não foi possível preparar a fase." };

  const { error } = await supabase.from("plano_custos_fixos").insert({
    fase_produto_id: faseProdutoId,
    plano_contas_id,
    tipo: "estrutura",
    item,
    quantidade,
    valor_unitario,
  });

  if (error) return { error: "Não foi possível salvar o custo." };

  revalidatePath(`/plano-de-custos/${produto_id}`);
  return { error: null, success: true };
}

export async function excluirCustoFixo(id: string, produtoId: string) {
  const supabase = await createClient();
  await supabase.from("plano_custos_fixos").delete().eq("id", id);
  revalidatePath(`/plano-de-custos/${produtoId}`);
}

export async function criarCustoVariavel(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const fase = String(formData.get("fase") || "");
  const item = String(formData.get("item") || "").trim();
  const plano_contas_id = String(formData.get("plano_contas_id") || "") || null;
  const tipo_calculo = String(formData.get("tipo_calculo") || "");
  const valor_base = formData.get("valor_base") ? Number(formData.get("valor_base")) : null;
  const percentual = formData.get("percentual") ? Number(formData.get("percentual")) / 100 : null;
  const valor_por_unidade = formData.get("valor_por_unidade") ? Number(formData.get("valor_por_unidade")) : null;

  if (!produto_id || !cenario_id || !fase || !item || !tipo_calculo) {
    return { error: "Preencha item e tipo de cálculo." };
  }

  const supabase = await createClient();
  const faseProdutoId = await getOrCreateFaseId(supabase, produto_id, cenario_id, fase);
  if (!faseProdutoId) return { error: "Não foi possível preparar a fase." };

  const { error } = await supabase.from("plano_custos_variaveis").insert({
    fase_produto_id: faseProdutoId,
    plano_contas_id,
    item,
    tipo_calculo,
    valor_base,
    percentual,
    valor_por_unidade,
  });

  if (error) return { error: "Não foi possível salvar o custo." };

  revalidatePath(`/plano-de-custos/${produto_id}`);
  return { error: null, success: true };
}

export async function excluirCustoVariavel(id: string, produtoId: string) {
  const supabase = await createClient();
  await supabase.from("plano_custos_variaveis").delete().eq("id", id);
  revalidatePath(`/plano-de-custos/${produtoId}`);
}

export async function copiarCustosFaseAnterior(
  produtoId: string,
  cenarioId: string,
  faseAtual: FaseValue,
): Promise<ActionState> {
  const idxAtual = FASES.findIndex((f) => f.value === faseAtual);
  if (idxAtual <= 0) return { error: "Não há fase anterior para copiar." };

  const supabase = await createClient();

  // Procura, andando pra trás, a fase anterior mais próxima que já tenha custos cadastrados.
  let faseOrigemId: string | null = null;
  for (let i = idxAtual - 1; i >= 0; i--) {
    const { data } = await supabase
      .from("fases_produto")
      .select("id")
      .eq("produto_id", produtoId)
      .eq("cenario_id", cenarioId)
      .eq("fase", FASES[i].value)
      .maybeSingle();
    if (data) {
      faseOrigemId = data.id;
      break;
    }
  }
  if (!faseOrigemId) return { error: "Nenhuma fase anterior cadastrada ainda." };

  const [{ data: fixos }, { data: variaveis }, { data: alocacoes }] = await Promise.all([
    supabase
      .from("plano_custos_fixos")
      .select("plano_contas_id, tipo, item, quantidade, valor_unitario")
      .eq("fase_produto_id", faseOrigemId),
    supabase
      .from("plano_custos_variaveis")
      .select("plano_contas_id, item, tipo_calculo, valor_base, percentual, valor_por_unidade")
      .eq("fase_produto_id", faseOrigemId),
    supabase
      .from("equipe_alocada")
      .select("cargo, categoria, quantidade_funcionarios, horas_mes, custo_hora")
      .eq("fase_produto_id", faseOrigemId),
  ]);

  if ((fixos?.length ?? 0) === 0 && (variaveis?.length ?? 0) === 0 && (alocacoes?.length ?? 0) === 0) {
    return { error: "A fase anterior não tem custos para copiar." };
  }

  const faseDestinoId = await getOrCreateFaseId(supabase, produtoId, cenarioId, faseAtual);
  if (!faseDestinoId) return { error: "Não foi possível preparar a fase." };

  await Promise.all([
    fixos && fixos.length > 0
      ? supabase.from("plano_custos_fixos").insert(fixos.map((f) => ({ ...f, fase_produto_id: faseDestinoId })))
      : Promise.resolve(),
    variaveis && variaveis.length > 0
      ? supabase.from("plano_custos_variaveis").insert(variaveis.map((v) => ({ ...v, fase_produto_id: faseDestinoId })))
      : Promise.resolve(),
    alocacoes && alocacoes.length > 0
      ? supabase.from("equipe_alocada").insert(alocacoes.map((a) => ({ ...a, fase_produto_id: faseDestinoId })))
      : Promise.resolve(),
  ]);

  revalidatePath(`/plano-de-custos/${produtoId}`);
  return { error: null, success: true };
}
