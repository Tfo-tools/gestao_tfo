"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { executarSimulacaoCenarios, type ConfigSimulacao } from "@/lib/admin-tasks/simular-cenarios-vs-funses1";

export type ResultadoSimulacao = { ok: true; log: string[] } | { ok: false; erro: string } | null;

/**
 * Aplica as simulações "fração do FUNSES 1" nos cenários marcados no formulário. Roda com a sessão
 * de quem clicou — o FUNSES 1 é só lido; os cenários escolhidos têm plano, projeção e alocação de
 * vendedor reescritos (a cópia do estado anterior fica em simulacoes_backup).
 */
export async function aplicarSimulacoes(_prev: ResultadoSimulacao, formData: FormData): Promise<ResultadoSimulacao> {
  const supabase = await createClient();
  const nomes = formData.getAll("cenario").map(String).filter(Boolean);
  const configs: ConfigSimulacao[] = [];
  for (const nome of nomes) {
    const indice = Number(String(formData.get(`indice:${nome}`) ?? "").replace(",", "."));
    const churnTexto = String(formData.get(`churn:${nome}`) ?? "").trim();
    const churnPct = churnTexto === "" ? null : Number(churnTexto.replace(",", "."));
    if (!(indice > 0 && indice <= 3)) return { ok: false, erro: `Índice inválido para ${nome} (use algo entre 0,1 e 3).` };
    if (churnPct != null && !(churnPct >= 0 && churnPct < 30))
      return { ok: false, erro: `Churn inválido para ${nome} (informe % ao mês, ex.: 3,1, ou deixe vazio pra manter o do FUNSES 1).` };
    configs.push({ nome, indice, churnMensal: churnPct != null ? churnPct / 100 : null, regraVendedor: formData.get(`vendedor:${nome}`) === "on" });
  }
  if (configs.length === 0) return { ok: false, erro: "Marque pelo menos um cenário." };
  try {
    const { log } = await executarSimulacaoCenarios(supabase, configs);
    revalidatePath("/", "layout");
    return { ok: true, log };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
