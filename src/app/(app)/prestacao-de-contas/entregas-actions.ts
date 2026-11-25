"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Resultado = { error: string | null };

/** Só a sócia mexe na execução das atividades. Investidor/auditor é leitura. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exigirSocia(supabase: any): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Sessão expirada.";
  const { data: perfil } = await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle();
  if ((perfil?.papel ?? "socia") !== "socia") return "Sem permissão para editar a execução.";
  return null;
}

const STATUS_OK = ["previsto", "andamento", "entregue"] as const;

/**
 * Define a execução de uma atividade: status e data real de entrega. Entregar sem data assume
 * a data prevista; marcar como não-entregue limpa a data real.
 */
export async function definirExecucao(linhaId: string, status: string, fimReal: string | null): Promise<Resultado> {
  const supabase = await createClient();
  const erro = await exigirSocia(supabase);
  if (erro) return { error: erro };
  if (!STATUS_OK.includes(status as (typeof STATUS_OK)[number])) return { error: "Status inválido." };

  const patch: { status: string; fim_real: string | null } = {
    status,
    fim_real: status === "entregue" ? fimReal : null,
  };
  const { error } = await supabase.from("programa_linhas_previstas").update(patch).eq("id", linhaId);
  if (error) return { error: "Não consegui salvar a execução." };
  revalidatePath("/prestacao-de-contas");
  return { error: null };
}

/** Define (ou limpa) o valor negociado de uma linha — o orçamento fechado vira o valor oficial. */
export async function definirNegociado(linhaId: string, valor: number | null): Promise<Resultado> {
  const supabase = await createClient();
  const erro = await exigirSocia(supabase);
  if (erro) return { error: erro };
  if (valor != null && (!Number.isFinite(valor) || valor < 0)) return { error: "Valor inválido." };
  const { error } = await supabase.from("programa_linhas_previstas").update({ negociado: valor }).eq("id", linhaId);
  if (error) return { error: "Não consegui salvar o valor negociado." };
  revalidatePath("/prestacao-de-contas");
  return { error: null };
}

/** Vincula (ou desvincula) uma despesa a uma atividade — é o que acende o ponto de pago na barra. */
export async function vincularDespesaEntrega(despesaId: string, linhaId: string | null): Promise<Resultado> {
  const supabase = await createClient();
  const erro = await exigirSocia(supabase);
  if (erro) return { error: erro };
  const { error } = await supabase.from("despesas").update({ linha_id: linhaId }).eq("id", despesaId);
  if (error) return { error: "Não consegui vincular a despesa." };
  revalidatePath("/prestacao-de-contas");
  return { error: null };
}
