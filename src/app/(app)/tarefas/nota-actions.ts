"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extrairAcoesDeTexto, type AcaoSugerida } from "@/lib/ia";

/** Etiqueta pela qual a tela agrupa/filtra: nome do programa em minúsculas, sem acentos nem espaços
 * ("Centelha III" → "centelha-iii"). Vínculo a programa é por etiqueta, não coluna nova — "Ver por:
 * etiqueta" em /tarefas já resolve "as tarefas do Centelha". */
export async function etiquetaDoPrograma(nome: string): Promise<string> {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Cola a mensagem (WhatsApp, e-mail, trecho de edital) e a IA sugere as ações. Nada vira tarefa
 * aqui — a lista volta pra tela pra revisão. Exigência sem data explícita entra sem prazo. */
export async function sugerirAcoesDeNota(texto: string, programaId: string | null): Promise<{ error: string | null; acoes: AcaoSugerida[] }> {
  const limpo = texto.trim();
  if (limpo.length < 10) return { error: "Cole a mensagem inteira — ficou curto demais pra extrair alguma coisa.", acoes: [] };
  const supabase = await createClient();
  const [{ data: pessoas }, programa] = await Promise.all([
    supabase.from("profiles").select("nome"),
    programaId ? supabase.from("programas_investimento").select("nome").eq("id", programaId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return extrairAcoesDeTexto(
    limpo,
    (pessoas ?? []).map((p) => p.nome),
    (programa.data as { nome: string } | null)?.nome ?? null,
  );
}

export async function criarTarefasDeNota(
  itens: { titulo: string; responsavel_id: string | null; prazo: string | null }[],
  programaId: string | null,
  textoOrigem: string,
): Promise<{ error: string | null; criadas: number }> {
  if (itens.length === 0) return { error: "Nenhuma tarefa selecionada.", criadas: 0 };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let etiquetas: string[] = [];
  if (programaId) {
    const { data: programa } = await supabase.from("programas_investimento").select("nome").eq("id", programaId).maybeSingle();
    if (programa?.nome) etiquetas = [await etiquetaDoPrograma(programa.nome)];
  }
  const origem = textoOrigem.trim();
  const descricao = origem ? `Origem (mensagem colada):\n${origem.length > 1500 ? origem.slice(0, 1500) + "…" : origem}` : null;

  const { error } = await supabase.from("tarefas").insert(
    itens.map((item) => ({
      titulo: item.titulo,
      descricao,
      responsavel_id: item.responsavel_id,
      prazo: item.prazo,
      etiquetas,
      criado_por: user?.id ?? null,
    })),
  );
  if (error) return { error: "Não foi possível criar as tarefas.", criadas: 0 };

  revalidatePath("/tarefas");
  return { error: null, criadas: itens.length };
}
