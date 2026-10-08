import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Entrada direta no painel do Forms (forms.thefashionoffice.online/painel) para quem já está logado
 * no Gestão — o Gestão vira o login da equipe (pedido de 08/10/2026). O Forms tem Supabase próprio
 * (ICP-levantamento); aqui o Gestão gera um "magic link" para o e-mail da sócia e manda o navegador
 * para ele: o Supabase do Forms autentica e devolve ao painel já logado, sem senha.
 * Precisa de FORMS_SUPABASE_SERVICE_ROLE_KEY na Vercel (segredo; nunca vai pro navegador) e do
 * painel na lista de Redirect URLs do Auth do projeto do Forms.
 */
export const dynamic = "force-dynamic";

const FORMS_URL = process.env.FORMS_SUPABASE_URL || "https://pudtwbkwfftwwukbappm.supabase.co";
const PAINEL = process.env.FORMS_PAINEL_URL || "https://forms.thefashionoffice.online/painel";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "https://gestao.thefashionoffice.online"));

  const chave = process.env.FORMS_SUPABASE_SERVICE_ROLE_KEY;
  // Sem a chave configurada, cai no login normal do painel (não quebra o atalho).
  if (!chave) return NextResponse.redirect(`${PAINEL}?origem=gestao&motivo=sem_chave`);

  const admin = createSupabaseClient(FORMS_URL, chave, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
    options: { redirectTo: PAINEL },
  });
  if (error || !data?.properties?.action_link) {
    // E-mail sem conta no Forms (não está na equipe de lá) ou projeto pausado: painel normal.
    console.warn("Forms SSO: não gerou link para", user.email, error?.message);
    return NextResponse.redirect(`${PAINEL}?origem=gestao&motivo=${encodeURIComponent(error?.message ?? "sem_link")}`);
  }
  return NextResponse.redirect(data.properties.action_link);
}
