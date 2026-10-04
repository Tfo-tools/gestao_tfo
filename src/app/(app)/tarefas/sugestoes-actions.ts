"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Aprova uma sugestão da IA: vira tarefa (com o que a sócia ajustou na tela) e a sugestão sai da fila. */
export async function aprovarSugestao(
  id: string,
  dados: { titulo: string; responsavel_id: string | null; prazo: string | null; projeto_id: string | null },
): Promise<{ error: string | null }> {
  const titulo = dados.titulo.trim();
  if (!titulo) return { error: "A tarefa precisa de um título." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: sug } = await supabase.from("sugestoes_tarefa").select("id, ata_id, descricao, status").eq("id", id).maybeSingle();
  if (!sug) return { error: "Sugestão não encontrada." };
  if (sug.status !== "pendente") return { error: "Essa sugestão já foi decidida." };

  const { data: tarefa, error } = await supabase
    .from("tarefas")
    .insert({
      titulo,
      descricao: sug.descricao,
      responsavel_id: dados.responsavel_id,
      prazo: dados.prazo,
      projeto_id: dados.projeto_id,
      origem_ata_id: sug.ata_id,
      etiquetas: ["de-ata"],
      criado_por: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !tarefa) return { error: "Não foi possível criar a tarefa." };

  await supabase
    .from("sugestoes_tarefa")
    .update({ status: "aprovada", tarefa_id: tarefa.id, decidido_em: new Date().toISOString(), decidido_por: user?.id ?? null })
    .eq("id", id);
  revalidatePath("/tarefas");
  return { error: null };
}

export async function recusarSugestao(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("sugestoes_tarefa")
    .update({ status: "recusada", decidido_em: new Date().toISOString(), decidido_por: user?.id ?? null })
    .eq("id", id)
    .eq("status", "pendente");
  if (error) return { error: "Não foi possível recusar." };
  revalidatePath("/tarefas");
  return { error: null };
}
