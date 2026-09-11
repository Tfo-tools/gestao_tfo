import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { trocarCodigoPorTokens } from "@/lib/google-calendar";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://gestaotfo.vercel.app";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const erroGoogle = request.nextUrl.searchParams.get("error");
  const tipo = request.nextUrl.searchParams.get("state") === "pessoal" ? "pessoal" : "shared";

  if (erroGoogle) {
    return NextResponse.redirect(new URL(`/agenda?erro=google_negou_acesso`, SITE_URL));
  }
  if (!code) {
    return NextResponse.redirect(new URL(`/agenda?erro=sem_code`, SITE_URL));
  }

  // Pra conexão pessoal, precisa saber de quem é — usa a sessão logada nesse mesmo navegador
  // (o fluxo todo do OAuth acontece na mesma aba), nunca um id vindo só do parâmetro state.
  let profileId: string | null = null;
  if (tipo === "pessoal") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL(`/agenda?erro=sessao_expirada`, SITE_URL));
    profileId = user.id;
  }

  try {
    const tokens = await trocarCodigoPorTokens(code);
    if (!tokens.refresh_token) {
      // Google só devolve refresh_token na primeira autorização (ou com prompt=consent, que já
      // forçamos) — se não veio, a conta provavelmente já tinha uma conexão anterior sem revogar.
      return NextResponse.redirect(new URL(`/agenda?erro=sem_refresh_token`, SITE_URL));
    }

    // Descobre o e-mail da conta que autorizou.
    const infoResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = infoResp.ok ? ((await infoResp.json()) as { email?: string }) : {};

    const admin = createAdminClient();
    // Só existe UMA conexão por vez para cada dono (compartilhada, ou cada pessoa) — substitui a
    // anterior se houver.
    const deleteQuery = admin.from("google_calendar_conexao").delete();
    await (profileId ? deleteQuery.eq("profile_id", profileId) : deleteQuery.is("profile_id", null));
    await admin.from("google_calendar_conexao").insert({
      profile_id: profileId,
      conta_email: info.email ?? "desconhecido",
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expira_em: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    });

    return NextResponse.redirect(new URL(`/agenda?conectado=1`, SITE_URL));
  } catch (e) {
    console.error("Erro no callback do Google:", e);
    return NextResponse.redirect(new URL(`/agenda?erro=falha_troca_token`, SITE_URL));
  }
}
