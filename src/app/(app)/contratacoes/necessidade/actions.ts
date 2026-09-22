"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; success?: boolean };

/** Produtos marcados na alocação — nenhum marcado = vale para todos (null). */
function produtosDoForm(formData: FormData): string[] | null {
  const ids = formData.getAll("produto_ids").map(String).filter(Boolean);
  return ids.length > 0 ? ids : null;
}

/** Conversão lead → oportunidade por produto (a tela pede em %, o banco guarda fração). */
function conversaoDoForm(formData: FormData): Record<string, number> | null {
  const taxas: Record<string, number> = {};
  for (const [nome, valor] of formData.entries()) {
    if (!nome.startsWith("conversao_")) continue;
    const produtoId = nome.slice("conversao_".length);
    const n = Number(String(valor).replace(",", "."));
    if (Number.isFinite(n) && n > 0) taxas[produtoId] = n / 100;
  }
  return Object.keys(taxas).length > 0 ? taxas : null;
}

/** Quanto da demanda a alocação absorve: toda, uma fatia em %, ou o teto do pacote contratado. */
function coberturaDoForm(formData: FormData): { cobertura_modo: string; cobertura_pct: number | null } {
  const modo = String(formData.get("cobertura_modo") || "demanda");
  const valido = modo === "demanda" || modo === "percentual" || modo === "pacote" ? modo : "demanda";
  const pctRaw = formData.get("cobertura_pct");
  const pct = pctRaw !== null && pctRaw !== "" ? Number(String(pctRaw).replace(",", ".")) : null;
  return {
    cobertura_modo: valido,
    cobertura_pct: valido === "percentual" && pct != null && Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : null,
  };
}

/** Alocar uma equipe muda o S&M, e com ele o CAC e o EBITDA das telas de plano. Sem revalidar
 *  essas rotas a pessoa aloca o SDR e continua vendo o CAC antigo, achando que não funcionou. */
function revalidarTelasAfetadas() {
  revalidatePath("/contratacoes/necessidade");
  revalidatePath("/relatorios");
  revalidatePath("/relatorios/mensal");
  revalidatePath("/plano", "layout");
}

export async function criarAlocacaoModelo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const cenario_id = String(formData.get("cenario_id") || "");
  const cargo = String(formData.get("cargo") || "").trim();
  const modelo_id = String(formData.get("modelo_id") || "");
  // 0 = acompanha a demanda (sem teto) — vale pra PJ, agência e bot. `|| 1` transformava 0 em 1.
  const quantidadeRaw = formData.get("quantidade");
  const quantidade = quantidadeRaw === null || quantidadeRaw === "" ? 1 : Number(quantidadeRaw);
  const data_inicio = String(formData.get("data_inicio") || "") || null;
  const data_fim = String(formData.get("data_fim") || "") || null;

  if (!cenario_id || !cargo || !modelo_id) {
    return { error: "Selecione o cargo e o modelo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("alocacao_modelo_contratacao").insert({
    cenario_id,
    cargo,
    modelo_id,
    quantidade,
    data_inicio,
    data_fim,
    produto_ids: produtosDoForm(formData),
    conversao_por_produto: conversaoDoForm(formData),
    ...coberturaDoForm(formData),
  });

  if (error) {
    return { error: "Não foi possível salvar a alocação." };
  }

  revalidarTelasAfetadas();
  return { error: null, success: true };
}

export async function excluirAlocacaoModelo(id: string) {
  const supabase = await createClient();
  await supabase.from("alocacao_modelo_contratacao").delete().eq("id", id);
  revalidarTelasAfetadas();
}


/** Edita uma alocação existente no lugar — quantidade e período. Antes era apagar e recriar,
 *  e "colocar mais 1 vendedor no período" virava refazer tudo. */
export async function editarAlocacaoModelo(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const quantidade = Number(formData.get("quantidade") || 1);
  const data_inicio = String(formData.get("data_inicio") || "") || null;
  const data_fim = String(formData.get("data_fim") || "") || null;
  if (!id) return { error: "Alocação não identificada." };
  if (!(quantidade >= 0)) return { error: "Quantidade inválida." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("alocacao_modelo_contratacao")
    .update({
      quantidade,
      data_inicio,
      data_fim,
      produto_ids: produtosDoForm(formData),
      produto_id: null,
      conversao_por_produto: conversaoDoForm(formData),
      ...coberturaDoForm(formData),
    })
    .eq("id", id);
  if (error) return { error: "Não foi possível salvar a alteração." };

  revalidarTelasAfetadas();
  return { error: null, success: true };
}

/**
 * Premissas de dimensionamento do time de vendas — por PRODUTO, não por fase: capacidade do
 * vendedor, reuniões extras por oportunidade e span do coordenador não mudam de fase pra fase.
 * Grava o mesmo valor em todas as fases do produto no cenário.
 */
export async function salvarPremissasVendas(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const cenario_id = String(formData.get("cenario_id") || "");
  const produto_id = String(formData.get("produto_id") || "");
  const num = (k: string) => {
    const v = formData.get(k);
    return v !== null && v !== "" ? Number(v) : null;
  };
  const capacidade = num("capacidade_vendedor_mes");
  // A tela pede "% que precisa de 2ª reunião"; o motor guarda o multiplicador (25% -> 1,25).
  const segunda = num("segunda_reuniao_pct");
  const reunioes = segunda != null ? 1 + Math.max(0, segunda) / 100 : null;
  const span = num("span_of_control");
  // Venda automática (bot, teste grátis, checkout): o produto não passa por vendedor — sem
  // capacidade de closer, ele não gera reunião nem paga "por venda".
  const semVendedor = formData.get("sem_vendedor") === "on";
  if (!cenario_id || !produto_id) return { error: "Produto não identificado." };

  const supabase = await createClient();
  const { data: fases } = await supabase.from("fases_produto").select("id").eq("produto_id", produto_id).eq("cenario_id", cenario_id);
  if (!fases || fases.length === 0) return { error: "Cadastre as fases do produto antes." };

  const premissas: Record<string, number | null> = {};
  if (semVendedor) premissas.capacidade_vendedor_mes = null;
  else if (capacidade != null) premissas.capacidade_vendedor_mes = capacidade;
  if (reunioes != null) premissas.reunioes_por_oportunidade = reunioes;
  if (span != null) premissas.span_of_control = span;

  const { error } = await supabase
    .from("premissas_funil")
    .upsert(fases.map((f) => ({ fase_produto_id: f.id, ...premissas })), { onConflict: "fase_produto_id" });
  if (error) return { error: "Não foi possível salvar as premissas." };

  revalidarTelasAfetadas();
  return { error: null, success: true };
}

/** Horas de um mês cheio — a tabela de custo/hora vira custo mensal por esta base. */
const HORAS_MES = 173.33;
const SENIORIDADE_LABEL: Record<string, string> = { junior: "júnior", pleno: "pleno", senior: "sênior" };

/**
 * Aloca direto a partir de um perfil da tabela de custo/hora (Contratações → Custo/hora). É o
 * caminho de Suporte e CS: a pessoa decide PJ ou CLT e a senioridade sem sair da tela, e o app
 * cria — ou reaproveita — o modelo de contratação equivalente. PJ é pago pelas horas do mês; CLT
 * é pessoa inteira, paga mesmo que a demanda do mês seja de poucas horas.
 */
export async function alocarPerfilHora(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const cenario_id = String(formData.get("cenario_id") || "");
  const cargo = String(formData.get("perfil_cargo") || "").trim();
  const tipo = String(formData.get("tipo_contratacao") || "pj") === "clt" ? "clt" : "pj";
  const senioridade = String(formData.get("senioridade") || "").trim();
  const valorHora = Number(String(formData.get("valor_hora") || "0").replace(",", "."));
  const data_inicio = String(formData.get("data_inicio") || "") || null;
  const data_fim = String(formData.get("data_fim") || "") || null;

  if (!cenario_id || !cargo || !(valorHora > 0)) return { error: "Perfil de custo/hora inválido." };

  const supabase = await createClient();
  const rotulo = `${cargo} — ${tipo.toUpperCase()} ${SENIORIDADE_LABEL[senioridade] ?? senioridade}`;
  const nome = `${rotulo} (R$ ${valorHora.toLocaleString("pt-BR")}/h)`;

  const { data: existente } = await supabase.from("modelos_contratacao").select("id").eq("nome", nome).maybeSingle();
  let modelo_id = existente?.id as string | undefined;

  if (!modelo_id) {
    const mensal = Number((valorHora * HORAS_MES).toFixed(2));
    const parametros =
      tipo === "clt"
        ? // A tabela já entrega o custo/hora com encargos — por isso a alíquota fica zerada aqui.
          { salario_bruto: mensal, aliquota_encargos: 0, capacidade_unidade_mes: HORAS_MES, custo_hora_tabela: valorHora }
        : { valor_mensal: mensal, capacidade_unidade_mes: HORAS_MES, fixo_por_pessoa_inteira: false, custo_hora_tabela: valorHora };
    const { data: novo, error: erroModelo } = await supabase
      .from("modelos_contratacao")
      .insert({
        cargo,
        tipo_modelo: tipo,
        nome,
        categoria: "sm",
        parametros,
        observacoes: "Criado a partir da tabela de custo/hora, em Necessidade de Contratação.",
      })
      .select("id")
      .single();
    if (erroModelo || !novo) return { error: "Não foi possível criar o modelo a partir do perfil." };
    modelo_id = novo.id;
  }

  const { error } = await supabase.from("alocacao_modelo_contratacao").insert({
    cenario_id,
    cargo,
    modelo_id,
    // CLT é pessoa inteira; PJ por hora acompanha a demanda do mês.
    quantidade: tipo === "clt" ? 1 : 0,
    data_inicio,
    data_fim,
    produto_ids: produtosDoForm(formData),
    cobertura_modo: "demanda",
    cobertura_pct: null,
  });
  if (error) return { error: "Não foi possível salvar a alocação." };

  revalidatePath("/contratacoes/modelos");
  revalidarTelasAfetadas();
  return { error: null, success: true };
}
