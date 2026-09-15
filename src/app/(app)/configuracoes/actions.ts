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

/** Muda o papel de uma usuária já cadastrada — Sócia (acesso completo) ou Contabilidade externa
 * (só Realizado: despesas, ativos, contratações fechadas e relatório real; sem cenário, projeção
 * nem captação — reforçado no proxy, não é só o menu). */
export async function alterarPapelUsuario(id: string, papel: "socia" | "contabilidade"): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ papel }).eq("id", id);
  if (error) return { error: "Não foi possível alterar o acesso." };
  revalidatePath("/configuracoes");
  return { error: null };
}
