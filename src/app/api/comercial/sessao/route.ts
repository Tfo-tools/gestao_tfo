import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinoComercialSeguro } from "@/lib/hosts";

/**
 * Segunda metade da entrada sem senha no comercial (ver /api/comercial/entrar): recebe o token do
 * link mágico gerado pelo Gestão, troca pela sessão NESTE host (o cookie fica em comercial.*) e segue
 * para a página pedida. Token é de uso único e expira em minutos. Rota pública no proxy.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const next = destinoComercialSeguro(request.nextUrl.searchParams.get("next"));
  if (!token_hash) redirect(`/login?next=${encodeURIComponent(next)}`);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash });
  if (error) {
    console.warn("Comercial SSO: token recusado", error.message);
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}
