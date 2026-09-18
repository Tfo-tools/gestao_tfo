"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { gerarOcorrenciasRotinas, hojeSP, type Frequencia } from "@/lib/rotinas";

export type RotinaFormState = { error: string | null; success?: boolean };

const FREQUENCIAS: Frequencia[] = ["semanal", "quinzenal", "mensal", "trimestral", "anual"];

function revalidar() {
  revalidatePath("/tarefas");
  revalidatePath("/agenda");
}

export async function criarRotina(_prev: RotinaFormState, formData: FormData): Promise<RotinaFormState> {
  const titulo = String(formData.get("titulo") || "").trim();
  const frequencia = String(formData.get("frequencia") || "") as Frequencia;
  if (!titulo) return { error: "Dê um título pra rotina." };
  if (!FREQUENCIAS.includes(frequencia)) return { error: "Escolha a frequência." };

  const semana = frequencia === "semanal" || frequencia === "quinzenal";
  const num = (k: string) => {
    const v = formData.get(k);
    return v != null && v !== "" ? Number(v) : null;
  };
  const dia_semana = semana ? num("dia_semana") : null;
  const dia_mes = semana ? null : num("dia_mes");
  const mes_inicio = frequencia === "trimestral" || frequencia === "anual" ? num("mes_inicio") ?? 1 : null;
  if (semana && (dia_semana == null || dia_semana < 0 || dia_semana > 6)) return { error: "Escolha o dia da semana." };
  if (!semana && (dia_mes == null || dia_mes < 1 || dia_mes > 31)) return { error: "Informe o dia do mês (1 a 31)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("rotinas").insert({
    titulo,
    descricao: String(formData.get("descricao") || "").trim() || null,
    responsavel_id: String(formData.get("responsavel_id") || "") || null,
    frequencia,
    dia_semana,
    dia_mes,
    mes_inicio,
    inicio: hojeSP(),
    criado_por: user?.id ?? null,
  });
  if (error) return { error: "Não foi possível criar a rotina." };

  // A próxima ocorrência já aparece nas tarefas, sem esperar o cron do dia seguinte.
  await gerarOcorrenciasRotinas(supabase);
  revalidar();
  return { error: null, success: true };
}

/** Pausar não apaga o que já foi gerado; retomar volta a gerar dali pra frente. */
export async function alternarRotina(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  // Ao retomar, as datas que caíram durante a pausa não voltam retroativas: parte de hoje.
  const campos = ativo ? { ativo, gerado_ate: hojeSP() } : { ativo };
  const { error } = await supabase.from("rotinas").update(campos).eq("id", id);
  if (error) return { error: "Não foi possível mudar a rotina." };
  if (ativo) await gerarOcorrenciasRotinas(supabase);
  revalidar();
  return { error: null };
}

/**
 * Exclui a rotina. As tarefas já concluídas ficam como histórico; as abertas e futuras saem junto —
 * senão sobrariam tarefas de uma rotina que não existe mais.
 */
export async function excluirRotina(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  await supabase.from("tarefas").delete().eq("rotina_id", id).neq("status", "feito");
  const { error } = await supabase.from("rotinas").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir a rotina." };
  revalidar();
  return { error: null };
}
