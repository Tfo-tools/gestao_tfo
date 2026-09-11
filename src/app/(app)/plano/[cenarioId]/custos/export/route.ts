import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { agregarPorCenario } from "@/lib/relatorios-cenario";

const CABECALHO = "FFF1E6E9";
const FECHAMENTO = "FFEDEDED";

type Col = { header: string; key: string; width?: number; fmt?: string };

/** Mesmo padrão da exportação de vendas: uma aba por visão, fechamento de ano, aba de premissas. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ cenarioId: string }> }) {
  const { cenarioId } = await params;
  const supabase = await createClient();

  const [{ data: cenario }, resumo, { data: simRows }, { data: custosEmpresa }, { data: cogs }, { data: produtos }] = await Promise.all([
    supabase.from("cenarios").select("id, nome, data_inicio, data_fim").eq("id", cenarioId).single(),
    agregarPorCenario(supabase, cenarioId),
    supabase
      .from("simulacao_mensal")
      .select("produto_id, mes_referencia, receita_bruta, cogs_infraestrutura, cogs_llm, cogs_suporte_reativo, cogs_cs_proativo, cogs_gateway, cogs_software, cogs_outros, sm_vendas, sm_marketing")
      .eq("cenario_id", cenarioId),
    supabase.from("custos_empresa").select("item, tipo_custo, valor_mensal, data_inicio, data_fim, parametros, observacoes, plano_contas:plano_contas_id(codigo, conta)").eq("cenario_id", cenarioId),
    supabase.from("cogs_premissas").select("produto_id, parametros").eq("cenario_id", cenarioId),
    supabase.from("produtos").select("id, nome").order("nome"),
  ]);
  if (!cenario) return new NextResponse("Cenário não encontrado", { status: 404 });
  const nomeProduto = new Map((produtos ?? []).map((p) => [p.id, p.nome]));

  // Soma dos produtos por mês
  const sim = new Map<string, Record<string, number>>();
  for (const r of simRows ?? []) {
    const m = sim.get(r.mes_referencia) ?? {};
    for (const [k, v] of Object.entries(r)) if (typeof v === "number" || (typeof v === "string" && k !== "produto_id" && k !== "mes_referencia")) m[k] = (m[k] ?? 0) + Number(v);
    sim.set(r.mes_referencia, m);
  }

  const linhas = resumo.linhas
    .filter((l) => (!cenario.data_inicio || l.mes_referencia >= cenario.data_inicio) && (!cenario.data_fim || l.mes_referencia <= cenario.data_fim))
    .map((l) => {
    const m = sim.get(l.mes_referencia) ?? {};
    const llm = m.cogs_llm ?? 0, software = m.cogs_software ?? 0, gateway = m.cogs_gateway ?? 0;
    const variaveis = {
      infra: m.cogs_infraestrutura ?? 0,
      llm,
      suporteCs: (m.cogs_suporte_reativo ?? 0) + (m.cogs_cs_proativo ?? 0),
      gateway,
      implementacao: Math.max(0, (m.cogs_outros ?? 0) - llm - software - gateway),
      parceiros: m.sm_vendas ?? 0,
      midia: m.sm_marketing ?? 0,
      equipeVariavel: l.alocacaoVariavel,
    };
    const fixos = { equipeFixa: l.alocacaoFixa, empresaGa: l.empresaGa, empresaPd: l.empresaPd, empresaSm: l.empresaSm, impostos: l.impostoMensal };
    return { mes: l.mes_referencia, clientes: l.clientes, receita: l.receita, ...variaveis, ...fixos, ebitda: l.ebitda };
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TFO-Gestão";
  workbook.created = new Date();

  const VAR: Col[] = [
    { header: "Infra (1.1.1)", key: "infra" }, { header: "LLM (1.1.2)", key: "llm" }, { header: "Suporte + CS (1.1.3)", key: "suporteCs" },
    { header: "Gateway (1.1.5)", key: "gateway" }, { header: "Implantação (1.1.6)", key: "implementacao" }, { header: "Parceiros (S&M)", key: "parceiros" },
    { header: "Mídia (S&M)", key: "midia" }, { header: "Equipe por demanda", key: "equipeVariavel" },
  ];
  const FIX: Col[] = [
    { header: "Equipe CLT / pacote", key: "equipeFixa" }, { header: "G&A", key: "empresaGa" }, { header: "P&D", key: "empresaPd" },
    { header: "S&M fixo", key: "empresaSm" }, { header: "Impostos", key: "impostos" },
  ];

  function aba(titulo: string, cols: Col[], totalLabel: string) {
    const sheet = workbook.addWorksheet(titulo);
    sheet.columns = [
      { header: "Mês", key: "mes", width: 12 },
      { header: "Clientes", key: "clientes", width: 10 },
      { header: "Receita (R$)", key: "receita", width: 15 },
      ...cols.map((c) => ({ header: `${c.header} (R$)`, key: c.key, width: 18 })),
      { header: `${totalLabel} (R$)`, key: "total", width: 16 },
      { header: "% da receita", key: "pct", width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CABECALHO } }; });
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    let acc: typeof linhas = [];
    const fechar = () => {
      if (!acc.length) return;
      const soma: Record<string, number> = {};
      for (const c of cols) soma[c.key] = acc.reduce((s, l) => s + (l as unknown as Record<string, number>)[c.key], 0);
      const receita = acc.reduce((s, l) => s + l.receita, 0);
      const total = cols.reduce((s, c) => s + soma[c.key], 0);
      const ano = acc[0].mes.slice(0, 4);
      const row = sheet.addRow({
        mes: acc.length === 12 ? ano : `${ano} (${acc.length} meses)`,
        clientes: acc[acc.length - 1].clientes,
        receita, ...soma, total, pct: receita > 0 ? total / receita : null,
      });
      row.font = { bold: true };
      row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FECHAMENTO } }; cell.border = { top: { style: "thin" } }; });
      acc = [];
    };
    for (const l of linhas) {
      if (acc.length && l.mes.slice(0, 4) !== acc[0].mes.slice(0, 4)) fechar();
      const total = cols.reduce((s, c) => s + (l as unknown as Record<string, number>)[c.key], 0);
      sheet.addRow({ mes: new Date(l.mes + "T00:00:00"), clientes: l.clientes, receita: l.receita, ...Object.fromEntries(cols.map((c) => [c.key, (l as unknown as Record<string, number>)[c.key]])), total, pct: l.receita > 0 ? total / l.receita : null });
      acc.push(l);
    }
    fechar();
    sheet.getColumn("mes").numFmt = "mmm/yyyy";
    sheet.getColumn("clientes").numFmt = "#,##0";
    sheet.getColumn("receita").numFmt = "#,##0.00";
    for (const c of cols) sheet.getColumn(c.key).numFmt = "#,##0.00";
    sheet.getColumn("total").numFmt = "#,##0.00";
    sheet.getColumn("pct").numFmt = "0.0%";
  }
  aba("Variáveis", VAR, "Total variável");
  aba("Fixos", FIX, "Total fixo");

  // Aba DRE resumida: receita, variável, fixo, EBITDA por mês
  const dre = workbook.addWorksheet("Resumo");
  dre.columns = [
    { header: "Mês", key: "mes", width: 12 }, { header: "Receita (R$)", key: "receita", width: 15 },
    { header: "Custos variáveis (R$)", key: "variavel", width: 20 }, { header: "Custos fixos (R$)", key: "fixo", width: 17 },
    { header: "EBITDA (R$)", key: "ebitda", width: 15 }, { header: "Margem EBITDA", key: "margem", width: 14 },
  ];
  dre.getRow(1).font = { bold: true };
  dre.getRow(1).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CABECALHO } }; });
  for (const l of linhas) {
    const variavel = VAR.reduce((s, c) => s + (l as unknown as Record<string, number>)[c.key], 0);
    const fixo = FIX.reduce((s, c) => s + (l as unknown as Record<string, number>)[c.key], 0);
    dre.addRow({ mes: new Date(l.mes + "T00:00:00"), receita: l.receita, variavel, fixo, ebitda: l.ebitda, margem: l.receita > 0 ? l.ebitda / l.receita : null });
  }
  dre.getColumn("mes").numFmt = "mmm/yyyy";
  for (const k of ["receita", "variavel", "fixo", "ebitda"]) dre.getColumn(k).numFmt = "#,##0.00";
  dre.getColumn("margem").numFmt = "0.0%";

  // Aba de custos da empresa lançados (com regra de progressão)
  const emp = workbook.addWorksheet("Custos da empresa");
  emp.columns = [
    { header: "Conta", key: "conta", width: 12 }, { header: "Item", key: "item", width: 46 }, { header: "Tipo", key: "tipo", width: 16 },
    { header: "Valor base (R$)", key: "valor", width: 15 }, { header: "Início", key: "inicio", width: 12 }, { header: "Fim", key: "fim", width: 12 },
    { header: "Regra de progressão", key: "regra", width: 60 }, { header: "Observações", key: "obs", width: 60 },
  ];
  emp.getRow(1).font = { bold: true };
  emp.getRow(1).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CABECALHO } }; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of ((custosEmpresa ?? []) as any[]).sort((a, b) => String(a.plano_contas?.codigo ?? "").localeCompare(String(b.plano_contas?.codigo ?? "")))) {
    const p = c.parametros ?? {};
    let regra = "";
    if (c.tipo_custo === "escalonado" && p.faixas) regra = "por clientes: " + p.faixas.map((f: { minimo: number; maximo: number | null; valor: number }) => `${f.minimo}–${f.maximo ?? "∞"} cli → R$ ${f.valor}`).join(" · ");
    else if (c.tipo_custo === "escalonado" && p.faixasPorFase) regra = "por fase do Mind: " + p.faixasPorFase.map((f: { fase: string; valor: number }) => `${f.fase} → R$ ${f.valor}`).join(" · ");
    else if (c.tipo_custo === "cronograma" && p.valores_mensais) regra = `cronograma de ${p.mes_inicio}: ` + p.valores_mensais.map((v: number) => `R$ ${v}`).join(", ");
    else if (c.tipo_custo === "variavel_receita") regra = `${((p.percentual ?? 0) * 100).toFixed(2)}% da receita`;
    else if (c.tipo_custo === "variavel_cliente") regra = `R$ ${p.valor_por_cliente ?? 0} por cliente/mês`;
    emp.addRow({ conta: c.plano_contas?.codigo ?? "", item: c.item, tipo: c.tipo_custo, valor: Number(c.valor_mensal ?? 0), inicio: c.data_inicio ?? "", fim: c.data_fim ?? "", regra, obs: c.observacoes ?? "" });
  }
  emp.getColumn("valor").numFmt = "#,##0.00";

  // Aba de regras de COGS por produto
  const rc = workbook.addWorksheet("Regras de COGS");
  rc.columns = [{ header: "Produto", key: "produto", width: 18 }, { header: "Conta", key: "conta", width: 40 }, { header: "Regra", key: "regra", width: 110 }];
  rc.getRow(1).font = { bold: true };
  rc.getRow(1).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CABECALHO } }; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (cogs ?? []) as any[]) {
    const p = c.parametros ?? {};
    const nome = nomeProduto.get(c.produto_id) ?? c.produto_id;
    rc.addRow({ produto: nome, conta: "1.1.1 Infraestrutura", regra: `a partir de ${p.infra?.inicio ?? "início"} · base R$ ${p.infra?.base_mensal ?? 0} + R$ ${p.infra?.por_cliente_mes ?? 0}/cliente · degraus: ${(p.infra?.degraus ?? []).map((d: { a_partir_de_clientes: number; base_mensal: number }) => `${d.a_partir_de_clientes} cli → R$ ${d.base_mensal}`).join(", ") || "—"}` });
    rc.addRow({ produto: nome, conta: "1.1.2 LLM", regra: p.llm?.ativo ? `só ${p.llm.nivel_nome ?? "todos"} · ${p.llm.tokens_entrada_mes} in + ${p.llm.tokens_saida_mes} out tokens/mês · US$ ${p.llm.preco_milhao_entrada_usd}/${p.llm.preco_milhao_saida_usd} por M · câmbio ${p.llm.cambio}` : "desligado" });
    rc.addRow({ produto: nome, conta: "1.1.3 Suporte reativo", regra: `pago a partir de ${p.suporte?.inicio ?? "início"} · ${((p.suporte?.taxa_chamados_pct ?? 0) * 100).toFixed(0)}% da base abre chamado × ${p.suporte?.tma_horas ?? 0} h × ${p.suporte?.margem ?? 1} · perfil ${p.suporte?.cargo ?? "—"} ${p.suporte?.tipo_contratacao ?? ""} ${p.suporte?.senioridade ?? ""}` });
    rc.addRow({ produto: nome, conta: "1.1.3 CS proativo", regra: p.cs_proativo?.ativo ? `pago a partir de ${p.cs_proativo.inicio ?? "início"} · (${p.cs_proativo.monitoramento_h} + ${p.cs_proativo.cadencia_h} + ${p.cs_proativo.qbr_h_mes}) h × ${p.cs_proativo.overhead} · perfil ${p.cs_proativo.cargo ?? "—"}` : "desligado" });
    rc.addRow({ produto: nome, conta: "1.1.4 Software de atendimento", regra: `R$ ${p.software_atendimento?.custo_mensal ?? 0}/mês${p.software_atendimento?.observacao ? " · " + p.software_atendimento.observacao : ""}` });
    rc.addRow({ produto: nome, conta: "1.1.5 Gateway", regra: `mix cartão ${((p.gateway?.mix_cartao ?? 0) * 100).toFixed(0)}% / boleto ${((p.gateway?.mix_boleto ?? 0) * 100).toFixed(0)}% / pix ${((p.gateway?.mix_pix ?? 0) * 100).toFixed(0)}% · cartão ${((p.gateway?.cartao_pct ?? 0) * 100).toFixed(2)}% + R$ ${p.gateway?.cartao_fixo ?? 0} · boleto R$ ${p.gateway?.boleto_fixo ?? 0} · pix R$ ${p.gateway?.pix_fixo ?? 0}` });
  }

  const capa = workbook.addWorksheet("Premissas");
  capa.columns = [{ header: "Item", key: "item", width: 28 }, { header: "Valor", key: "valor", width: 80 }];
  capa.getRow(1).font = { bold: true };
  capa.addRow({ item: "Cenário", valor: cenario.nome });
  capa.addRow({ item: "Período", valor: `${cenario.data_inicio ?? "—"} a ${cenario.data_fim ?? "—"}` });
  capa.addRow({ item: "Gerado em", valor: new Date().toLocaleString("pt-BR") });
  capa.addRow({ item: "Variáveis", valor: "Escalam com clientes, receita ou vendas: regras de COGS, canais de parceiro, mídia do self-service, alocações por demanda (PJ/agência/bot)." });
  capa.addRow({ item: "Fixos", valor: "Estrutura: alocações CLT/pacote, custos da empresa (G&A, P&D, S&M fixo) e impostos." });
  capa.addRow({ item: "Suporte", valor: "Custo vem das regras de COGS (1.1.3). A alocação em Necessidade de Contratação só dimensiona." });
  capa.addRow({ item: "Fomento (Centelha)", valor: "Os custos do projeto estão em P&D/G&A como despesa normal; a subvenção entra como linha própria abaixo do EBITDA no relatório." });
  capa.addRow({ item: "Anos incompletos", valor: "Linhas de fechamento marcam quantos meses do ano estão dentro do cenário." });

  const buffer = await workbook.xlsx.writeBuffer();
  const slug = cenario.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plano-de-custos-${slug}.xlsx"`,
    },
  });
}
