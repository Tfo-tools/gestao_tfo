import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/definir-senha", "/recuperar-senha", "/agendar"];

/** O que a conta de contabilidade externa enxerga: só o realizado (despesas, ativos, contratações
 * já fechadas, extrato/demonstrativo) — nada de projeção, cenário, valuation ou captação. Prefixo
 * "/" cai fora de propósito (não usa startsWith pra não liberar tudo); é checado à parte. */
const ROTAS_CONTABILIDADE = [
  "/tarefas",
  "/agenda",
  "/custos",
  "/ativos",
  "/contratacoes/realizado",
  "/relatorios",
];

function rotaLiberadaParaContabilidade(pathname: string, searchParams: URLSearchParams): boolean {
  if (pathname === "/") return true;
  // "/relatorios/mensal" é a projeção mês a mês de um CENÁRIO (simulação, staffing, premissas de
  // preço) — mesmo estando sob /relatorios, é dado de plano, não de realizado. Fica de fora.
  if (pathname === "/relatorios/mensal" || pathname.startsWith("/relatorios/mensal/")) return false;
  if (pathname === "/relatorios") return searchParams.get("aba") !== "planos";
  return ROTAS_CONTABILIDADE.some((prefixo) => pathname === prefixo || pathname.startsWith(`${prefixo}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Acesso da contabilidade externa: só o realizado. Fica no proxy (roda em toda rota, inclusive
  // chamada direta de API) — não é só esconder no menu, é o servidor recusando a página.
  if (user && !isPublicPath) {
    const { data: perfil } = await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle();
    if (perfil?.papel === "contabilidade" && !rotaLiberadaParaContabilidade(request.nextUrl.pathname, request.nextUrl.searchParams)) {
      const url = request.nextUrl.clone();
      url.pathname = "/custos";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
