import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { categoriaDeConta } from "@/lib/categoria-negocio";
import { gerarZipComprovantes, type LinhaComprovante } from "@/lib/export-comprovantes";

/** Baixar todas as faturas/NF e comprovantes de um período em um .zip só, com uma planilha índice
 * — é o que o contador (ou a própria sócia, antes de mandar pra ele) usa pra conferir tudo de uma
 * vez em vez de abrir lançamento por lançamento no app. Mesmo recorte de filtros do Extrato. */
export const maxDuration = 120;

function nextMonth(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde") || undefined;
  const ate = searchParams.get("ate") || undefined;
  const produto = searchParams.get("produto") || undefined;
  const comprovado = searchParams.get("comprovado") || undefined;
  const pagador = searchParams.get("pagador") || undefined;
  const conta = searchParams.get("conta") || undefined;
  const descricao = searchParams.get("descricao") || undefined;
  const tipo = searchParams.get("tipo") || undefined;

  const supabase = await createClient();

  const { data: planoContas } = await supabase
    .from("plano_contas")
    .select("id, codigo, conta, tipo")
    .in("tipo", ["cogs", "opex", "financeiro", "ativo"]);
  const tipoContaIds = tipo ? (planoContas ?? []).filter((c) => categoriaDeConta(c) === tipo).map((c) => c.id) : null;

  let query = supabase
    .from("despesas")
    .select(
      produto
        ? "id, data_gasto, valor_total, valor_fatura, forma_pagamento, comprovado, descricao, pagador, plano_contas:plano_contas_id(codigo, conta), despesa_produtos!inner(produtos(id, nome)), anexos_despesa(id, caminho_arquivo, nome_arquivo, tipo)"
        : "id, data_gasto, valor_total, valor_fatura, forma_pagamento, comprovado, descricao, pagador, plano_contas:plano_contas_id(codigo, conta), despesa_produtos(produtos(id, nome)), anexos_despesa(id, caminho_arquivo, nome_arquivo, tipo)",
    )
    .order("data_gasto", { ascending: true });

  if (desde) query = query.gte("data_gasto", `${desde}-01`);
  if (ate) query = query.lt("data_gasto", nextMonth(ate));
  if (produto) query = query.eq("despesa_produtos.produto_id", produto);
  if (comprovado === "sim") query = query.eq("comprovado", true);
  if (comprovado === "nao") query = query.eq("comprovado", false);
  if (pagador) query = query.eq("pagador", pagador);
  if (conta) query = query.eq("plano_contas_id", conta);
  if (tipoContaIds) query = query.in("plano_contas_id", tipoContaIds);
  if (descricao) query = query.ilike("descricao", `%${descricao}%`);

  const { data: despesas } = await query;
  const linhas = (despesas ?? []) as unknown as LinhaComprovante[];

  if (linhas.length === 0) {
    return new NextResponse("Nada encontrado nesse período/filtro.", { status: 404 });
  }

  const periodoTexto = desde || ate ? `${desde ?? "início"} a ${ate ?? "hoje"}` : "todo o período";
  const zipFinal = await gerarZipComprovantes(supabase, linhas, {
    tituloPlanilha: "Comprovantes e notas fiscais — TFO-Gestão",
    periodoTexto,
    notaExtra:
      'Pra decidir o que vira aporte de sócio (investimento a declarar): confira quem é o pagador de cada linha na coluna "Pagador" — pago pela sócia (não pela Empresa) é o que entra nessa análise.',
  });

  const nomeArquivo = `comprovantes-${(desde ?? "inicio").replace(/-/g, "")}-a-${(ate ?? "hoje").replace(/-/g, "")}.zip`;

  return new NextResponse(new Uint8Array(zipFinal), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
