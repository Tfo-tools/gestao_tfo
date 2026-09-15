import JSZip from "jszip";
import ExcelJS from "exceljs";

/**
 * Monta o .zip de comprovantes + planilha índice a partir de uma lista de despesas já filtrada —
 * usado tanto pela exportação livre do Extrato quanto pela Prestação de Contas (que filtra pelas
 * contas de um programa de fomento específico). A lógica de pastas/planilha é uma só; só a query
 * que produz `linhas` muda de um lugar pro outro.
 */

export type LinhaComprovante = {
  id: string;
  data_gasto: string;
  valor_total: number;
  valor_fatura: number | null;
  forma_pagamento: string | null;
  comprovado: boolean;
  descricao: string | null;
  pagador: string | null;
  plano_contas: { codigo: string; conta: string } | null;
  despesa_produtos: { produtos: { id: string; nome: string } | null }[];
  anexos_despesa: { id: string; caminho_arquivo: string; nome_arquivo: string; tipo: string }[];
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

/** Nome de pasta/arquivo seguro dentro do zip — sem "/" (viraria subpasta indesejada) nem
 * caracteres que travam em Windows. */
function nomeSeguro(s: string, max = 60): string {
  return (
    s
      .replace(/[/\\:*?"<>|]/g, "-")
      .trim()
      .slice(0, max) || "sem-nome"
  );
}

const LABEL_TIPO_ANEXO: Record<string, string> = {
  fatura: "Fatura-NF",
  comprovante_pagamento: "Comprovante",
  documento: "Documento",
};

export async function gerarZipComprovantes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  linhas: LinhaComprovante[],
  opts: { tituloPlanilha: string; periodoTexto: string; notaExtra?: string },
): Promise<Buffer> {
  const zip = new JSZip();
  const pastasUsadas = new Map<string, number>();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Índice");
  sheet.columns = [
    { header: "Data", key: "data", width: 12 },
    { header: "Descrição", key: "descricao", width: 40 },
    { header: "Categoria", key: "categoria", width: 42 },
    { header: "Produto(s)", key: "produto", width: 22 },
    { header: "Pagador", key: "pagador", width: 14 },
    { header: "Valor pago", key: "valor", width: 14 },
    { header: "Valor da fatura", key: "fatura", width: 14 },
    { header: "Forma de pagamento", key: "forma", width: 20 },
    { header: "Comprovado", key: "comprovado", width: 12 },
    { header: "Tem fatura/NF", key: "temFatura", width: 13 },
    { header: "Tem comprovante", key: "temComprovante", width: 15 },
    { header: "Pasta no zip", key: "pasta", width: 50 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1E6E9" } };
  });

  let semAnexo = 0;
  for (const d of linhas) {
    const categoria = d.plano_contas ? `${d.plano_contas.codigo} — ${d.plano_contas.conta}` : "—";
    const produtos = d.despesa_produtos
      .map((dp) => dp.produtos?.nome)
      .filter(Boolean)
      .join(", ");
    const temFatura = d.anexos_despesa.some((a) => a.tipo === "fatura");
    const temComprovante = d.anexos_despesa.some((a) => a.tipo === "comprovante_pagamento");

    let pastaLabel = "— sem arquivo anexado —";
    if (d.anexos_despesa.length > 0) {
      const base = `${d.data_gasto.slice(0, 7)}/${d.data_gasto.slice(8, 10)} - ${nomeSeguro(d.descricao || categoria)} (${formatBRL(Number(d.valor_total))})`;
      const usos = pastasUsadas.get(base) ?? 0;
      pastasUsadas.set(base, usos + 1);
      pastaLabel = usos > 0 ? `${base} (${usos + 1})` : base;

      const pasta = zip.folder(pastaLabel)!;
      for (const anexo of d.anexos_despesa) {
        const { data: arquivo } = await supabase.storage.from("comprovantes").download(anexo.caminho_arquivo);
        if (!arquivo) continue;
        const buffer = Buffer.from(await arquivo.arrayBuffer());
        const prefixo = LABEL_TIPO_ANEXO[anexo.tipo] ?? "Arquivo";
        pasta.file(`${prefixo} - ${nomeSeguro(anexo.nome_arquivo, 80)}`, buffer);
      }
    } else {
      semAnexo++;
    }

    sheet.addRow({
      data: formatDate(d.data_gasto),
      descricao: d.descricao || "",
      categoria,
      produto: produtos || "Geral",
      pagador: d.pagador || "",
      valor: Number(d.valor_total),
      fatura: d.valor_fatura != null ? Number(d.valor_fatura) : null,
      forma: d.forma_pagamento || "",
      comprovado: d.comprovado ? "Sim" : "Não",
      temFatura: temFatura ? "Sim" : "Não",
      temComprovante: temComprovante ? "Sim" : "Não",
      pasta: pastaLabel,
    });
  }
  sheet.getColumn("valor").numFmt = '"R$" #,##0.00';
  sheet.getColumn("fatura").numFmt = '"R$" #,##0.00';
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    for (const col of ["temFatura", "temComprovante"]) {
      const cell = row.getCell(col);
      if (cell.value === "Não") cell.font = { color: { argb: "FFA8482F" }, bold: true };
    }
  });

  const notas = workbook.addWorksheet("Leia-me");
  notas.columns = [{ width: 100 }];
  notas.addRow([opts.tituloPlanilha]).font = { bold: true, size: 13 };
  notas.addRow([`Período: ${opts.periodoTexto} · ${linhas.length} lançamento(s) · gerado em ${new Date().toLocaleString("pt-BR")}`]);
  notas.addRow([]);
  notas.addRow(["Cada lançamento com arquivo vira uma pasta (data - descrição - valor) com os arquivos dele dentro."]);
  notas.addRow([
    'A aba "Índice" lista TODOS os lançamentos do período, com ou sem arquivo — o que está em vermelho (\'Não\') ainda não tem fatura/NF ou comprovante anexado.',
  ]);
  if (semAnexo > 0) {
    notas.addRow([`${semAnexo} lançamento(s) deste período ainda não têm nenhum arquivo anexado — aparecem só na planilha, sem pasta no zip.`]);
  }
  if (opts.notaExtra) {
    notas.addRow([]);
    notas.addRow([opts.notaExtra]);
  }

  zip.file("Índice e leia-me.xlsx", await workbook.xlsx.writeBuffer());
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
