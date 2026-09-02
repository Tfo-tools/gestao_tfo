"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

export async function salvarFase(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const fase = String(formData.get("fase") || "");

  if (!produto_id || !cenario_id || !fase) {
    return { error: "Dados incompletos." };
  }

  const pct = (name: string) => {
    const v = formData.get(name);
    return v !== null && v !== "" ? Number(v) / 100 : null;
  };
  const num = (name: string) => {
    const v = formData.get(name);
    return v !== null && v !== "" ? Number(v) : null;
  };
  const str = (name: string) => {
    const v = String(formData.get(name) || "").trim();
    return v || null;
  };

  const supabase = await createClient();

  const { data: faseRow, error } = await supabase
    .from("fases_produto")
    .upsert(
      {
        produto_id,
        cenario_id,
        fase,
        data_inicio: str("data_inicio"),
        data_fim: str("data_fim"),
        taxa_crescimento_mensal: pct("taxa_crescimento_mensal"),
        taxa_churn_mensal: pct("taxa_churn_mensal"),
        observacoes: str("observacoes"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "produto_id,cenario_id,fase" },
    )
    .select("id")
    .single();

  if (error || !faseRow) {
    return { error: "Não foi possível salvar a fase." };
  }

  // Funil de vendas dessa fase — mesma tela, mesmo submit (não faz sentido lançar separado).
  const taxaConversaoRaw = formData.get("taxa_conversao");
  const capacidadeRaw = formData.get("capacidade_vendedor_mes");
  if (taxaConversaoRaw && capacidadeRaw) {
    const { error: funilError } = await supabase.from("premissas_funil").upsert(
      {
        fase_produto_id: faseRow.id,
        taxa_conversao: Number(taxaConversaoRaw) / 100,
        capacidade_vendedor_mes: Number(capacidadeRaw),
        span_of_control: formData.get("span_of_control") ? Number(formData.get("span_of_control")) : 8,
        horas_suporte_por_cliente_mes: formData.get("horas_suporte_por_cliente_mes")
          ? Number(formData.get("horas_suporte_por_cliente_mes"))
          : null,
      },
      { onConflict: "fase_produto_id" },
    );
    if (funilError) return { error: "Fase salva, mas não foi possível salvar o funil dessa fase." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  revalidatePath("/contratacoes/necessidade");
  revalidatePath("/relatorios");
  return { error: null, success: true };
}

export async function criarBetaProduto(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const quantidade = Number(formData.get("quantidade") || 0);
  const data_inicio = String(formData.get("data_inicio") || "") || null;
  const data_fim = String(formData.get("data_fim") || "") || null;
  const tipo = String(formData.get("tipo") || "mvp_inicial");
  const condicaoEspecialPct = formData.get("condicao_especial_pct");
  const condicao_especial_pct = condicaoEspecialPct !== null && condicaoEspecialPct !== "" ? Number(condicaoEspecialPct) / 100 : null;
  const condicao_especial_meses = formData.get("condicao_especial_meses") ? Number(formData.get("condicao_especial_meses")) : null;

  if (!produto_id || !cenario_id || !quantidade) {
    return { error: "Preencha a quantidade de beta testers." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("beta_testers_config").insert({
    produto_id,
    cenario_id,
    quantidade,
    data_inicio,
    data_fim,
    tipo,
    condicao_especial_pct,
    condicao_especial_meses,
  });

  if (error) {
    return { error: "Não foi possível salvar o beta." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export async function excluirBetaProduto(id: string, produtoId: string) {
  const supabase = await createClient();
  await supabase.from("beta_testers_config").delete().eq("id", id);
  revalidatePath(`/produtos/${produtoId}`);
}

export async function atualizarBetaProduto(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const produto_id = String(formData.get("produto_id") || "");
  const quantidade = Number(formData.get("quantidade") || 0);
  const data_inicio = String(formData.get("data_inicio") || "") || null;
  const data_fim = String(formData.get("data_fim") || "") || null;
  const tipo = String(formData.get("tipo") || "mvp_inicial");
  const condicaoEspecialPct = formData.get("condicao_especial_pct");
  const condicao_especial_pct = condicaoEspecialPct !== null && condicaoEspecialPct !== "" ? Number(condicaoEspecialPct) / 100 : null;
  const condicao_especial_meses = formData.get("condicao_especial_meses") ? Number(formData.get("condicao_especial_meses")) : null;

  if (!id || !produto_id || !quantidade) {
    return { error: "Preencha a quantidade de beta testers." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("beta_testers_config")
    .update({ quantidade, data_inicio, data_fim, tipo, condicao_especial_pct, condicao_especial_meses })
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível salvar o beta." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export async function criarPlano(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const nome_plano = String(formData.get("nome_plano") || "").trim();
  const tipo_cobranca = String(formData.get("tipo_cobranca") || "");
  const tipo_venda = String(formData.get("tipo_venda") || "individual");
  const preco = Number(formData.get("preco") || 0);
  const desconto_pct = formData.get("desconto_pct") ? Number(formData.get("desconto_pct")) : 0;
  const is_annual_only = formData.get("is_annual_only") === "on";
  const mix_percentual = formData.get("mix_percentual") ? Number(formData.get("mix_percentual")) : null;
  const reajuste_anual_pct = formData.get("reajuste_anual_pct")
    ? Number(formData.get("reajuste_anual_pct")) / 100
    : null;

  if (!produto_id || !nome_plano || !tipo_cobranca || !preco) {
    return { error: "Preencha nome do plano, cobrança e preço." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("planos_precificacao").insert({
    produto_id,
    nome_plano,
    tipo_cobranca,
    tipo_venda,
    preco,
    desconto_pct,
    is_annual_only,
    mix_percentual,
    reajuste_anual_pct,
  });

  if (error) {
    return { error: "Não foi possível salvar o plano." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export async function criarPrecoFase(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const plano_id = String(formData.get("plano_id") || "");
  const produto_id = String(formData.get("produto_id") || "");
  const fase = String(formData.get("fase") || "");
  const preco = Number(formData.get("preco") || 0);

  if (!plano_id || !fase || !preco) {
    return { error: "Selecione o plano, a fase e o preço." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("planos_precificacao_fases")
    .upsert({ plano_id, fase, preco }, { onConflict: "plano_id,fase" });

  if (error) {
    return { error: "Não foi possível salvar o preço da fase." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export async function excluirPrecoFase(precoFaseId: string, produtoId: string) {
  const supabase = await createClient();
  await supabase.from("planos_precificacao_fases").delete().eq("id", precoFaseId);
  revalidatePath(`/produtos/${produtoId}`);
}

export async function criarModulo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const nome = String(formData.get("nome") || "").trim();
  const preco = Number(formData.get("preco") || 0);
  const gatilho = String(formData.get("gatilho") || "fase");
  const fase_lancamento = gatilho === "fase" ? String(formData.get("fase_lancamento") || "") || null : null;
  const meses_apos_lancamento =
    gatilho === "tempo" && formData.get("meses_apos_lancamento")
      ? Number(formData.get("meses_apos_lancamento"))
      : null;
  const adesao_inicial_pct = formData.get("adesao_inicial_pct")
    ? Number(formData.get("adesao_inicial_pct")) / 100
    : 0;
  const crescimento_adesao_mensal_pct = formData.get("crescimento_adesao_mensal_pct")
    ? Number(formData.get("crescimento_adesao_mensal_pct")) / 100
    : 0;

  if (!produto_id || !nome || !preco || (!fase_lancamento && meses_apos_lancamento == null)) {
    return { error: "Preencha nome, preço e a fase (ou o tempo) de lançamento do módulo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("modulos_produto").insert({
    produto_id,
    nome,
    preco,
    fase_lancamento,
    meses_apos_lancamento,
    adesao_inicial_pct,
    crescimento_adesao_mensal_pct,
  });

  if (error) {
    return { error: "Não foi possível salvar o módulo." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export async function excluirModulo(moduloId: string, produtoId: string) {
  const supabase = await createClient();
  await supabase.from("modulos_produto").delete().eq("id", moduloId);
  revalidatePath(`/produtos/${produtoId}`);
}

export async function criarBetaModulo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const modulo_id = String(formData.get("modulo_id") || "");
  const produto_id = String(formData.get("produto_id") || "");
  const quantidade = Number(formData.get("quantidade") || 0);
  const data_inicio = String(formData.get("data_inicio") || "") || null;
  const data_fim = String(formData.get("data_fim") || "") || null;
  const condicaoEspecialPct = formData.get("condicao_especial_pct");
  const condicao_especial_pct = condicaoEspecialPct !== null && condicaoEspecialPct !== "" ? Number(condicaoEspecialPct) / 100 : null;
  const condicao_especial_meses = formData.get("condicao_especial_meses") ? Number(formData.get("condicao_especial_meses")) : null;

  if (!modulo_id || !quantidade) {
    return { error: "Preencha a quantidade de beta testers do módulo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("beta_testers_modulo").insert({
    modulo_id,
    quantidade,
    data_inicio,
    data_fim,
    condicao_especial_pct,
    condicao_especial_meses,
  });

  if (error) {
    return { error: "Não foi possível salvar o beta do módulo." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export async function excluirBetaModulo(id: string, produtoId: string) {
  const supabase = await createClient();
  await supabase.from("beta_testers_modulo").delete().eq("id", id);
  revalidatePath(`/produtos/${produtoId}`);
}

export async function criarProduto(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const nome = String(formData.get("nome") || "").trim();
  const descricao = String(formData.get("descricao") || "").trim() || null;
  const data_inicio_desenvolvimento = String(formData.get("data_inicio_desenvolvimento") || "") || null;
  const data_lancamento_estimada = String(formData.get("data_lancamento_estimada") || "") || null;

  if (!nome) {
    return { error: "Dê um nome para o produto." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("produtos").insert({
    nome,
    descricao,
    data_inicio_desenvolvimento,
    data_lancamento_estimada,
  });

  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Já existe um produto com esse nome."
        : "Não foi possível criar o produto.",
    };
  }

  revalidatePath("/produtos");
  revalidatePath("/");
  return { error: null, success: true };
}

export async function excluirPlano(planoId: string, produtoId: string) {
  const supabase = await createClient();
  await supabase.from("planos_precificacao").delete().eq("id", planoId);
  revalidatePath(`/produtos/${produtoId}`);
}

export async function atualizarPlano(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const produto_id = String(formData.get("produto_id") || "");
  const nome_plano = String(formData.get("nome_plano") || "").trim();
  const tipo_cobranca = String(formData.get("tipo_cobranca") || "");
  const tipo_venda = String(formData.get("tipo_venda") || "individual");
  const preco = Number(formData.get("preco") || 0);
  const desconto_pct = formData.get("desconto_pct") ? Number(formData.get("desconto_pct")) : 0;
  const is_annual_only = formData.get("is_annual_only") === "on";
  const mix_percentual = formData.get("mix_percentual") ? Number(formData.get("mix_percentual")) : null;
  const reajuste_anual_pct = formData.get("reajuste_anual_pct")
    ? Number(formData.get("reajuste_anual_pct")) / 100
    : null;

  if (!id || !produto_id || !nome_plano || !tipo_cobranca || !preco) {
    return { error: "Preencha nome do plano, cobrança e preço." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("planos_precificacao")
    .update({ nome_plano, tipo_cobranca, tipo_venda, preco, desconto_pct, is_annual_only, mix_percentual, reajuste_anual_pct })
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível salvar o plano." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export async function atualizarDatasProduto(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const data_inicio_desenvolvimento = String(formData.get("data_inicio_desenvolvimento") || "") || null;
  const data_lancamento_estimada = String(formData.get("data_lancamento_estimada") || "") || null;

  if (!produto_id) {
    return { error: "Produto inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("produtos")
    .update({ data_inicio_desenvolvimento, data_lancamento_estimada })
    .eq("id", produto_id);

  if (error) {
    return { error: "Não foi possível salvar as datas." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}
