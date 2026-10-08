import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { destinoComercialSeguro, ehHostComercial, URL_COMERCIAL, URL_GESTAO } from "@/lib/hosts";

/**
 * Botão "Comercial" do Gestão: quem já está logado aqui entra em comercial.thefashionoffice.online
 * sem digitar senha. Os dois hosts são o mesmo app e o mesmo Supabase de login, mas o cookie de
 * sessão é por host; então o Gestão gera um link mágico (sem e-mail) para o próprio usuário e manda
 * o navegador para /api/comercial/sessao no outro host, que troca o token pela sessão de lá.
 * Quem chega direto no comercial sem sessão vê a tela de login normal.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const next = destinoComercialSeguro(request.nextUrl.searchParams.get("next"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.redirect(`${URL_GESTAO}/login?next=${encodeURIComponent(`/api/comercial/entrar?next=${next}`)}`);
  }

  // Em desenvolvimento, ou se por algum motivo já estamos no host comercial, não há host a trocar.
  if (process.env.NODE_ENV !== "production" || ehHostComercial(request.headers.get("host"))) {
    return NextResponse.redirect(new URL(next, request.url));
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
  const token = data?.properties?.hashed_token;
  if (error || !token) {
    console.warn("Comercial SSO: não gerou link para", user.email, error?.message);
    return NextResponse.redirect(`${URL_COMERCIAL}/login?next=${encodeURIComponent(next)}`);
  }
  const destino = new URL("/api/comercial/sessao", URL_COMERCIAL);
  destino.searchParams.set("token_hash", token);
  destino.searchParams.set("next", next);
  return NextResponse.redirect(destino);
}
