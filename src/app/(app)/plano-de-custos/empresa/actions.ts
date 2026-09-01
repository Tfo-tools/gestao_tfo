"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TipoCustoEmpresa } from "@/lib/custos-empresa";
import { FASES } from "@/lib/fases";

export type ActionState = { error: string | null; success?: boolean };

type ResultadoParametros = { ok: true; parametros: Record<string, unknown> } | { ok: false; erro: string };

function montarParametrosEscalonado(formData: FormData): ResultadoParametros {
  const baseado_em = String(formData.get("baseado_em") || "receita");
  const parametros: Record<string, unknown> = { baseado_em };

  if (baseado_em === "fase") {
    const produto_referencia_id = String(formData.get("produto_referencia_id") || "");
    if (!produto_referencia_id) return { ok: false, erro: "Selecione o produto de referência da fase da empresa." };
    const faixasPorFase = FASES.map((f) => {
      const raw = formData.get(`fase_${f.value}`);
      return raw !== null && raw !== "" ? { fase: f.value, valor: Number(raw) } : null;
    }).filter((f): f is { fase: (typeof FASES)[number]["value"]; valor: number } => f !== null);
    if (faixasPorFase.length === 0) return { ok: false, erro: "Informe o valor de ao menos uma fase." };
    parametros.produto_referencia_id = produto_referencia_id;
    parametros.faixasPorFase = faixasPorFase;
    return { ok: true, parametros };
  }

  const minimos = formData.getAll("faixa_minimo").map(Number);
  const maximos = formData.getAll("faixa_maximo").map((v) => (v === "" ? null : Number(v)));
  const valores = formData.getAll("faixa_valor").map(Number);
  const faixas = minimos.map((minimo, i) => ({ minimo, maximo: maximos[i], valor: valores[i] })).filter((f) => !isNaN(f.minimo) && !isNaN(f.valor));
  if (faixas.length === 0) return { ok: false, erro: "Adicione ao menos uma faixa." };
  parametros.faixas = faixas;
  return { ok: true, parametros };
}

function montarParametros(formData: FormData, tipo_custo: TipoCustoEmpresa): ResultadoParametros {
  if (tipo_custo === "escalonado") return montarParametrosEscalonado(formData);

  const parametros: Record<string, unknown> = {};
  if (tipo_custo === "cronograma") {
    const mes_inicio = String(formData.get("mes_inicio") || "");
    const valoresRaw = String(formData.get("valores_mensais") || "");
    if (!mes_inicio || !valoresRaw) return { ok: false, erro: "Preencha o mês de início e os valores mensais." };
    const valores_mensais = valoresRaw
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => !isNaN(v));
    if (valores_mensais.length === 0) return { ok: false, erro: "Informe os valores mensais separados por vírgula." };
    parametros.mes_inicio = mes_inicio;
    parametros.valores_mensais = valores_mensais;
  } else if (tipo_custo === "variavel_receita") {
    const pct = formData.get("percentual");
    if (!pct) return { ok: false, erro: "Informe o percentual sobre a receita." };
    parametros.percentual = Number(pct) / 100;
  } else if (tipo_custo === "variavel_cliente") {
    const valorCliente = formData.get("valor_por_cliente");
    if (!valorCliente) return { ok: false, erro: "Informe o valor por cliente." };
    parametros.valor_por_cliente = Number(valorCliente);
  }
  return { ok: true, parametros };
}

export async function criarCustoEmpresa(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const cenario_id = String(formData.get("cenario_id") || "");
  const item = String(formData.get("item") || "").trim();
  const plano_contas_id = String(formData.get("plano_contas_id") || "") || null;
  const tipo_custo = String(formData.get("tipo_custo") || "") as TipoCustoEmpresa;
  const data_inicio = String(formData.get("data_inicio") || "") || null;
  const data_fim = String(formData.get("data_fim") || "") || null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!cenario_id || !item || !tipo_custo) {
    return { error: "Preencha item e tipo de custo." };
  }

  let valor_mensal: number | null = null;
  if (tipo_custo === "fixo") {
    valor_mensal = Number(formData.get("valor_mensal") || 0);
    if (!valor_mensal) return { error: "Informe o valor mensal." };
  }

  const resultado = montarParametros(formData, tipo_custo);
  if (!resultado.ok) return { error: resultado.erro };
  const { parametros } = resultado;

  const supabase = await createClient();
  const { error } = await supabase.from("custos_empresa").insert({
    cenario_id,
    item,
    plano_contas_id,
    tipo_custo,
    valor_mensal,
    data_inicio,
    data_fim,
    parametros,
    observacoes,
  });

  if (error) {
    return { error: "Não foi possível salvar o custo." };
  }

  revalidatePath("/plano-de-custos/empresa");
  revalidatePath("/relatorios");
  return { error: null, success: true };
}

export async function atualizarCustoEmpresa(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const item = String(formData.get("item") || "").trim();
  const plano_contas_id = String(formData.get("plano_contas_id") || "") || null;
  const tipo_custo = String(formData.get("tipo_custo") || "") as TipoCustoEmpresa;
  const data_inicio = String(formData.get("data_inicio") || "") || null;
  const data_fim = String(formData.get("data_fim") || "") || null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!id || !item || !tipo_custo) {
    return { error: "Preencha item e tipo de custo." };
  }

  let valor_mensal: number | null = null;
  if (tipo_custo === "fixo") {
    valor_mensal = Number(formData.get("valor_mensal") || 0);
    if (!valor_mensal) return { error: "Informe o valor mensal." };
  }

  const resultado = montarParametros(formData, tipo_custo);
  if (!resultado.ok) return { error: resultado.erro };
  const { parametros } = resultado;

  const supabase = await createClient();
  const { error } = await supabase
    .from("custos_empresa")
    .update({ item, plano_contas_id, tipo_custo, valor_mensal, data_inicio, data_fim, parametros, observacoes })
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível salvar o custo." };
  }

  revalidatePath("/plano-de-custos/empresa");
  revalidatePath("/relatorios");
  return { error: null, success: true };
}

export async function excluirCustoEmpresa(id: string) {
  const supabase = await createClient();
  await supabase.from("custos_empresa").delete().eq("id", id);
  revalidatePath("/plano-de-custos/empresa");
  revalidatePath("/relatorios");
}
