import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarAgendaCombinada, dataLocal, horaLocal, rotuloTarefa, urlBaseApp } from "@/lib/agenda-combinada";

/**
 * Lembrete de organização (quarta e sexta, 14h) — lido pelo Atalho do Mac e enviado por WhatsApp às
 * sócias, no mesmo padrão do "Resumo De Agenda". Não é "o que vence hoje" (isso é o resumo da manhã):
 * é uma visão de PLANEJAMENTO da semana pra organizar agenda, tarefas e compromissos.
 *   ?token=…&formato=texto   → mensagem pronta pro WhatsApp
 *   (sem formato)            → JSON com os números
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FUSO = "America/Sao_Paulo";
const DIAS_FRENTE = 7;

function diaLabel(iso: string) {
  const s = new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit" });
  return s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");
}
function dmCurto(d: string) {
  return d.split("-").reverse().slice(0, 2).join("/");
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.ICS_FEED_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const hoje = dataLocal(new Date().toISOString());
  const fim = dataLocal(new Date(Date.now() + DIAS_FRENTE * 86400000).toISOString());

  const [eventos, { data: tarefasRaw }, { data: perfis }, { count: sugCount }] = await Promise.all([
    carregarAgendaCombinada(DIAS_FRENTE),
    supabase.from("tarefas").select("id, titulo, prazo, status, responsavel_id, participantes, parent_id, projeto_id").neq("status", "feito").is("parent_id", null),
    supabase.from("profiles").select("id, nome"),
    supabase.from("sugestoes_tarefa").select("id", { count: "exact", head: true }).eq("status", "pendente"),
  ]);

  const primeiroNome = new Map(
    (perfis ?? []).map((p) => {
      const n = String(p.nome ?? "").split(" ")[0];
      return [p.id as string, n.charAt(0).toUpperCase() + n.slice(1)];
    }),
  );
  const tarefas = (tarefasRaw ?? []) as { id: string; titulo: string; prazo: string | null; responsavel_id: string | null; participantes: string[] | null; parent_id: string | null; projeto_id: string | null }[];
  const quemFaz = (t: { responsavel_id: string | null; participantes: string[] | null }) => {
    const ids = [t.responsavel_id, ...((t.participantes ?? []) as string[])].filter((id, i, arr): id is string => !!id && arr.indexOf(id) === i);
    return ids.map((id) => primeiroNome.get(id)).filter(Boolean).join(" + ");
  };

  const atrasadas = tarefas.filter((t) => t.prazo && t.prazo < hoje);
  const semana = tarefas.filter((t) => t.prazo && t.prazo >= hoje && t.prazo <= fim);
  const semPrazo = tarefas.filter((t) => !t.prazo);
  const soltas = tarefas.filter((t) => !t.projeto_id);

  // ── JSON (debug / outros consumidores) ───────────────────────────────────────────────────────────
  if (request.nextUrl.searchParams.get("formato") !== "texto") {
    return NextResponse.json(
      { compromissos: eventos.length, atrasadas: atrasadas.length, semana: semana.length, semPrazo: semPrazo.length, soltas: soltas.length, sugestoes: sugCount ?? 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ── Texto pro WhatsApp ────────────────────────────────────────────────────────────────────────────
  const blocos: string[] = ["📋 *Organizar a semana* — agenda, tarefas e compromissos"];

  // Compromissos dos próximos dias, agrupados por dia.
  if (eventos.length === 0) {
    blocos.push("🗓️ Sem compromissos nos próximos 7 dias.");
  } else {
    const porDia = new Map<string, string[]>();
    for (const e of eventos) {
      const d = dataLocal(e.inicioIso);
      const linha = `   ${e.diaTodo ? "Dia todo" : horaLocal(e.inicioIso)} — ${e.titulo} (${e.origem})`;
      porDia.set(d, [...(porDia.get(d) ?? []), linha]);
    }
    const dias = [...porDia.keys()].sort().map((d) => `${diaLabel(d + "T12:00:00")}\n${porDia.get(d)!.join("\n")}`);
    blocos.push(`🗓️ *Próximos compromissos:*\n${dias.join("\n")}`);
  }

  // Tarefas para organizar.
  const tfLin: string[] = [];
  if (atrasadas.length > 0) {
    const topo = atrasadas.slice(0, 8).map((t) => {
      const dias = Math.round((new Date(`${hoje}T00:00:00Z`).getTime() - new Date(`${t.prazo}T00:00:00Z`).getTime()) / 86400000);
      const q = quemFaz(t);
      return `   • ${rotuloTarefa(t.titulo)}${q ? ` — ${q}` : ""} (há ${dias} ${dias === 1 ? "dia" : "dias"})`;
    });
    tfLin.push(`⚠️ Atrasadas (${atrasadas.length}):\n${topo.join("\n")}${atrasadas.length > 8 ? `\n   …e mais ${atrasadas.length - 8}` : ""}`);
  }
  if (semana.length > 0) tfLin.push(`🗓️ Vencem até ${dmCurto(fim)}: ${semana.length}`);
  if (semPrazo.length > 0) tfLin.push(`❓ Sem prazo: ${semPrazo.length} (definir prazo e responsável)`);
  const extras: string[] = [];
  if (soltas.length > 0) extras.push(`${soltas.length} sem projeto`);
  if ((sugCount ?? 0) > 0) extras.push(`${sugCount} sugest${sugCount === 1 ? "ão" : "ões"} da IA a revisar`);
  if (extras.length > 0) tfLin.push(`🧩 ${extras.join(" · ")} — use o "Organizar com IA"`);

  blocos.push(tfLin.length > 0 ? `✅ *Tarefas para organizar:*\n${tfLin.join("\n")}` : "✅ Tarefas em dia — nada atrasado nem pendente de organizar.");

  blocos.push(`👉 Abrir: ${urlBaseApp()}/tarefas`);

  return new NextResponse(blocos.join("\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
