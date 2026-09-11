"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { capturarPontoPartida, type PontoPartida } from "@/lib/ponto-partida";
import { recalcularTodosProdutos } from "@/app/(app)/produtos/[id]/simulacao-actions";

export type CurvaActionState = { error: string | null; success?: boolean };

/** Salva os clientes de abertura editados à mão e recalcula a projeção a partir deles. */
export async function salvarPontoPartida(cenarioId: string, clientesPorProduto: Record<string, number>): Promise<CurvaActionState> {
  const supabase = await createClient();
  const { data: cenario } = await supabase.from("cenarios").select("ponto_partida").eq("id", cenarioId).single();
  const ponto = cenario?.ponto_partida as PontoPartida | null;
  if (!ponto) return { error: "Este cenário não tem ponto de partida — ele acumula clientes desde o início de cada produto." };

  for (const [produtoId, valor] of Object.entries(clientesPorProduto)) {
    if (!ponto.produtos[produtoId] || !Number.isFinite(valor) || valor < 0) continue;
    ponto.produtos[produtoId].clientes = Math.round(valor);
  }
  const { error } = await supabase.from("cenarios").update({ ponto_partida: ponto }).eq("id", cenarioId);
  if (error) return { error: "Não foi possível salvar o ponto de partida." };

  const { falhas } = await recalcularTodosProdutos(cenarioId);
  revalidatePath(`/plano/${cenarioId}`, "layout");
  revalidatePath("/relatorios");
  return falhas.length > 0 ? { error: `Salvo, mas a projeção falhou em: ${falhas.join("; ")}` } : { error: null, success: true };
}

/** Busca de novo, no cenário de origem, os clientes do mês anterior ao início (descarta edições). */
export async function recarregarPontoPartida(cenarioId: string): Promise<CurvaActionState> {
  const supabase = await createClient();
  const { data: cenario } = await supabase.from("cenarios").select("data_inicio, cenario_origem_id").eq("id", cenarioId).single();
  if (!cenario?.cenario_origem_id || !cenario.data_inicio) return { error: "Este cenário não foi espelhado de outro." };

  const ponto = await capturarPontoPartida(supabase, cenario.cenario_origem_id, cenario.data_inicio);
  if (!ponto) return { error: "O cenário de origem não tem projeção no mês anterior ao início deste — recalcule a origem primeiro." };
  const { error } = await supabase.from("cenarios").update({ ponto_partida: ponto }).eq("id", cenarioId);
  if (error) return { error: "Não foi possível atualizar o ponto de partida." };

  const { falhas } = await recalcularTodosProdutos(cenarioId);
  revalidatePath(`/plano/${cenarioId}`, "layout");
  revalidatePath("/relatorios");
  return falhas.length > 0 ? { error: `Atualizado, mas a projeção falhou em: ${falhas.join("; ")}` } : { error: null, success: true };
}

type LinhaDatas = { produto_id: string; data_inicio: string | null; data_fim: string | null };

/** Salva só início/fim de uma fase, pra todos os produtos de uma vez — usado na matriz de
 * Produtos. Não toca em crescimento/churn (isso é editado em Vendas). Como o upsert só inclui
 * as colunas passadas aqui, um conflito atualiza só data_inicio/data_fim e preserva o resto. */
export async function salvarFasesDatas(
  _prevState: CurvaActionState,
  formData: FormData,
): Promise<CurvaActionState> {
  const cenario_id = String(formData.get("cenario_id") || "");
  const fase = String(formData.get("fase") || "");
  const linhasRaw = String(formData.get("linhas") || "");

  if (!cenario_id || !fase || !linhasRaw) {
    return { error: "Dados incompletos." };
  }

  let linhas: LinhaDatas[];
  try {
    linhas = JSON.parse(linhasRaw);
  } catch {
    return { error: "Não foi possível ler os dados da fase." };
  }

  const supabase = await createClient();

  for (const linha of linhas) {
    const { error } = await supabase.from("fases_produto").upsert(
      {
        produto_id: linha.produto_id,
        cenario_id,
        fase,
        data_inicio: linha.data_inicio,
        data_fim: linha.data_fim,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "produto_id,cenario_id,fase" },
    );

    if (error) {
      return { error: "Não foi possível salvar a fase de um dos produtos." };
    }
  }

  revalidatePath("/produtos");
  revalidatePath(`/plano/${cenario_id}/vendas`);
  revalidatePath("/contratacoes/necessidade");
  revalidatePath("/relatorios");
  return { error: null, success: true };
}

type LinhaPlanejamento = {
  produto_id: string;
  taxa_crescimento_mensal: number | null;
  taxa_churn_mensal: number | null;
  capacidade_vendedor_mes: number | null;
  reunioes_por_oportunidade?: number | null;
  span_of_control?: number | null;
  horas_suporte_por_cliente_mes?: number | null;
  trimestres?: { indice: number; taxa_crescimento_mensal: number | null; taxa_churn_mensal: number | null }[];
};

/** Salva crescimento/churn + conversão/capacidade de uma fase, pra todos os produtos de uma vez —
 * usado na tela de Crescimento & Churn de Vendas. Não toca em início/fim (isso é editado em
 * Produtos) — a fase já precisa existir lá antes de dar pra planejar aqui. */
export async function salvarPlanejamentoFase(
  _prevState: CurvaActionState,
  formData: FormData,
): Promise<CurvaActionState> {
  const cenario_id = String(formData.get("cenario_id") || "");
  const fase = String(formData.get("fase") || "");
  const linhasRaw = String(formData.get("linhas") || "");

  if (!cenario_id || !fase || !linhasRaw) {
    return { error: "Dados incompletos." };
  }

  let linhas: LinhaPlanejamento[];
  try {
    linhas = JSON.parse(linhasRaw);
  } catch {
    return { error: "Não foi possível ler os dados da fase." };
  }

  const supabase = await createClient();

  // Não abortamos no primeiro erro: se um produto falha, os outros continuam sendo salvos e a
  // mensagem diz qual falhou. Antes, um erro no primeiro produto descartava silenciosamente as
  // alterações dos demais — a tela "voltava sozinha" pros valores antigos.
  const falhas: string[] = [];

  for (const linha of linhas) {
    const { data: faseRow } = await supabase
      .from("fases_produto")
      .select("id, produtos:produto_id(nome)")
      .eq("produto_id", linha.produto_id)
      .eq("cenario_id", cenario_id)
      .eq("fase", fase)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nomeProduto = ((faseRow?.produtos as any)?.nome as string) ?? "produto";

    if (!faseRow) {
      falhas.push("um produto sem início/fim de fase cadastrado em Produtos");
      continue;
    }

    const { error } = await supabase
      .from("fases_produto")
      .update({
        taxa_crescimento_mensal: linha.taxa_crescimento_mensal,
        taxa_churn_mensal: linha.taxa_churn_mensal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", faseRow.id);

    if (error) {
      falhas.push(`${nomeProduto} (crescimento/churn)`);
      continue;
    }

    // Todas as premissas de funil da fase vão juntas — só o que veio preenchido sobrescreve, pra
    // um campo em branco não apagar o que já estava salvo.
    const premissas: Record<string, number> = {};
    if (linha.capacidade_vendedor_mes != null) premissas.capacidade_vendedor_mes = linha.capacidade_vendedor_mes;
    if (linha.reunioes_por_oportunidade != null) premissas.reunioes_por_oportunidade = linha.reunioes_por_oportunidade;
    if (linha.span_of_control != null) premissas.span_of_control = linha.span_of_control;
    if (linha.horas_suporte_por_cliente_mes != null) premissas.horas_suporte_por_cliente_mes = linha.horas_suporte_por_cliente_mes;
    const { error: funilError } = await supabase.from("premissas_funil").upsert(
      { fase_produto_id: faseRow.id, ...premissas },
      { onConflict: "fase_produto_id" },
    );
    if (funilError) falhas.push(`${nomeProduto} (reuniões por closer)`);

    // Trimestres: só blocos com pelo menos uma taxa preenchida ficam; os em branco são apagados
    // pra voltar a valer o padrão da fase.
    if (linha.trimestres) {
      const preenchidos = linha.trimestres.filter((t) => t.taxa_crescimento_mensal != null || t.taxa_churn_mensal != null);
      const vazios = linha.trimestres.filter((t) => t.taxa_crescimento_mensal == null && t.taxa_churn_mensal == null).map((t) => t.indice);
      if (vazios.length > 0) {
        await supabase.from("fases_trimestres").delete().eq("fase_produto_id", faseRow.id).in("indice", vazios);
      }
      if (preenchidos.length > 0) {
        const { error: triError } = await supabase.from("fases_trimestres").upsert(
          preenchidos.map((t) => ({ fase_produto_id: faseRow.id, indice: t.indice, taxa_crescimento_mensal: t.taxa_crescimento_mensal, taxa_churn_mensal: t.taxa_churn_mensal })),
          { onConflict: "fase_produto_id,indice" },
        );
        if (triError) falhas.push(`${nomeProduto} (trimestres)`);
      }
    }
  }

  if (falhas.length > 0) {
    return { error: `Salvo, exceto: ${falhas.join("; ")}.` };
  }

  revalidatePath(`/plano/${cenario_id}/vendas`);
  revalidatePath("/contratacoes/necessidade");
  revalidatePath("/relatorios");
  return { error: null, success: true };
}
