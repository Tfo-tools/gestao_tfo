import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buscarDespesasFiltradas, nomesProdutosDe, resolverContaIdsPorTipo } from "@/lib/extrato-query";

function csvEscape(value: string) {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const contaIds = await resolverContaIdsPorTipo(supabase, searchParams.get("tipo"));

  const despesas = await buscarDespesasFiltradas(supabase, {
    desde: searchParams.get("desde"),
    ate: searchParams.get("ate"),
    conta: searchParams.get("conta"),
    contaIds,
    produto: searchParams.get("produto"),
    comprovado: searchParams.get("comprovado"),
    pagador: searchParams.get("pagador"),
    descricao: searchParams.get("descricao"),
  });

  const header = ["Data", "Código conta", "Conta", "Produto", "Pagador", "Descrição", "Valor (R$)", "Comprovado"];
  const rows = despesas.map((d) => [
    d.data_gasto,
    d.plano_contas?.codigo ?? "",
    d.plano_contas?.conta ?? "",
    nomesProdutosDe(d),
    d.pagador ?? "",
    d.descricao ?? "",
    String(d.valor_total).replace(".", ","),
    d.comprovado ? "Sim" : "Não",
  ]);

  const csv = [header, ...rows].map((row) => row.map((v) => csvEscape(String(v))).join(";")).join("\n");
  const csvWithBom = "﻿" + csv;

  return new NextResponse(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="extrato-despesas.csv"`,
    },
  });
}
