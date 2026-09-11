import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleConfigurado, urlAutorizacaoGoogle } from "@/lib/google-calendar";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://gestaotfo.vercel.app";

/** Só quem já está logado no TFO-Gestão chega aqui (rota protegida pelo proxy/middleware) — evita
 * que alguém de fora dispare o fluxo de autorização. `?tipo=pessoal` conecta a agenda da própria
 * sócia logada (só leitura); sem isso (ou `?tipo=shared`) conecta a conta compartilhada
 * (contato@), a que recebe os eventos criados pelo agendamento público. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", SITE_URL));

  if (!googleConfigurado()) {
    return NextResponse.redirect(new URL("/agenda?erro=google_nao_configurado", SITE_URL));
  }

  const tipo = request.nextUrl.searchParams.get("tipo") === "pessoal" ? "pessoal" : "shared";
  return NextResponse.redirect(urlAutorizacaoGoogle(tipo));
}
