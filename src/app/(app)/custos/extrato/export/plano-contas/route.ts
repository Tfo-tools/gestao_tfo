import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

const LABEL_TIPO: Record<string, string> = {
  receita: "Receita",
  deducao: "Dedução",
  cogs: "COGS",
  opex: "Opex",
  financeiro: "Financeiro",
  capital: "Capital",
  ativo: "Ativo",
};

const LABEL_CLASSIFICACAO: Record<string, string> = {
  fixa: "Fixa",
  variavel: "Variável",
};

export async function GET() {
  const supabase = await createClient();
  const { data: contas } = await supabase
    .from("plano_contas")
    .select("codigo, conta, tipo, classificacao, descricao, parent_codigo")
    .order("codigo");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TFO-Gestão";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Plano de contas");
  sheet.columns = [
    { header: "Código", key: "codigo", width: 14 },
    { header: "Conta", key: "conta", width: 46 },
    { header: "Tipo (DRE)", key: "tipo", width: 14 },
    { header: "Classificação", key: "classificacao", width: 14 },
    { header: "Descrição", key: "descricao", width: 50 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1E6E9" } };
  });

  for (const c of contas ?? []) {
    const ehTitulo = !c.parent_codigo;
    const row = sheet.addRow({
      codigo: c.codigo,
      conta: c.conta,
      tipo: LABEL_TIPO[c.tipo] ?? c.tipo,
      classificacao: c.classificacao ? LABEL_CLASSIFICACAO[c.classificacao] : "",
      descricao: c.descricao ?? "",
    });
    if (ehTitulo) row.font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plano-de-contas.xlsx"`,
    },
  });
}
