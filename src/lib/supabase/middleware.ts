import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { destinoComercialSeguro, ehHostComercial, ehHostGestaoProducao, URL_GESTAO } from "@/lib/hosts";

// /api/comercial/sessao recebe o token da entrada sem senha no host comercial: ainda não há sessão.
const PUBLIC_PATHS = ["/login", "/definir-senha", "/recuperar-senha", "/agendar", "/api/comercial/sessao"];

/** No host comercial só existe o app de propostas (e login, e as rotas de entrada). */
function rotaExisteNoComercial(pathname: string): boolean {
  return pathname.startsWith("/propostas") || pathname.startsWith("/api/comercial");
}

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

/** Investidor de fomento ou de equity: só a Prestação de Contas, nada mais — nem a Visão Geral
 * (que mostra gasto acumulado da empresa inteira, não só o do programa/rodada dele). É a conta
 * mais restrita do app: terceiro externo, sem relação de trabalho com a empresa. O investidor de
 * equity também pode baixar a planilha do MESMO cenário que é o escopo dele (nunca de outro). */
function rotaLiberadaParaInvestidor(pathname: string, escopoId: string | null): boolean {
  if (pathname === "/prestacao-de-contas" || pathname.startsWith("/prestacao-de-contas/")) return true;
  if (escopoId && pathname === `/plano/${escopoId}/investidor/export`) return true;
  return false;
}

/** Equipe (colaboradora interna, ex.: CTO): tudo que a sócia vê, menos o que é da relação
 * societária/fiscal — Documentos da empresa, Vendas (NF e receita das sócias) — e Configurações
 * (convites e papéis: ninguém se promove a sócia sozinha). */
const ROTAS_BLOQUEADAS_EQUIPE = ["/documentos", "/vendas", "/configuracoes"];

function rotaLiberadaParaEquipe(pathname: string): boolean {
  // Propostas comerciais: a equipe (vendedor/closer) monta e acompanha (08/10/2026).
  if (pathname.startsWith("/propostas")) return true;
  return !ROTAS_BLOQUEADAS_EQUIPE.some((prefixo) => pathname === prefixo || pathname.startsWith(`${prefixo}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const host = request.headers.get("host");
  const comercial = ehHostComercial(host);
  const { pathname } = request.nextUrl;

  // Dois hosts, um código (08/10/2026). comercial.* é só propostas: a raiz vai para a lista e
  // qualquer outra tela do Gestão volta para lá. No Gestão em produção, /propostas vive no outro
  // host: manda para a entrada sem senha, que leva a sessão junto. Em localhost nada disso roda.
  if (comercial && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/propostas";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (!comercial && ehHostGestaoProducao(host) && pathname.startsWith("/propostas")) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/comercial/entrar";
    url.search = `?next=${encodeURIComponent(destinoComercialSeguro(pathname + request.nextUrl.search))}`;
    return NextResponse.redirect(url);
  }

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
    // Guarda aonde a pessoa ia (ex.: link de uma tarefa) pra voltar lá depois do login.
    const destino = request.nextUrl.pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = destino !== "/" ? `?next=${encodeURIComponent(destino)}` : "";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = comercial ? "/propostas" : "/";
    return NextResponse.redirect(url);
  }

  if (comercial && user && !isPublicPath && !rotaExisteNoComercial(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/propostas";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Acesso por papel: contabilidade externa vê só o realizado; investidor (fomento ou equity) vê
  // só a Prestação de Contas. Fica no proxy (roda em toda rota, inclusive chamada direta de API)
  // — não é só esconder no menu, é o servidor recusando a página.
  if (user && !isPublicPath) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("papel, escopo_investidor_id")
      .eq("id", user.id)
      .maybeSingle();
    const papel = perfil?.papel;
    const liberado =
      papel === "contabilidade"
        ? rotaLiberadaParaContabilidade(request.nextUrl.pathname, request.nextUrl.searchParams)
        : papel === "investidor_fomento" || papel === "investidor"
          ? rotaLiberadaParaInvestidor(request.nextUrl.pathname, perfil?.escopo_investidor_id ?? null)
          : papel === "equipe"
            ? rotaLiberadaParaEquipe(request.nextUrl.pathname)
            : true;
    if (!liberado) {
      // No comercial não há "tela permitida" alternativa: contabilidade e investidor voltam ao Gestão.
      if (comercial) return NextResponse.redirect(new URL("/", URL_GESTAO));
      const url = request.nextUrl.clone();
      url.pathname = papel === "investidor_fomento" || papel === "investidor" ? "/prestacao-de-contas" : papel === "equipe" ? "/" : "/custos";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
