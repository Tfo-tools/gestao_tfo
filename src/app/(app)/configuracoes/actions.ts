"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ConvidarState = { error: string | null; success?: boolean };

export async function convidarUsuario(
  _prevState: ConvidarState,
  formData: FormData,
): Promise<ConvidarState> {
  const email = String(formData.get("email") || "").trim();
  const nome = String(formData.get("nome") || "").trim();
  const papelRaw = String(formData.get("papel") || "socia");
  const papel = papelRaw === "contabilidade" ? "contabilidade" : "socia";

  if (!email) {
    return { error: "Informe o e-mail." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { ...(nome ? { nome } : {}), papel },
    redirectTo: `${siteUrl}/definir-senha`,
  });

  if (error) {
    return { error: error.message.includes("already been registered")
      ? "Esse e-mail já tem um convite ou conta ativa."
      : "Não foi possível enviar o convite." };
  }

  revalidatePath("/configuracoes");
  return { error: null, success: true };
}

export type PapelUsuario = "socia" | "contabilidade" | "investidor_fomento" | "investidor";

/** Muda o papel de uma usuária já cadastrada. Sócia: acesso completo. Contabilidade externa: só
 * Realizado (despesas, ativos, contratações fechadas, relatório real — sem cenário, projeção nem
 * captação). Investidor de fomento/equity: só a Prestação de Contas, escopada a UM programa ou
 * cenário (ver escopo_investidor_id) — reforçado no proxy, não é só o menu. Trocar PARA investidor
 * limpa o escopo anterior; quem muda precisa escolher de novo em seguida. */
export async function alterarPapelUsuario(id: string, papel: PapelUsuario): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const ehInvestidor = papel === "investidor_fomento" || papel === "investidor";
  const { error } = await supabase
    .from("profiles")
    .update({ papel, ...(ehInvestidor ? {} : { escopo_investidor_id: null }) })
    .eq("id", id);
  if (error) return { error: "Não foi possível alterar o acesso." };
  revalidatePath("/configuracoes");
  return { error: null };
}

/** Define QUAL programa de fomento (papel investidor_fomento) ou cenário (papel investidor) essa
 * conta enxerga — nunca os dois, nunca "todos". Sem escopo definido, a Prestação de Contas não tem
 * o que mostrar pra essa conta. */
export async function definirEscopoInvestidor(id: string, escopoId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ escopo_investidor_id: escopoId || null }).eq("id", id);
  if (error) return { error: "Não foi possível definir o escopo." };
  revalidatePath("/configuracoes");
  return { error: null };
}
