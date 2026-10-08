"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { enviarPush } from "@/lib/push";

const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Quem foi citada com @ no texto: casa pelo primeiro nome (sem acento/maiúscula). */
export async function mencoesNoTexto(texto: string, pessoas: { id: string; nome: string }[]): Promise<string[]> {
  const citados = new Set<string>();
  for (const m of texto.matchAll(/@([\p{L}\p{N}_.-]+)/gu)) {
    const alvo = normalizar(m[1]);
    for (const p of pessoas) {
      const primeiro = normalizar(p.nome.trim().split(/\s+/)[0] ?? "");
      if (primeiro && (primeiro === alvo || normalizar(p.nome.replace(/\s+/g, "")) === alvo)) citados.add(p.id);
    }
  }
  return [...citados];
}

/** Observação na tarefa. @nome avisa a pessoa por push (link direto pra tarefa). */
export async function adicionarNota(tarefaId: string, textoBruto: string): Promise<{ error: string | null; avisadas?: number }> {
  const texto = textoBruto.trim();
  if (!texto) return { error: "Escreva a observação." };
  if (texto.length > 4000) return { error: "Observação longa demais (máx. 4000 caracteres)." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada — entre de novo." };

  const [{ data: pessoas }, { data: tarefa }] = await Promise.all([
    supabase.from("profiles").select("id, nome"),
    supabase.from("tarefas").select("id, titulo").eq("id", tarefaId).maybeSingle(),
  ]);
  if (!tarefa) return { error: "Tarefa não encontrada." };
  const mencoes = await mencoesNoTexto(texto, (pessoas ?? []) as { id: string; nome: string }[]);

  const { error } = await supabase.from("tarefa_notas").insert({ tarefa_id: tarefaId, texto, autor_id: user.id, mencoes });
  if (error) return { error: "Não foi possível salvar a observação." };

  // Aviso só pra quem foi citada (não pra quem escreveu).
  const autora = (pessoas ?? []).find((p) => p.id === user.id)?.nome?.split(" ")[0] ?? "Alguém";
  const alvos = mencoes.filter((id) => id !== user.id);
  let avisadas = 0;
  if (alvos.length > 0) {
    avisadas = await enviarPush(alvos, {
      title: `${autora.charAt(0).toUpperCase() + autora.slice(1)} mencionou você em uma tarefa`,
      body: `${tarefa.titulo}: ${texto.length > 120 ? `${texto.slice(0, 117)}…` : texto}`,
      url: `/tarefas?tarefa=${tarefaId}`,
    });
  }
  revalidatePath("/tarefas");
  return { error: null, avisadas };
}

export async function excluirNota(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tarefa_notas").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/tarefas");
  return { error: null };
}
