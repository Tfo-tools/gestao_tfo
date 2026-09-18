"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { idsDoCenario } from "@/lib/fases-produto";
import { simularProduto } from "@/lib/simulacao-produto";

export type SimulacaoActionState = {
  error: string | null;
  success?: boolean;
  /** Cenário não simula este produto — não é falha, só não há o que calcular. */
  foraDoCenario?: boolean;
};

export async function recalcularSimulacao(
  produtoId: string,
  cenarioId: string,
): Promise<SimulacaoActionState> {
  const supabase = await createClient();

  const simulado = await simularProduto(supabase, produtoId, cenarioId);
  if ("error" in simulado) return { error: simulado.error };
  if ("foraDoCenario" in simulado) {
    // Não é erro: este cenário não simula este produto. Antes, um produto global sem fase no
    // cenário fazia o recálculo inteiro reportar falha — foi o que aconteceu com a Consultoria.
    await supabase
      .from("simulacao_mensal")
      .delete()
      .eq("produto_id", produtoId)
      .eq("cenario_id", cenarioId);
    return { error: null, foraDoCenario: true };
  }
  const resultado = simulado.resultado;

  if (resultado.length === 0) {
    return { error: "Não foi possível calcular — confira as datas das fases." };
  }

  const { error } = await supabase.from("simulacao_mensal").upsert(
    resultado.map((r) => ({
      produto_id: produtoId,
      cenario_id: cenarioId,
      ...r,
      calculado_em: new Date().toISOString(),
    })),
    { onConflict: "produto_id,cenario_id,mes_referencia" },
  );

  if (error) {
    return { error: "Não foi possível salvar a simulação." };
  }

  revalidatePath(`/produtos/${produtoId}`);
  // Sem isto a tabela de projeção em Vendas continuava mostrando o cálculo anterior mesmo depois
  // de recalcular — a página não era invalidada.
  revalidatePath(`/plano/${cenarioId}/vendas`);
  revalidatePath(`/plano/${cenarioId}`);
  revalidatePath("/");
  revalidatePath("/relatorios");
  revalidatePath("/relatorios/mensal");
  revalidatePath("/contratacoes/necessidade");
  return { error: null, success: true };
}

/** Recalcula a projeção de todos os produtos do cenário (globais + exclusivos dele). Usado depois
 * de espelhar um cenário, mudar o período ou o ponto de partida — sem isso a tela mostraria a
 * projeção antiga (ou nenhuma) até alguém clicar em "Recalcular projeção". */
export async function recalcularTodosProdutos(
  cenarioId: string,
): Promise<{ falhas: string[] }> {
  const supabase = await createClient();
  // Só o que o cenário simula: no Base, todo produto aprovado ou iniciado; nos demais, a seleção
  // explícita. O que está fora não é recalculado nem conta como falha.
  const ids = await idsDoCenario(supabase, cenarioId);
  const { data: produtos } =
    ids.length > 0
      ? await supabase.from("produtos").select("id, nome").in("id", ids)
      : { data: [] };
  const falhas: string[] = [];
  for (const p of produtos ?? []) {
    const r = await recalcularSimulacao(p.id, cenarioId);
    if (r.error) falhas.push(`${p.nome}: ${r.error}`);
  }
  return { falhas };
}
