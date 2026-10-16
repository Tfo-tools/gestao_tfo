import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkCurtoTarefa } from "@/lib/agenda-combinada";

/**
 * Exporta TODAS as tarefas pra Excel, pra revisão geral fora do app: uma aba por projeto (com as
 * subtarefas logo abaixo da mãe), uma aba por etiqueta e uma lista plana. Entra com a sessão
 * (link "Exportar Excel" em Tarefas) ou com o token do feed (?token=). Mora em /api/feed porque o
 * proxy só deixa passar sem login o que está ali — a rota confere o acesso por conta própria.
 */
export const dynamic = "force-dynamic";

const CABECALHO = "FFF1E6E9";
const PROJETO = "FFE8E0E3";
const STATUS: Record<string, string> = { a_fazer: "A fazer", fazendo: "Fazendo", feito: "Feito" };

type Linha = {
  projeto: string;
  fase: string;
  tarefa: string;
  mae: string;
  status: string;
  responsavel: string;
  participantes: string;
  prazo: string;
  inicio: string;
  etiquetas: string;
  area: string;
  dependeDe: string;
  descricao: string;
  observacoes: number;
  link: string;
  _ordem: string;
};

const COLUNAS = [
  { header: "Projeto", key: "projeto", width: 26 },
  { header: "Fase", key: "fase", width: 16 },
  { header: "Tarefa", key: "tarefa", width: 52 },
  { header: "Subtarefa de", key: "mae", width: 36 },
  { header: "Status", key: "status", width: 10 },
  { header: "Responsável", key: "responsavel", width: 14 },
  { header: "Participa", key: "participantes", width: 16 },
  { header: "Prazo", key: "prazo", width: 12 },
  { header: "Início", key: "inicio", width: 12 },
  { header: "Etiquetas", key: "etiquetas", width: 22 },
  { header: "Tema / área", key: "area", width: 16 },
  { header: "Depende de", key: "dependeDe", width: 36 },
  { header: "Descrição", key: "descricao", width: 50 },
  { header: "Observações (qtd)", key: "observacoes", width: 10 },
  { header: "Link", key: "link", width: 44 },
];

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const porToken = !!token && token === process.env.ICS_FEED_TOKEN;
  const sessao = await createClient();
  const {
    data: { user },
  } = await sessao.auth.getUser();
  if (!porToken && !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = porToken ? createAdminClient() : sessao;

  const [{ data: tarefas }, { data: projetos }, { data: fases }, { data: perfis }, { data: deps }, { data: notas }] = await Promise.all([
    supabase.from("tarefas").select("id, titulo, descricao, status, prazo, data_inicio, etiquetas, area, parent_id, ordem, projeto_id, fase_id, responsavel_id, participantes"),
    supabase.from("projetos").select("id, nome, status, objetivo").order("status").order("created_at"),
    supabase.from("projeto_fases").select("id, nome, ordem"),
    supabase.from("profiles").select("id, nome"),
    supabase.from("tarefa_dependencias").select("tarefa_id, depende_de_id"),
    supabase.from("tarefa_notas").select("tarefa_id"),
  ]);

  type T = { id: string; titulo: string; descricao: string | null; status: string; prazo: string | null; data_inicio: string | null; etiquetas: string[] | null; area: string | null; parent_id: string | null; ordem: number | null; projeto_id: string | null; fase_id: string | null; responsavel_id: string | null; participantes: string[] | null };
  const todas = (tarefas ?? []) as T[];
  const nomeProjeto = new Map((projetos ?? []).map((p) => [p.id as string, p.nome as string]));
  const nomeFase = new Map((fases ?? []).map((f) => [f.id as string, f.nome as string]));
  const nomePessoa = new Map((perfis ?? []).map((p) => [p.id as string, String(p.nome ?? "").split(" ")[0]]));
  const tituloPorId = new Map(todas.map((t) => [t.id, t.titulo]));
  const dependePorTarefa = new Map<string, string[]>();
  for (const d of (deps ?? []) as { tarefa_id: string; depende_de_id: string }[]) dependePorTarefa.set(d.tarefa_id, [...(dependePorTarefa.get(d.tarefa_id) ?? []), tituloPorId.get(d.depende_de_id) ?? "?"]);
  const notasPorTarefa = new Map<string, number>();
  for (const n of (notas ?? []) as { tarefa_id: string }[]) notasPorTarefa.set(n.tarefa_id, (notasPorTarefa.get(n.tarefa_id) ?? 0) + 1);

  const fmtData = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
  const linhaDe = (t: T): Linha => ({
    projeto: t.projeto_id ? (nomeProjeto.get(t.projeto_id) ?? "?") : "(sem projeto)",
    fase: t.fase_id ? (nomeFase.get(t.fase_id) ?? "") : "",
    tarefa: t.titulo,
    mae: t.parent_id ? (tituloPorId.get(t.parent_id) ?? "") : "",
    status: STATUS[t.status] ?? t.status,
    responsavel: t.responsavel_id ? (nomePessoa.get(t.responsavel_id) ?? "") : "",
    participantes: (t.participantes ?? []).map((p) => nomePessoa.get(p) ?? "").filter(Boolean).join(" + "),
    prazo: fmtData(t.prazo),
    inicio: fmtData(t.data_inicio),
    etiquetas: (t.etiquetas ?? []).join(", "),
    area: t.area ?? "",
    dependeDe: (dependePorTarefa.get(t.id) ?? []).join(" | "),
    descricao: t.descricao ?? "",
    observacoes: notasPorTarefa.get(t.id) ?? 0,
    link: linkCurtoTarefa(t.id),
    _ordem: `${t.prazo ?? "9999-12-31"}|${String(t.ordem ?? 0).padStart(6, "0")}|${t.titulo}`,
  });

  // Ordem dentro do projeto: tarefa principal por prazo, cada uma seguida das suas subtarefas.
  const raizes = todas.filter((t) => !t.parent_id).map(linhaDe);
  const filhasDe = (id: string) => todas.filter((t) => t.parent_id === id).map(linhaDe).sort((a, b) => a._ordem.localeCompare(b._ordem));
  const porProjeto = new Map<string, Linha[]>();
  for (const t of todas.filter((t) => !t.parent_id).sort((a, b) => linhaDe(a)._ordem.localeCompare(linhaDe(b)._ordem))) {
    const l = linhaDe(t);
    const lista = porProjeto.get(l.projeto) ?? [];
    lista.push(l, ...filhasDe(t.id));
    porProjeto.set(l.projeto, lista);
  }
  const nomesProjetos = [...(projetos ?? []).map((p) => p.nome as string).filter((n) => porProjeto.has(n)), ...(porProjeto.has("(sem projeto)") ? ["(sem projeto)"] : [])];

  const wb = new ExcelJS.Workbook();
  wb.creator = "TFO-Gestão";
  const estiloCabecalho = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CABECALHO } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS.length } };
  };
  const addLinha = (ws: ExcelJS.Worksheet, l: Linha) => {
    const row = ws.addRow({ ...l, tarefa: l.mae ? `   ↳ ${l.tarefa}` : l.tarefa });
    row.getCell("link").value = { text: l.link, hyperlink: l.link };
    row.getCell("link").font = { color: { argb: "FF1F4E79" }, underline: true };
    if (l.status === "Feito") row.font = { color: { argb: "FF8A8A8A" }, strike: true };
    if (l.mae) row.getCell("tarefa").font = { ...(row.getCell("tarefa").font ?? {}), color: { argb: "FF555555" } };
    row.alignment = { vertical: "top", wrapText: true };
  };

  // Aba 1: por projeto, com linha de título do projeto antes das tarefas dele.
  const wsProjeto = wb.addWorksheet("Por projeto");
  wsProjeto.columns = COLUNAS;
  estiloCabecalho(wsProjeto);
  for (const nome of nomesProjetos) {
    const cab = wsProjeto.addRow({ projeto: nome.toUpperCase() });
    cab.font = { bold: true };
    cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PROJETO } };
    for (const l of porProjeto.get(nome) ?? []) addLinha(wsProjeto, l);
    wsProjeto.addRow({});
  }

  // Aba 2: por etiqueta — tarefa com duas etiquetas aparece em dois grupos; sem etiqueta vai ao fim.
  const wsEtiqueta = wb.addWorksheet("Por etiqueta");
  wsEtiqueta.columns = COLUNAS;
  estiloCabecalho(wsEtiqueta);
  const porEtiqueta = new Map<string, Linha[]>();
  for (const l of [...raizes, ...todas.filter((t) => t.parent_id).map(linhaDe)]) {
    const tags = l.etiquetas ? l.etiquetas.split(", ") : ["(sem etiqueta)"];
    for (const tag of tags) porEtiqueta.set(tag, [...(porEtiqueta.get(tag) ?? []), l]);
  }
  const etiquetas = [...porEtiqueta.keys()].sort((a, b) => (a === "(sem etiqueta)" ? 1 : b === "(sem etiqueta)" ? -1 : a.localeCompare(b)));
  for (const tag of etiquetas) {
    const cab = wsEtiqueta.addRow({ projeto: `#${tag.toUpperCase()}` });
    cab.font = { bold: true };
    cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PROJETO } };
    for (const l of (porEtiqueta.get(tag) ?? []).sort((a, b) => a.projeto.localeCompare(b.projeto) || a._ordem.localeCompare(b._ordem))) addLinha(wsEtiqueta, l);
    wsEtiqueta.addRow({});
  }

  // Aba 3: lista plana, pra filtrar e ordenar à vontade.
  const wsTodas = wb.addWorksheet("Todas (lista)");
  wsTodas.columns = COLUNAS;
  estiloCabecalho(wsTodas);
  for (const nome of nomesProjetos) for (const l of porProjeto.get(nome) ?? []) addLinha(wsTodas, l);

  const buffer = await wb.xlsx.writeBuffer();
  const data = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tarefas-${data}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
