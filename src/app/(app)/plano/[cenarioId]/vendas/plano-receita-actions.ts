"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { simularProduto } from "@/lib/simulacao-produto";
import { recalcularTodosProdutos } from "@/app/(app)/produtos/[id]/simulacao-actions";
import { idsDoCenario } from "@/lib/fases-produto";
import type { FasePlanoReceita } from "@/lib/plano-receita";

export type PayloadPlanoReceita = {
  pctVendasCombo: number | null;
  pesos: Record<string, number>;
  metas: { ano: number; crescimento: number | null; metasProduto: Record<string, number> }[];
  produtos: { id: string; fases: FasePlanoReceita[]; sazonalidade: number[] | null }[];
};

export type LinhaPrevia = {
  produtoId: string;
  ano: number;
  mrrHoje: number;
  mrrNovo: number;
  clientesHoje: number;
  clientesNovo: number;
};

const finito = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Confere o que veio da tela antes de simular ou gravar. */
function validar(p: PayloadPlanoReceita): string | null {
  if (p.pctVendasCombo != null && (!finito(p.pctVendasCombo) || p.pctVendasCombo < 0 || p.pctVendasCombo > 1))
    return "O % de vendas em combo precisa estar entre 0 e 100.";
  for (const prod of p.produtos) {
    for (const f of prod.fases) {
      for (const [campo, v] of [
        ["crescimento", f.cresc_inicio],
        ["crescimento", f.cresc_alvo],
      ] as const)
        if (v != null && (!finito(v) || v < -0.5 || v > 3)) return `Confira o ${campo} da fase ${f.fase}.`;
      for (const v of [f.churn_inicio, f.churn_alvo])
        if (v != null && (!finito(v) || v < 0 || v >= 1)) return `Confira o churn da fase ${f.fase}.`;
    }
    if (prod.sazonalidade && (prod.sazonalidade.length !== 12 || prod.sazonalidade.some((v) => !finito(v) || v < 0)))
      return "A sazonalidade precisa de 12 números (um por mês), sem negativos.";
  }
  return null;
}

/** Dezembro de cada ano do período (e o último mês, se o cenário não termina em dezembro). */
function mesesDeCorte(inicio: string, fim: string): string[] {
  const saida: string[] = [];
  for (let a = Number(inicio.slice(0, 4)); a <= Number(fim.slice(0, 4)); a++) {
    const dez = `${a}-12-01`;
    saida.push(dez > fim ? fim : dez);
  }
  return saida.filter((m) => m >= inicio);
}

/** Roda a simulação com as premissas da tela, sem gravar, e compara com a projeção atual. */
export async function previaPlanoReceita(
  cenarioId: string,
  payload: PayloadPlanoReceita,
): Promise<{ error: string | null; linhas?: LinhaPrevia[] }> {
  const erro = validar(payload);
  if (erro) return { error: erro };
  const supabase = await createClient();
  const { data: cenario } = await supabase.from("cenarios").select("data_inicio, data_fim").eq("id", cenarioId).single();
  if (!cenario) return { error: "Cenário não encontrado." };
  const inicio = `${String(cenario.data_inicio).slice(0, 7)}-01`;
  const fim = `${String(cenario.data_fim).slice(0, 7)}-01`;
  const cortes = mesesDeCorte(inicio, fim);

  const { data: atual } = await supabase
    .from("simulacao_mensal")
    .select("produto_id, mes_referencia, mrr, clientes_ativos")
    .eq("cenario_id", cenarioId)
    .in("mes_referencia", cortes);

  const linhas: LinhaPrevia[] = [];
  for (const prod of payload.produtos) {
    const r = await simularProduto(supabase, prod.id, cenarioId, {
      fases: prod.fases,
      sazonalidade: prod.sazonalidade,
      pctVendasCombo: payload.pctVendasCombo,
    });
    if ("error" in r) return { error: r.error };
    if ("foraDoCenario" in r) continue;
    for (const mes of cortes) {
      const novo = r.resultado.find((x) => x.mes_referencia === mes);
      const hoje = (atual ?? []).find((x) => x.produto_id === prod.id && x.mes_referencia === mes);
      linhas.push({
        produtoId: prod.id,
        ano: Number(mes.slice(0, 4)),
        mrrHoje: Number(hoje?.mrr ?? 0),
        mrrNovo: novo?.mrr ?? 0,
        clientesHoje: Number(hoje?.clientes_ativos ?? 0),
        clientesNovo: novo?.clientes_ativos ?? 0,
      });
    }
  }
  return { error: null, linhas };
}

/**
 * Grava o plano pela receita e recalcula o cenário. Num cenário importado (modelo trimestral), é
 * aqui que ele passa para o modelo novo — a tela só chama depois de mostrar a prévia.
 */
export async function salvarPlanoReceita(
  cenarioId: string,
  payload: PayloadPlanoReceita,
): Promise<{ error: string | null; success?: boolean; outrosRecalculados?: string[] }> {
  const erro = validar(payload);
  if (erro) return { error: erro };
  const supabase = await createClient();
  const falhas: string[] = [];

  // Sazonalidade é do produto: se mudou, os outros cenários pela receita com esse produto também
  // precisam ser recalculados — senão cada um mostraria uma curva de venda diferente.
  const { data: sazAtual } = await supabase
    .from("produtos")
    .select("id, sazonalidade_vendas")
    .in(
      "id",
      payload.produtos.map((p) => p.id),
    );
  const igual = (a: unknown, b: number[] | null) => {
    const x = Array.isArray(a) ? (a as unknown[]).map(Number) : null;
    if (!x || !b) return !x && !b;
    return x.length === b.length && x.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  };
  const sazMudou = new Set(
    payload.produtos
      .filter((p) => !igual((sazAtual ?? []).find((x) => x.id === p.id)?.sazonalidade_vendas, p.sazonalidade))
      .map((p) => p.id),
  );

  for (const prod of payload.produtos) {
    for (const f of prod.fases) {
      const { error } = await supabase
        .from("fases_produto")
        .update({
          plano_cresc_inicio: f.cresc_inicio,
          plano_cresc_alvo: f.cresc_alvo,
          plano_churn_inicio: f.churn_inicio,
          plano_churn_alvo: f.churn_alvo,
          updated_at: new Date().toISOString(),
        })
        .eq("produto_id", prod.id)
        .eq("cenario_id", cenarioId)
        .eq("fase", f.fase);
      if (error) falhas.push(`fase ${f.fase}`);
    }
    // A curva de vendas é do produto: vale para todos os cenários que planejam pela receita.
    const { error } = await supabase.from("produtos").update({ sazonalidade_vendas: prod.sazonalidade }).eq("id", prod.id);
    if (error) falhas.push("sazonalidade");
  }

  const { error: erroCenario } = await supabase
    .from("cenarios")
    .update({ modelo_plano: "receita", pct_vendas_combo: payload.pctVendasCombo, pesos_receita: payload.pesos })
    .eq("id", cenarioId);
  if (erroCenario) return { error: "Não foi possível salvar o cenário." };

  if (payload.metas.length > 0) {
    const { error } = await supabase.from("cenario_meta_receita").upsert(
      payload.metas.map((m) => ({
        cenario_id: cenarioId,
        ano: m.ano,
        crescimento_pct: m.crescimento,
        metas_produto: m.metasProduto,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "cenario_id,ano" },
    );
    if (error) falhas.push("metas de receita");
  }

  const { falhas: falhasCalculo } = await recalcularTodosProdutos(cenarioId);
  falhas.push(...falhasCalculo);

  // Os outros cenários pela receita que vendem um produto cuja sazonalidade mudou. Cenário no
  // modelo anterior (FUNSES 1) não usa sazonalidade — fica como está.
  const outrosRecalculados: string[] = [];
  if (sazMudou.size > 0) {
    const { data: outros } = await supabase
      .from("cenarios")
      .select("id, nome")
      .eq("modelo_plano", "receita")
      .neq("id", cenarioId);
    for (const c of outros ?? []) {
      const ids = await idsDoCenario(supabase, c.id);
      if (!ids.some((id) => sazMudou.has(id))) continue;
      const { falhas: f } = await recalcularTodosProdutos(c.id);
      falhas.push(...f.map((x) => `${c.nome}: ${x}`));
      outrosRecalculados.push(c.nome);
      revalidatePath(`/plano/${c.id}`, "layout");
    }
  }

  revalidatePath(`/plano/${cenarioId}`, "layout");
  revalidatePath("/relatorios");
  revalidatePath("/indicadores");
  return falhas.length > 0
    ? { error: `Salvo, mas houve falha em: ${[...new Set(falhas)].join("; ")}`, outrosRecalculados }
    : { error: null, success: true, outrosRecalculados };
}
