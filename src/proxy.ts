import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Endereço oficial do app. Os endereços antigos da Vercel (produção) redirecionam pra cá, pra
// ninguém ficar no *.vercel.app. Previews (gestao-<hash>-…vercel.app) NÃO entram aqui — seguem
// funcionando pra teste.
const DOMINIO = "https://gestao.thefashionoffice.online";
const HOSTS_ANTIGOS = new Set(["gestaotfo.vercel.app", "gestaotfo-vanessaugulino-archs-projects.vercel.app"]);

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (HOSTS_ANTIGOS.has(host)) {
    const destino = new URL(request.nextUrl.pathname + request.nextUrl.search, DOMINIO);
    return NextResponse.redirect(destino, 308); // 308 preserva método e corpo (não quebra feeds nem POST)
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|apple-touch-icon.png|icons/|api/cron|api/feed|api/webhooks|api/entrada|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
