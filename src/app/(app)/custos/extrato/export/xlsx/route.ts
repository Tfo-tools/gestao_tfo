import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { buscarDespesasFiltradas, nomesProdutosDe, resolverContaIdsPorTipo } from "@/lib/extrato-query";

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

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TFO-Gestão";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Extrato de despesas");
  sheet.columns = [
    { header: "Data", key: "data", width: 12 },
    { header: "Código conta", key: "codigo", width: 14 },
    { header: "Conta", key: "conta", width: 34 },
    { header: "Produto", key: "produto", width: 24 },
    { header: "Pagador", key: "pagador", width: 16 },
    { header: "Descrição", key: "descricao", width: 36 },
    { header: "Valor (R$)", key: "valor", width: 14 },
    { header: "Comprovado", key: "comprovado", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1E6E9" } };
  });

  for (const d of despesas) {
    sheet.addRow({
      data: new Date(`${d.data_gasto}T00:00:00`),
      codigo: d.plano_contas?.codigo ?? "",
      conta: d.plano_contas?.conta ?? "",
      produto: nomesProdutosDe(d),
      pagador: d.pagador ?? "",
      descricao: d.descricao ?? "",
      valor: Number(d.valor_total),
      comprovado: d.comprovado ? "Sim" : "Não",
    });
  }

  sheet.getColumn("data").numFmt = "dd/mm/yyyy";
  sheet.getColumn("valor").numFmt = "#,##0.00";

  const totalRow = sheet.addRow({
    conta: "Total",
    valor: { formula: `SUM(G2:G${despesas.length + 1})` },
  });
  totalRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="extrato-despesas.xlsx"`,
    },
  });
}
