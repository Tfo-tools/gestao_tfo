import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gerarZipComprovantes, type LinhaComprovante } from "@/lib/export-comprovantes";

/** Zip de comprovantes pro investidor de FOMENTO — escopo vem do perfil autenticado (nunca de
 * query string), pras contas orçadas no programa dele, no período das linhas do orçamento. Mesmo
 * gerador do Extrato, só muda a query que produz `linhas`. */
export const maxDuration = 120;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Não autenticado.", { status: 401 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("papel, escopo_investidor_id")
    .eq("id", user.id)
    .maybeSingle();

  if (perfil?.papel !== "investidor_fomento" || !perfil.escopo_investidor_id) {
    return new NextResponse("Sem acesso.", { status: 403 });
  }

  const { data: programa } = await supabase
    .from("programas_investimento")
    .select("nome")
    .eq("id", perfil.escopo_investidor_id)
    .single();

  // Período do orçamento: só pra constar no arquivo. Quem entra é a despesa VINCULADA ao programa
  // no lançamento (paga com o recurso dele) — não a conta nem a data. Antes entrava todo lançamento
  // nas contas orçadas, e o zip levava ao avaliador nota de despesa que não saiu do recurso.
  const { data: linhas } = await supabase
    .from("programa_linhas_previstas")
    .select("data_inicio, data_fim")
    .eq("programa_id", perfil.escopo_investidor_id);
  const datas = (linhas ?? []).flatMap((l) => [l.data_inicio, l.data_fim]).filter(Boolean) as string[];
  const desde = datas.length > 0 ? datas.reduce((a, b) => (a < b ? a : b)) : undefined;
  const ate = datas.length > 0 ? datas.reduce((a, b) => (a > b ? a : b)) : undefined;

  const { data: despesas } = await supabase
    .from("despesas")
    .select(
      "id, data_gasto, valor_total, valor_fatura, forma_pagamento, comprovado, descricao, pagador, plano_contas:plano_contas_id(codigo, conta), despesa_produtos(produtos(id, nome)), anexos_despesa(id, caminho_arquivo, nome_arquivo, tipo)",
    )
    .eq("programa_id", perfil.escopo_investidor_id)
    .order("data_gasto", { ascending: true });
  const linhasComprovante = (despesas ?? []) as unknown as LinhaComprovante[];
  if (linhasComprovante.length === 0) {
    return new NextResponse("Nenhuma despesa vinculada a esse programa ainda — nada pra baixar.", { status: 404 });
  }

  const zipFinal = await gerarZipComprovantes(supabase, linhasComprovante, {
    tituloPlanilha: `Prestação de contas — ${programa?.nome ?? "Programa de fomento"}`,
    periodoTexto: desde && ate ? `${desde} a ${ate}` : "todo o período orçado",
    notaExtra: "Despesas pagas com o recurso deste programa (vinculadas a ele no lançamento).",
  });

  const nomeArquivo = `prestacao-de-contas-${(programa?.nome ?? "programa").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.zip`;
  return new NextResponse(new Uint8Array(zipFinal), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
