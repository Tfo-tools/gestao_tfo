import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvEscape(value: string) {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get("mes");
  const produto = searchParams.get("produto");
  const comprovado = searchParams.get("comprovado");
  const pagador = searchParams.get("pagador");

  let query = supabase
    .from("despesas")
    .select(
      "data_gasto, valor_total, comprovado, descricao, pagador, plano_contas:plano_contas_id(codigo, conta), produtos:produto_id(nome)",
    )
    .order("data_gasto", { ascending: false });

  if (mes) {
    const [y, m] = mes.split("-").map(Number);
    const next = new Date(y, m, 1);
    query = query
      .gte("data_gasto", `${mes}-01`)
      .lt("data_gasto", `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`);
  }
  if (produto) query = query.eq("produto_id", produto);
  if (comprovado === "sim") query = query.eq("comprovado", true);
  if (comprovado === "nao") query = query.eq("comprovado", false);
  if (pagador) query = query.eq("pagador", pagador);

  const { data: despesas } = await query;

  const header = ["Data", "Código conta", "Conta", "Produto", "Pagador", "Descrição", "Valor (R$)", "Comprovado"];
  const rows = (despesas ?? []).map((d) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conta = d.plano_contas as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const produtoRow = d.produtos as any;
    return [
      d.data_gasto,
      conta?.codigo ?? "",
      conta?.conta ?? "",
      produtoRow?.nome ?? "",
      d.pagador ?? "",
      d.descricao ?? "",
      String(d.valor_total).replace(".", ","),
      d.comprovado ? "Sim" : "Não",
    ];
  });

  const csv = [header, ...rows].map((row) => row.map((v) => csvEscape(String(v))).join(";")).join("\n");
  const csvWithBom = "﻿" + csv;

  return new NextResponse(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="extrato-despesas.csv"`,
    },
  });
}
