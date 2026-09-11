"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recalcularTodosProdutos } from "@/app/(app)/produtos/[id]/simulacao-actions";
import type { RetornoAcao } from "@/lib/acoes-marketing";

export type AcaoMarketingForm = {
  id?: string | null;
  tipo: "feira" | "evento";
  nome: string;
  /** Feira: "AAAA-MM". */
  mes: string | null;
  ano: number | null;
  quantidade: number | null;
  custo: number;
  retorno: RetornoAcao[];
  observacoes: string | null;
};

/** Cria ou atualiza uma feira/evento e recalcula a projeção (as vendas mudam a curva de clientes). */
export async function salvarAcaoMarketing(cenarioId: string, dados: AcaoMarketingForm): Promise<{ error: string | null }> {
  const nome = dados.nome.trim();
  if (!cenarioId || !nome) return { error: "Dê um nome pra feira/evento." };
  if (!Number.isFinite(dados.custo) || dados.custo < 0) return { error: "Informe o custo (pode ser zero)." };
  if (dados.tipo === "feira" && !dados.mes) return { error: "Informe o mês e o ano da feira." };
  if (dados.tipo === "evento" && (!dados.ano || !dados.quantidade || dados.quantidade < 1)) {
    return { error: "Informe o ano e a quantidade de eventos." };
  }
  const retorno = dados.retorno
    .filter((r) => r.produto_id && Number(r.clientes) > 0)
    .map((r) => ({ produto_id: r.produto_id, plano_tipo: r.plano_tipo ?? null, plano_nome: r.plano_nome ?? null, clientes: Number(r.clientes) }));

  const supabase = await createClient();
  // Conta de referência: 2.1.8 Participação em Feiras e Eventos Setoriais (o custo entra em Marketing).
  const { data: conta } = await supabase.from("plano_contas").select("id").eq("codigo", "2.1.8").maybeSingle();
  const linha = {
    cenario_id: cenarioId,
    tipo: dados.tipo,
    nome,
    mes: dados.tipo === "feira" ? `${dados.mes!.slice(0, 7)}-01` : null,
    ano: dados.tipo === "evento" ? dados.ano : null,
    quantidade: dados.tipo === "evento" ? dados.quantidade : null,
    custo: dados.custo,
    retorno,
    plano_contas_id: conta?.id ?? null,
    observacoes: dados.observacoes?.trim() || null,
  };
  const { error } = dados.id
    ? await supabase.from("acoes_marketing").update(linha).eq("id", dados.id)
    : await supabase.from("acoes_marketing").insert(linha);
  if (error) return { error: "Não foi possível salvar a feira/evento." };

  const { falhas } = await recalcularTodosProdutos(cenarioId);
  revalidatePath(`/plano/${cenarioId}`, "layout");
  revalidatePath("/relatorios");
  return falhas.length > 0 ? { error: `Salvo, mas a projeção falhou em: ${falhas.join("; ")}` } : { error: null };
}

export async function excluirAcaoMarketing(id: string, cenarioId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("acoes_marketing").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  await recalcularTodosProdutos(cenarioId);
  revalidatePath(`/plano/${cenarioId}`, "layout");
  revalidatePath("/relatorios");
  return { error: null };
}
