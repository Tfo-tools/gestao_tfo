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
  return !ROTAS_BLOQUEADAS_EQUIPE.some((prefixo) => pathname === prefixo || pathname.startsWith(`${prefixo}/`));
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
      const url = request.nextUrl.clone();
      url.pathname = papel === "investidor_fomento" || papel === "investidor" ? "/prestacao-de-contas" : papel === "equipe" ? "/" : "/custos";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
