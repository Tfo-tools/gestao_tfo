"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FASES } from "@/lib/fases";
import { datasTravadas, type StatusProduto } from "@/lib/fases-produto";
import { recalcularSimulacao } from "./[id]/simulacao-actions";

export type ActionState = { error: string | null; success?: boolean; mensagem?: string };

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

  // As DATAS são do produto: uma linha por produto+fase, válida em todos os cenários vinculados.
  // Bloqueadas quando o produto já foi iniciado — o que começou não tem início em aberto.
  const { data: produtoRow } = await supabase.from("produtos").select("status").eq("id", produto_id).single();
  const status = (produtoRow?.status ?? "planejado") as StatusProduto;
  const datas = { data_inicio: str("data_inicio"), data_fim: str("data_fim") };
  const mexeuNasDatas = formData.has("data_inicio") || formData.has("data_fim");

  if (mexeuNasDatas && datasTravadas(status)) {
    return { error: "Produto iniciado: as datas das fases estão congeladas. Volte o status para aprovado se precisar ajustar." };
  }
  if (mexeuNasDatas) {
    const { error: dataError } = await supabase
      .from("produto_fases")
      .upsert({ produto_id, fase, ...datas, updated_at: new Date().toISOString() }, { onConflict: "produto_id,fase" });
    if (dataError) return { error: "Não foi possível salvar as datas da fase." };
  }

  // As TAXAS são do cenário: é nelas que Base e os demais cenários divergem de verdade.
  const { data: faseRow, error } = await supabase
    .from("fases_produto")
    .upsert(
      {
        produto_id,
        cenario_id,
        fase,
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
  const cenario_id = String(formData.get("cenario_id") || "");
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

  if (!produto_id || !cenario_id || !nome_plano || !tipo_cobranca || !preco) {
    return { error: "Preencha nome do plano, cobrança e preço." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("planos_precificacao").insert({
    produto_id,
    cenario_id,
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
  const cenario_id = String(formData.get("cenario_id") || "");
  const nome = String(formData.get("nome") || "").trim();
  const preco = Number(formData.get("preco") || 0);
  const gatilho = String(formData.get("gatilho") || "fase");
  const fase_lancamento = gatilho === "fase" ? String(formData.get("fase_lancamento") || "") || null : null;
  const meses_apos_lancamento =
    gatilho === "tempo" && formData.get("meses_apos_lancamento")
      ? Number(formData.get("meses_apos_lancamento"))
      : null;
  const data_disponibilidade = gatilho === "data" ? String(formData.get("data_disponibilidade") || "") || null : null;
  const adesao_inicial_pct = formData.get("adesao_inicial_pct")
    ? Number(formData.get("adesao_inicial_pct")) / 100
    : 0;
  const crescimento_adesao_mensal_pct = formData.get("crescimento_adesao_mensal_pct")
    ? Number(formData.get("crescimento_adesao_mensal_pct")) / 100
    : 0;
  const desconto_cliente_existente_pct = formData.get("desconto_cliente_existente_pct")
    ? Number(formData.get("desconto_cliente_existente_pct")) / 100
    : null;
  const desconto_cliente_existente_meses = formData.get("desconto_cliente_existente_meses")
    ? Number(formData.get("desconto_cliente_existente_meses"))
    : null;

  if (!produto_id || !cenario_id || !nome || !preco || (!fase_lancamento && meses_apos_lancamento == null && !data_disponibilidade)) {
    return { error: "Preencha nome, preço e quando o módulo fica disponível (fase, tempo ou data)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("modulos_produto").insert({
    produto_id,
    cenario_id,
    nome,
    preco,
    fase_lancamento,
    meses_apos_lancamento,
    data_disponibilidade,
    adesao_inicial_pct,
    crescimento_adesao_mensal_pct,
    desconto_cliente_existente_pct,
    desconto_cliente_existente_meses,
  });

  if (error) {
    return { error: "Não foi possível salvar o módulo." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export async function atualizarTipoPrecificacao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const tipo_precificacao = String(formData.get("tipo_precificacao") || "");

  if (!produto_id || (tipo_precificacao !== "tempo" && tipo_precificacao !== "modulos")) {
    return { error: "Tipo de precificação inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("produtos").update({ tipo_precificacao }).eq("id", produto_id);

  if (error) {
    return { error: "Não foi possível trocar o tipo de precificação." };
  }

  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export async function criarNivelModulo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const nome = String(formData.get("nome") || "").trim();
  const preco = Number(formData.get("preco") || 0);
  const data_disponibilidade = String(formData.get("data_disponibilidade") || "") || null;
  const quantidade_usuarios_inclusos = formData.get("quantidade_usuarios_inclusos")
    ? Number(formData.get("quantidade_usuarios_inclusos"))
    : null;
  const preco_usuario_adicional = formData.get("preco_usuario_adicional")
    ? Number(formData.get("preco_usuario_adicional"))
    : null;
  const media_usuarios_por_cliente = formData.get("media_usuarios_por_cliente")
    ? Number(formData.get("media_usuarios_por_cliente"))
    : null;
  const percentual_permanencia_estimado = formData.get("percentual_permanencia_estimado")
    ? Number(formData.get("percentual_permanencia_estimado")) / 100
    : null;
  const adesao_inicial_pct = formData.get("adesao_inicial_pct") ? Number(formData.get("adesao_inicial_pct")) / 100 : 0;
  const crescimento_adesao_mensal_pct = formData.get("crescimento_adesao_mensal_pct")
    ? Number(formData.get("crescimento_adesao_mensal_pct")) / 100
    : 0;
  const desconto_cliente_existente_pct = formData.get("desconto_cliente_existente_pct")
    ? Number(formData.get("desconto_cliente_existente_pct")) / 100
    : null;
  const desconto_cliente_existente_meses = formData.get("desconto_cliente_existente_meses")
    ? Number(formData.get("desconto_cliente_existente_meses"))
    : null;

  if (!produto_id || !cenario_id || !nome || !preco || !data_disponibilidade) {
    return { error: "Preencha nome, preço base e data de lançamento do nível." };
  }

  const supabase = await createClient();

  const { data: niveisExistentes, error: erroExistentes } = await supabase
    .from("modulos_produto")
    .select("id, ordem, tipo_cobranca")
    .eq("produto_id", produto_id)
    .eq("cenario_id", cenario_id)
    .order("ordem", { ascending: false })
    .limit(1);

  if (erroExistentes) {
    return { error: "Não foi possível verificar os níveis existentes." };
  }

  const nivelAnterior = niveisExistentes?.[0] ?? null;
  const ordem = (nivelAnterior?.ordem ?? 0) + 1;
  const tipo_cobranca =
    ordem === 1 ? String(formData.get("tipo_cobranca") || "") || null : nivelAnterior?.tipo_cobranca ?? null;

  if (ordem === 1 && !tipo_cobranca) {
    return { error: "Selecione a cobrança (anual ou mensal) do primeiro nível." };
  }

  const { error } = await supabase.from("modulos_produto").insert({
    produto_id,
    cenario_id,
    nome,
    preco,
    ordem,
    tipo_cobranca,
    data_disponibilidade,
    quantidade_usuarios_inclusos,
    preco_usuario_adicional,
    media_usuarios_por_cliente,
    percentual_permanencia_estimado,
    adesao_inicial_pct,
    crescimento_adesao_mensal_pct,
    desconto_cliente_existente_pct,
    desconto_cliente_existente_meses,
  });

  if (error) {
    return { error: "Não foi possível salvar o nível." };
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
  // Nasce disponível para qualquer cenário. Se veio de um cenário não-base, já entra na seleção
  // dele — é onde a pessoa estava trabalhando —, mas sem virar "produto daquele cenário".
  const cenarioDeOrigem = String(formData.get("cenario_id") || "") || null;

  if (!nome) {
    return { error: "Dê um nome para o produto." };
  }

  const supabase = await createClient();
  const { data: criado, error } = await supabase
    .from("produtos")
    .insert({
      nome,
      descricao,
      data_inicio_desenvolvimento,
      data_lancamento_estimada,
      status: "planejado",
    })
    .select("id")
    .single();

  if (error || !criado) {
    return {
      error: error?.message.includes("duplicate")
        ? "Já existe um produto com esse nome."
        : "Não foi possível criar o produto.",
    };
  }

  if (cenarioDeOrigem) {
    const { data: cenario } = await supabase.from("cenarios").select("is_base").eq("id", cenarioDeOrigem).single();
    // No Base a entrada é por status, então não há o que vincular: planejado ainda não entra no plano.
    if (cenario?.is_base === false) {
      await supabase.from("produto_cenario").insert({ cenario_id: cenarioDeOrigem, produto_id: criado.id });
    }
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

function montarParametrosCanal(formData: FormData, tipo_canal: string): Record<string, unknown> {
  const num = (name: string) => {
    const v = formData.get(name);
    return v !== null && v !== "" ? Number(v) : undefined;
  };
  const pct = (name: string) => {
    const v = formData.get(name);
    return v !== null && v !== "" ? Number(v) / 100 : undefined;
  };

  // Representante e associação são os dois canais de parceiro — a diferença é só quem é o
  // parceiro, então a remuneração disponível é a mesma. O desconto ao cliente e a isenção NÃO
  // ficam aqui: eles variam por produto (canal_produto), porque você se associa uma vez e decide
  // depois em qual produto vai dar o benefício.
  if (tipo_canal === "representante" || tipo_canal === "associacao") {
    return {
      comissao_pct: pct("comissao_pct"),
      valor_fixo_fechamento: num("valor_fixo_fechamento"),
      credito_uso_valor: num("credito_uso_valor"),
      credito_uso_destino: String(formData.get("credito_uso_destino") || "") || undefined,
      /** Custo recorrente de MANTER cada parceiro (ex: mensalidade de associação) — vai pra ADM. */
      custo_mensal_parceiro: num("custo_mensal_parceiro"),
      media_clientes_parceiro_inicial: num("media_clientes_parceiro_inicial"),
      queda_intensidade_mensal_pct: pct("queda_intensidade_mensal_pct"),
      media_clientes_parceiro_minima: num("media_clientes_parceiro_minima"),
    };
  }

  // Self-service: nenhum custo de pessoa, só verba de mídia pra encher o teste grátis.
  if (tipo_canal === "self_service") {
    return {
      custo_por_trial: num("custo_por_trial"),
      taxa_conversao_trial: pct("taxa_conversao_trial"),
    };
  }
  return {};
}

/** Salva a matriz canal × produto: mix, fechamento e o benefício que aquele canal dá naquele produto. */
export async function salvarCanalProdutos(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const canal_id = String(formData.get("canal_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const linhasRaw = String(formData.get("linhas") || "");

  if (!canal_id || !linhasRaw) return { error: "Dados incompletos." };

  let linhas: {
    produto_id: string;
    percentual_mix: number;
    taxa_fechamento: number | null;
    desconto_cliente_pct: number | null;
    desconto_cliente_meses: number | null;
    isencao_implementacao: boolean;
    desconto_implementacao_pct: number | null;
  }[];
  try {
    linhas = JSON.parse(linhasRaw);
  } catch {
    return { error: "Não foi possível ler os dados por produto." };
  }

  const supabase = await createClient();
  for (const l of linhas) {
    const { error } = await supabase.from("canal_produto").upsert(
      {
        canal_id,
        produto_id: l.produto_id,
        percentual_mix: l.percentual_mix,
        taxa_fechamento: l.taxa_fechamento,
        desconto_cliente_pct: l.desconto_cliente_pct,
        desconto_cliente_meses: l.desconto_cliente_meses,
        isencao_implementacao: l.isencao_implementacao,
        desconto_implementacao_pct: l.desconto_implementacao_pct,
      },
      { onConflict: "canal_id,produto_id" },
    );
    if (error) return { error: "Não foi possível salvar os produtos deste canal." };
  }

  revalidatePath(`/plano/${cenario_id}/vendas`);
  revalidatePath("/produtos");
  return { error: null, success: true };
}

export async function salvarParceirosCanal(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const canal_id = String(formData.get("canal_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");

  if (!canal_id) {
    return { error: "Canal inválido." };
  }

  const supabase = await createClient();

  for (const fase of FASES) {
    const raw = formData.get(`fase__${fase.value}`);
    const quantidade = raw !== null && raw !== "" ? Number(raw) : 0;
    const { error } = await supabase
      .from("canal_parceiros_fase")
      .upsert({ canal_id, fase: fase.value, quantidade_parceiros: quantidade }, { onConflict: "canal_id,fase" });
    if (error) return { error: "Não foi possível salvar os parceiros por fase." };
  }

  revalidatePath(`/plano/${cenario_id}/vendas`);
  revalidatePath("/produtos");
  return { error: null, success: true };
}

export async function criarCanalAquisicao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const cenario_id = String(formData.get("cenario_id") || "");
  const nome = String(formData.get("nome") || "").trim();
  const descricao = String(formData.get("descricao") || "").trim() || null;
  const tipo_canal = String(formData.get("tipo_canal") || "direto");
  const modelo_contratacao_id = String(formData.get("modelo_contratacao_id") || "") || null;

  if (!cenario_id || !nome) {
    return { error: "Dê um nome pro canal." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("canais_aquisicao").insert({
    cenario_id,
    nome,
    descricao,
    tipo_canal,
    modelo_contratacao_id,
    parametros: montarParametrosCanal(formData, tipo_canal),
  });

  if (error) {
    return { error: "Não foi possível salvar o canal." };
  }

  revalidatePath(`/plano/${cenario_id}/vendas`);
  revalidatePath("/produtos");
  return { error: null, success: true };
}

export async function atualizarCanalAquisicao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const nome = String(formData.get("nome") || "").trim();
  const descricao = String(formData.get("descricao") || "").trim() || null;
  const tipo_canal = String(formData.get("tipo_canal") || "direto");
  const modelo_contratacao_id = String(formData.get("modelo_contratacao_id") || "") || null;

  if (!id || !nome) {
    return { error: "Dê um nome pro canal." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("canais_aquisicao")
    .update({
      nome,
      descricao,
      tipo_canal,
      modelo_contratacao_id,
      parametros: montarParametrosCanal(formData, tipo_canal),
    })
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível salvar o canal." };
  }

  revalidatePath(`/plano/${cenario_id}/vendas`);
  revalidatePath("/produtos");
  return { error: null, success: true };
}

export async function excluirCanalAquisicao(id: string, cenarioId: string) {
  const supabase = await createClient();
  await supabase.from("canais_aquisicao").delete().eq("id", id);
  revalidatePath(`/plano/${cenarioId}/vendas`);
  revalidatePath("/produtos");
}

/** Preço e custo de implementação mudam receita e COGS da projeção — recalcula na hora. Preço e
 * parcelas são do produto (valem em todos os cenários); as etapas são de um cenário só. Cenário em
 * que o produto ainda não tem fase é ignorado (a simulação só devolve aviso, não grava nada). */
async function recalcularProdutoNosCenarios(produtoId: string, cenarioId?: string): Promise<string[]> {
  const supabase = await createClient();
  const query = supabase.from("cenarios").select("id, nome");
  const { data: cenarios } = cenarioId ? await query.eq("id", cenarioId) : await query;
  const recalculados: string[] = [];
  for (const c of cenarios ?? []) {
    const r = await recalcularSimulacao(produtoId, c.id as string);
    if (!r.error) recalculados.push(c.nome as string);
  }
  return recalculados;
}

export async function salvarConfigImplementacao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const tem_implementacao = formData.get("tem_implementacao") === "on";
  const preco_implementacao = formData.get("preco_implementacao") ? Number(formData.get("preco_implementacao")) : null;
  let implementacao_parcelas = formData.get("implementacao_parcelas")
    ? Math.max(1, Number(formData.get("implementacao_parcelas")))
    : 1;

  if (!produto_id) {
    return { error: "Produto inválido." };
  }
  if (tem_implementacao && !preco_implementacao) {
    return { error: "Informe o preço de venda da implementação." };
  }

  // Mix de formas de pagamento: [{parcelas, pct, desconto}] com pct e desconto em 0–1. Uma forma só
  // (ou nenhuma) volta a ser o número único de parcelas de antes.
  let implementacao_formas_pagamento: { parcelas: number; pct: number; desconto: number }[] | null = null;
  const formasRaw = String(formData.get("implementacao_formas") || "");
  if (formasRaw) {
    let formas: { parcelas: number; pct: number; desconto?: number }[];
    try {
      formas = JSON.parse(formasRaw);
    } catch {
      return { error: "Não foi possível ler as formas de pagamento." };
    }
    const validas = formas
      .map((f) => ({ parcelas: Math.max(1, Math.round(Number(f.parcelas))), pct: Number(f.pct), desconto: Math.min(1, Math.max(0, Number(f.desconto ?? 0))) }))
      .filter((f) => Number.isFinite(f.parcelas) && f.pct > 0);
    const soma = validas.reduce((acc, f) => acc + f.pct, 0);
    if (validas.length > 0 && Math.abs(soma - 1) > 0.005) {
      return { error: `As formas de pagamento somam ${(soma * 100).toFixed(0)}% dos clientes — ajuste pra 100%.` };
    }
    if (validas.length > 1 || (validas.length === 1 && validas[0].desconto > 0)) {
      implementacao_formas_pagamento = validas;
      // O campo antigo guarda a forma mais usada (é o que outras telas mostram como "parcelas").
      implementacao_parcelas = [...validas].sort((x, y) => y.pct - x.pct)[0].parcelas;
    } else if (validas.length === 1) {
      implementacao_parcelas = validas[0].parcelas;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("produtos")
    .update({ tem_implementacao, preco_implementacao, implementacao_parcelas, implementacao_formas_pagamento })
    .eq("id", produto_id);

  if (error) {
    return { error: "Não foi possível salvar a implementação." };
  }

  const recalculados = await recalcularProdutoNosCenarios(produto_id);
  revalidatePath(`/produtos/${produto_id}`);
  return {
    error: null,
    success: true,
    mensagem:
      recalculados.length > 0
        ? `Salvo. Projeção recalculada em: ${recalculados.join(", ")}.`
        : "Salvo. Nenhum cenário com fases deste produto pra recalcular.",
  };
}

export async function criarEtapaImplementacao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const produto_id = String(formData.get("produto_id") || "");
  const cenario_id = String(formData.get("cenario_id") || "");
  const nome_etapa = String(formData.get("nome_etapa") || "").trim();
  const cargo_dono = String(formData.get("cargo_dono") || "").trim() || null;
  const cargo_executor = String(formData.get("cargo_executor") || "").trim();
  const senioridade = String(formData.get("senioridade") || "");
  const tipo_contratacao = String(formData.get("tipo_contratacao") || "");
  const horas = formData.get("horas") ? Number(formData.get("horas")) : 0;
  const valor_hora = formData.get("valor_hora") ? Number(formData.get("valor_hora")) : 0;
  const ordem = formData.get("ordem") ? Number(formData.get("ordem")) : null;

  if (!produto_id || !cenario_id || !nome_etapa || !cargo_executor || !horas || !valor_hora) {
    return { error: "Preencha a etapa, o cargo que executa, as horas e o valor/hora." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("implementacao_etapas").insert({
    produto_id,
    cenario_id,
    nome_etapa,
    cargo_dono,
    cargo_executor,
    senioridade,
    tipo_contratacao,
    horas,
    valor_hora,
    ordem,
  });

  if (error) {
    return { error: "Não foi possível salvar a etapa." };
  }

  await recalcularProdutoNosCenarios(produto_id, cenario_id);
  revalidatePath(`/produtos/${produto_id}`);
  return { error: null, success: true };
}

export type EtapaImplementacaoEdicao = {
  nome_etapa: string;
  cargo_dono: string | null;
  cargo_executor: string;
  senioridade: string;
  tipo_contratacao: string;
  horas: number;
  valor_hora: number;
};

/** Edita uma etapa já lançada (nome, dono, quem executa, horas e R$/hora). */
export async function atualizarEtapaImplementacao(
  id: string,
  produtoId: string,
  cenarioId: string,
  dados: EtapaImplementacaoEdicao,
): Promise<ActionState> {
  const nome_etapa = dados.nome_etapa.trim();
  if (!id || !nome_etapa || !dados.cargo_executor || !(dados.horas > 0) || !(dados.valor_hora > 0)) {
    return { error: "Preencha a etapa, o cargo que executa, as horas e o valor/hora." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("implementacao_etapas")
    .update({
      nome_etapa,
      cargo_dono: dados.cargo_dono?.trim() || null,
      cargo_executor: dados.cargo_executor,
      senioridade: dados.senioridade,
      tipo_contratacao: dados.tipo_contratacao,
      horas: dados.horas,
      valor_hora: dados.valor_hora,
    })
    .eq("id", id);
  if (error) return { error: "Não foi possível salvar a etapa." };

  await recalcularProdutoNosCenarios(produtoId, cenarioId || undefined);
  revalidatePath(`/produtos/${produtoId}`);
  return { error: null, success: true };
}

export async function excluirEtapaImplementacao(id: string, produtoId: string, cenarioId?: string) {
  const supabase = await createClient();
  await supabase.from("implementacao_etapas").delete().eq("id", id);
  if (cenarioId) await recalcularProdutoNosCenarios(produtoId, cenarioId);
  revalidatePath(`/produtos/${produtoId}`);
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

// ─── Grade de produtos (lista) ────────────────────────────────────────────────────────────────
// Um salvar só pra tudo que está na grade: datas do produto (início dev., lançamento) e início/fim
// de cada fase, de todos os produtos. Produto iniciado tem as fases congeladas: a grade nem manda.

type LinhaGrade = {
  produto_id: string;
  data_inicio_desenvolvimento: string | null;
  data_lancamento_estimada: string | null;
  fases: { fase: string; data_inicio: string | null; data_fim: string | null }[];
};

export async function salvarGradeProdutos(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let linhas: LinhaGrade[];
  try {
    linhas = JSON.parse(String(formData.get("linhas") || "[]"));
  } catch {
    return { error: "Não foi possível ler a grade." };
  }
  if (linhas.length === 0) return { error: null, success: true };

  const supabase = await createClient();
  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, status")
    .in("id", linhas.map((l) => l.produto_id));
  const statusPorId = new Map((produtos ?? []).map((p) => [p.id, (p.status ?? "planejado") as StatusProduto]));

  for (const l of linhas) {
    const { error } = await supabase
      .from("produtos")
      .update({ data_inicio_desenvolvimento: l.data_inicio_desenvolvimento, data_lancamento_estimada: l.data_lancamento_estimada })
      .eq("id", l.produto_id);
    if (error) return { error: "Não foi possível salvar as datas de um produto." };

    if (datasTravadas(statusPorId.get(l.produto_id) ?? "planejado")) continue;
    for (const f of l.fases) {
      const { error: erroFase } = await supabase.from("produto_fases").upsert(
        { produto_id: l.produto_id, fase: f.fase, data_inicio: f.data_inicio, data_fim: f.data_fim, updated_at: new Date().toISOString() },
        { onConflict: "produto_id,fase" },
      );
      if (erroFase) return { error: "Não foi possível salvar a fase de um dos produtos." };
    }
  }

  revalidatePath("/produtos");
  revalidatePath("/plano", "layout");
  revalidatePath("/contratacoes/necessidade");
  revalidatePath("/relatorios");
  return { error: null, success: true };
}
