"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConvidarState = { error: string | null; success?: boolean };

export async function convidarUsuario(
  _prevState: ConvidarState,
  formData: FormData,
): Promise<ConvidarState> {
  const email = String(formData.get("email") || "").trim();
  const nome = String(formData.get("nome") || "").trim();

  if (!email) {
    return { error: "Informe o e-mail." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: nome ? { nome } : undefined,
    redirectTo: `${siteUrl}/auth/confirm?next=/definir-senha`,
  });

  if (error) {
    return { error: error.message.includes("already been registered")
      ? "Esse e-mail já tem um convite ou conta ativa."
      : "Não foi possível enviar o convite." };
  }

  revalidatePath("/configuracoes");
  return { error: null, success: true };
}
