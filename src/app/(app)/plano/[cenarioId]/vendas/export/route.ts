import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { FASES } from "@/lib/fases";

type Linha = {
  produto_id: string;
  mes_referencia: string;
  clientes_ativos: number;
  novos_clientes: number;
  novos_direto: number;
  novos_representante: number;
  novos_associacao: number;
  clientes_perdidos: number;
  churn_pct: number | null;
  receita_bruta: number;
  mrr: number;
  receita_implementacao: number;
  implementacoes_ativas: number;
};

const CABECALHO = "FFF1E6E9";
const FECHAMENTO = "FFEDEDED";

export async function GET(request: NextRequest, { params }: { params: Promise<{ cenarioId: string }> }) {
  const { cenarioId } = await params;
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  // A tela manda os produtos marcados nos chips; sem filtro, exporta o portfólio inteiro.
  const filtro = searchParams.get("produtos")?.split(",").filter(Boolean) ?? null;

  const [{ data: cenario }, { data: produtos }, { data: projecao }, { data: fasesTodas }, { data: canais }, { data: planos }, { data: modulos }] =
    await Promise.all([
    supabase.from("cenarios").select("id, nome, data_inicio, data_fim").eq("id", cenarioId).single(),
    supabase.from("produtos").select("id, nome").or(`cenario_id.is.null,cenario_id.eq.${cenarioId}`).order("nome"),
    supabase
      .from("simulacao_mensal")
      .select(
        "produto_id, mes_referencia, clientes_ativos, novos_clientes, novos_direto, novos_representante, novos_associacao, clientes_perdidos, churn_pct, receita_bruta, mrr, receita_implementacao, implementacoes_ativas",
      )
      .eq("cenario_id", cenarioId)
      .order("mes_referencia"),
    supabase.from("fases_produto").select("produto_id, fase, data_inicio").eq("cenario_id", cenarioId),
    supabase
      .from("canais_aquisicao")
      .select("nome, tipo_canal, canal_produto(produto_id, percentual_mix, taxa_fechamento, desconto_cliente_pct, desconto_implementacao_pct, isencao_implementacao)")
      .eq("cenario_id", cenarioId)
      .order("nome"),
    supabase.from("planos_precificacao").select("produto_id, tipo_cobranca, preco, mix_percentual").order("produto_id"),
    supabase.from("modulos_produto").select("produto_id, nome, preco, adesao_inicial_pct, data_disponibilidade").order("data_disponibilidade"),
  ]);

  if (!cenario) return new NextResponse("Cenário não encontrado", { status: 404 });

  const nomeProduto = new Map((produtos ?? []).map((p) => [p.id, p.nome]));
  const faseLabel = new Map(FASES.map((f) => [f.value, f.label]));
  const faseDoMes = (produtoId: string, mesIso: string) => {
    const mes = new Date(mesIso + "T00:00:00");
    const candidatas = (fasesTodas ?? [])
      .filter((f) => f.produto_id === produtoId && f.data_inicio && new Date(f.data_inicio + "T00:00:00") <= mes)
      .sort((a, b) => (a.data_inicio! < b.data_inicio! ? 1 : -1));
    return candidatas[0] ? (faseLabel.get(candidatas[0].fase) ?? candidatas[0].fase) : "";
  };

  const linhas = ((projecao ?? []) as Linha[])
    .filter((l) => !filtro || filtro.includes(l.produto_id))
    .filter((l) => (!cenario.data_inicio || l.mes_referencia >= cenario.data_inicio) && (!cenario.data_fim || l.mes_referencia <= cenario.data_fim));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TFO-Gestão";
  workbook.created = new Date();

  /** Monta uma aba: um mês por linha, com a linha de fechamento ao fim de cada exercício. */
  function montarAba(titulo: string, dados: Linha[], comFase: string | null) {
    const sheet = workbook.addWorksheet(titulo.slice(0, 31));
    sheet.columns = [
      { header: "Mês", key: "mes", width: 12 },
      ...(comFase ? [{ header: "Fase", key: "fase", width: 14 }] : []),
      { header: "Clientes", key: "clientes", width: 11 },
      { header: "Novos direto", key: "direto", width: 13 },
      { header: "Novos representantes", key: "repres", width: 20 },
      { header: "Novos associações", key: "assoc", width: 18 },
      { header: "Total novos", key: "novos", width: 12 },
      { header: "Saíram", key: "saidas", width: 10 },
      { header: "Implementações", key: "implementacoes", width: 15 },
      { header: "Receita implantação (R$)", key: "receitaImpl", width: 22 },
      { header: "Faturamento (R$)", key: "receita", width: 17 },
      { header: "Ticket médio (R$)", key: "arpu", width: 17 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CABECALHO } };
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // Consolida por mês (a aba do portfólio soma os produtos; a de um produto só passa direto).
    const porMes = new Map<string, Linha>();
    for (const l of dados) {
      const atual = porMes.get(l.mes_referencia);
      if (!atual) {
        porMes.set(l.mes_referencia, { ...l });
        continue;
      }
      atual.clientes_ativos += l.clientes_ativos;
      atual.novos_clientes += l.novos_clientes;
      atual.novos_direto += l.novos_direto;
      atual.novos_representante += l.novos_representante;
      atual.novos_associacao += l.novos_associacao;
      atual.clientes_perdidos += l.clientes_perdidos;
      atual.receita_bruta += l.receita_bruta;
      atual.mrr += Number(l.mrr ?? 0);
      atual.receita_implementacao += Number(l.receita_implementacao ?? 0);
      atual.implementacoes_ativas += Number(l.implementacoes_ativas ?? 0);
    }
    const meses = [...porMes.values()]
      .filter((l) => l.clientes_ativos > 0 || l.novos_clientes > 0)
      .sort((a, b) => (a.mes_referencia < b.mes_referencia ? -1 : 1));

    let acumulado: Linha[] = [];
    const fecharAno = () => {
      if (acumulado.length === 0) return;
      const receita = acumulado.reduce((s, l) => s + l.receita_bruta, 0);
      const receitaImpl = acumulado.reduce((s, l) => s + Number(l.receita_implementacao ?? 0), 0);
      const implMes = acumulado.reduce((s, l) => s + Number(l.implementacoes_ativas ?? 0), 0);
      const clientesMes = acumulado.reduce((s, l) => s + l.clientes_ativos, 0);
      const meses12 = acumulado.length === 12;
      const ano = acumulado[0].mes_referencia.slice(0, 4);
      const row = sheet.addRow({
        mes: meses12 ? ano : `${ano} (${acumulado.length} ${acumulado.length === 1 ? "mês" : "meses"})`,
        ...(comFase ? { fase: "" } : {}),
        clientes: acumulado[acumulado.length - 1].clientes_ativos,
        direto: acumulado.reduce((s, l) => s + l.novos_direto, 0),
        repres: acumulado.reduce((s, l) => s + l.novos_representante, 0),
        assoc: acumulado.reduce((s, l) => s + l.novos_associacao, 0),
        novos: acumulado.reduce((s, l) => s + l.novos_clientes, 0),
        saidas: acumulado.reduce((s, l) => s + l.clientes_perdidos, 0),
        implementacoes: implMes,
        receitaImpl,
        receita,
        arpu: clientesMes + implMes > 0 ? receita / (clientesMes + implMes) : 0,
      });
      row.font = { bold: true };
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FECHAMENTO } };
        cell.border = { top: { style: "thin" } };
      });
      acumulado = [];
    };

    for (const l of meses) {
      if (acumulado.length > 0 && l.mes_referencia.slice(0, 4) !== acumulado[0].mes_referencia.slice(0, 4)) fecharAno();
      sheet.addRow({
        mes: new Date(l.mes_referencia + "T00:00:00"),
        ...(comFase ? { fase: faseDoMes(comFase, l.mes_referencia) } : {}),
        clientes: l.clientes_ativos,
        direto: l.novos_direto,
        repres: l.novos_representante,
        assoc: l.novos_associacao,
        novos: l.novos_clientes,
        saidas: l.clientes_perdidos,
        implementacoes: Number(l.implementacoes_ativas ?? 0),
        receitaImpl: Number(l.receita_implementacao ?? 0),
        receita: l.receita_bruta,
        arpu:
          l.clientes_ativos + Number(l.implementacoes_ativas ?? 0) > 0
            ? l.receita_bruta / (l.clientes_ativos + Number(l.implementacoes_ativas ?? 0))
            : 0,
      });
      acumulado.push(l);
    }
    fecharAno();

    sheet.getColumn("mes").numFmt = "mmm/yyyy";
    sheet.getColumn("receita").numFmt = "#,##0.00";
    sheet.getColumn("receitaImpl").numFmt = "#,##0.00";
    sheet.getColumn("arpu").numFmt = "#,##0.00";
    for (const k of ["clientes", "direto", "repres", "assoc", "novos", "saidas", "implementacoes"]) sheet.getColumn(k).numFmt = "#,##0";
  }

  const produtosNaExportacao = [...new Set(linhas.map((l) => l.produto_id))];
  if (produtosNaExportacao.length > 1) montarAba("Portfólio", linhas, null);
  for (const pid of produtosNaExportacao) {
    montarAba(nomeProduto.get(pid) ?? "Produto", linhas.filter((l) => l.produto_id === pid), pid);
  }
  if (produtosNaExportacao.length === 0) montarAba("Portfólio", [], null);

  // Aba de mix: de onde vem a venda (canal) e o que o cliente assina (plano/nível). Sem ela o
  // leitor não tem como conferir os números das outras abas — só vê o resultado.
  const mix = workbook.addWorksheet("Mix de venda");
  mix.columns = [
    { header: "Produto", key: "produto", width: 18 },
    { header: "Origem", key: "origem", width: 42 },
    { header: "% da venda", key: "pct", width: 12 },
    { header: "Fecha", key: "fecha", width: 10 },
    { header: "Preço (R$)", key: "preco", width: 13 },
    { header: "Benefício ao cliente", key: "beneficio", width: 40 },
  ];
  mix.getRow(1).font = { bold: true };
  mix.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CABECALHO } };
  });
  mix.views = [{ state: "frozen", ySplit: 1 }];

  const pct = (v: unknown) => (v == null ? null : Number(v));
  for (const p of produtos ?? []) {
    const titulo = mix.addRow({ produto: p.nome, origem: "— CANAIS DE AQUISIÇÃO —" });
    titulo.font = { bold: true };
    titulo.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FECHAMENTO } };
    });
    for (const c of canais ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linha = ((c.canal_produto ?? []) as any[]).find((l) => l.produto_id === p.id);
      if (!linha || Number(linha.percentual_mix ?? 0) <= 0) continue;
      const beneficios: string[] = [];
      if (linha.desconto_cliente_pct) beneficios.push(`${(Number(linha.desconto_cliente_pct) * 100).toFixed(0)}% de desconto`);
      if (linha.isencao_implementacao) beneficios.push("implementação isenta");
      else if (linha.desconto_implementacao_pct)
        beneficios.push(`${(Number(linha.desconto_implementacao_pct) * 100).toFixed(0)}% off na implementação`);
      mix.addRow({
        origem: `${c.nome} (${c.tipo_canal})`,
        pct: pct(linha.percentual_mix),
        fecha: pct(linha.taxa_fechamento),
        beneficio: beneficios.join(", ") || "—",
      });
    }

    const planosDoProduto = (planos ?? []).filter((pl) => pl.produto_id === p.id);
    const modulosDoProduto = (modulos ?? []).filter((m) => m.produto_id === p.id);
    if (planosDoProduto.length > 0 || modulosDoProduto.length > 0) {
      const t2 = mix.addRow({ origem: "— PLANOS / NÍVEIS —" });
      t2.font = { bold: true };
      t2.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FECHAMENTO } };
      });
      for (const pl of planosDoProduto) {
        mix.addRow({
          origem: `Cobrança ${pl.tipo_cobranca}`,
          pct: Number(pl.mix_percentual ?? 0) / 100,
          preco: Number(pl.preco),
          beneficio: "Preço sempre mensal; a cobrança define o tempo mínimo de permanência.",
        });
      }
      for (const m of modulosDoProduto) {
        mix.addRow({
          origem: `${m.nome} (a partir de ${m.data_disponibilidade ?? "—"})`,
          pct: pct(m.adesao_inicial_pct),
          preco: Number(m.preco),
          beneficio: "Níveis são excludentes: o % é a fatia da base que fica neste nível.",
        });
      }
    }
    mix.addRow({});
  }
  mix.getColumn("pct").numFmt = "0.0%";
  mix.getColumn("fecha").numFmt = "0.0%";
  mix.getColumn("preco").numFmt = "#,##0.00";

  // Aba de contexto: sem isso a planilha circula sem dizer de qual cenário e de quando ela é.
  const capa = workbook.addWorksheet("Premissas");
  capa.columns = [
    { header: "Item", key: "item", width: 28 },
    { header: "Valor", key: "valor", width: 46 },
  ];
  capa.getRow(1).font = { bold: true };
  capa.addRow({ item: "Cenário", valor: cenario.nome });
  capa.addRow({ item: "Período do cenário", valor: `${cenario.data_inicio ?? "—"} a ${cenario.data_fim ?? "—"}` });
  capa.addRow({ item: "Produtos", valor: produtosNaExportacao.map((p) => nomeProduto.get(p) ?? p).join(", ") || "—" });
  capa.addRow({ item: "Gerado em", valor: new Date().toLocaleString("pt-BR") });
  capa.addRow({ item: "Faturamento", valor: "Receita bruta: mensalidades + implementação, líquido de descontos de combo e canal." });
  capa.addRow({ item: "Ticket médio", valor: "Receita total ÷ cobranças do mês (assinaturas ativas + parcelas de implementação em andamento)." });
capa.addRow({ item: "Receita implantação", valor: "Parcelas de implementação do mês, já líquidas do desconto do canal de origem." });
  capa.addRow({ item: "Linhas de ano", valor: "Fecham o exercício. Anos com menos de 12 meses no cenário vêm marcados." });

  const buffer = await workbook.xlsx.writeBuffer();
  const slug = cenario.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plano-de-vendas-${slug}.xlsx"`,
    },
  });
}
