import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function hojeISO(offsetDias = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

type ItemLembrete = { titulo: string; nota: string; data: string; venceHoje: boolean; tipo: "despesa" | "tarefa" };

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.ICS_FEED_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const hoje = hojeISO(0);
  const amanha = hojeISO(1);

  const itens: ItemLembrete[] = [];

  const { data: despesas } = await supabase
    .from("despesas")
    .select("id, descricao, valor_total, data_gasto")
    .eq("comprovado", false)
    .in("data_gasto", [hoje, amanha]);

  for (const d of despesas ?? []) {
    if (!d.data_gasto) continue;
    itens.push({
      titulo: `💰 ${d.descricao ?? "Conta"} — ${formatBRL(Number(d.valor_total))}`,
      nota: "Conta pendente — TFO-Gestão",
      data: d.data_gasto,
      venceHoje: d.data_gasto === hoje,
      tipo: "despesa",
    });
  }

  const { data: tarefas } = await supabase
    .from("tarefas")
    .select("id, titulo, prazo")
    .neq("status", "feito")
    .in("prazo", [hoje, amanha]);

  for (const t of tarefas ?? []) {
    if (!t.prazo) continue;
    itens.push({
      titulo: `✅ ${t.titulo}`,
      nota: "Tarefa — TFO-Gestão",
      data: t.prazo,
      venceHoje: t.prazo === hoje,
      tipo: "tarefa",
    });
  }

  return NextResponse.json({ itens }, { headers: { "Cache-Control": "no-store" } });
}
