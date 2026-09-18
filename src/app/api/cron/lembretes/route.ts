import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { gerarOcorrenciasRotinas } from "@/lib/rotinas";

function hojeISO(offsetDias = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Lembrete = { usuarioId: string; title: string; body: string; url: string };

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Rotina de gestão: cria as ocorrências da janela mesmo que ninguém abra Tarefas. Isolado num
  // try/catch pra uma falha aqui nunca derrubar os lembretes, que vêm logo abaixo.
  try {
    await gerarOcorrenciasRotinas(createAdminClient());
  } catch (e) {
    console.error("Rotinas: falha ao gerar ocorrências", e);
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    return NextResponse.json({ error: "vapid não configurado" }, { status: 500 });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const supabase = createAdminClient();
  const hoje = hojeISO(0);
  const amanha = hojeISO(1);

  const lembretes: Lembrete[] = [];

  const { data: despesas } = await supabase
    .from("despesas")
    .select("id, descricao, valor_total, data_gasto, criado_por")
    .eq("comprovado", false)
    .in("data_gasto", [hoje, amanha])
    .not("criado_por", "is", null);

  for (const d of despesas ?? []) {
    const venceHoje = d.data_gasto === hoje;
    lembretes.push({
      usuarioId: d.criado_por as string,
      title: venceHoje ? "Conta vence hoje" : "Conta vence amanhã",
      body: `${d.descricao ?? "Despesa"} — ${formatBRL(Number(d.valor_total))}`,
      url: "/custos/recorrentes",
    });
  }

  // Fatura do cartão: o vencimento real (calculado pelo ciclo do cartão) pode cair bem depois da
  // data do gasto — é esse vencimento que precisa lembrar, não a data da compra. Cobre também
  // ativos comprados parcelados no cartão.
  const { data: perfis } = await supabase.from("profiles").select("id, nome");
  const idPorNome = new Map((perfis ?? []).map((p) => [p.nome, p.id]));

  const { data: parcelas } = await supabase
    .from("despesa_parcelas")
    .select("id, valor, data_prevista, pagador, despesa_id, despesas(descricao, criado_por)")
    .eq("status", "prevista")
    .in("data_prevista", [hoje, amanha]);

  for (const p of (parcelas ?? []) as {
    id: string;
    valor: number;
    data_prevista: string;
    pagador: string | null;
    despesas: { descricao: string | null; criado_por: string | null } | { descricao: string | null; criado_por: string | null }[] | null;
  }[]) {
    const despesaLigada = Array.isArray(p.despesas) ? p.despesas[0] : p.despesas;
    const usuarioId = (p.pagador ? idPorNome.get(p.pagador) : null) ?? despesaLigada?.criado_por ?? null;
    if (!usuarioId) continue;
    const venceHoje = p.data_prevista === hoje;
    lembretes.push({
      usuarioId,
      title: venceHoje ? "Fatura vence hoje" : "Fatura vence amanhã",
      body: `${despesaLigada?.descricao ?? "Compra no cartão"} — ${formatBRL(Number(p.valor))}`,
      url: "/custos/extrato",
    });
  }

  const { data: parcelasAtivo } = await supabase
    .from("ativo_parcelas")
    .select("id, valor, data_prevista, pagador, ativo_id, ativos(descricao, criado_por)")
    .eq("status", "prevista")
    .in("data_prevista", [hoje, amanha]);

  for (const p of (parcelasAtivo ?? []) as {
    id: string;
    valor: number;
    data_prevista: string;
    pagador: string | null;
    ativos: { descricao: string | null; criado_por: string | null } | { descricao: string | null; criado_por: string | null }[] | null;
  }[]) {
    const ativoLigado = Array.isArray(p.ativos) ? p.ativos[0] : p.ativos;
    const usuarioId = (p.pagador ? idPorNome.get(p.pagador) : null) ?? ativoLigado?.criado_por ?? null;
    if (!usuarioId) continue;
    const venceHoje = p.data_prevista === hoje;
    lembretes.push({
      usuarioId,
      title: venceHoje ? "Fatura vence hoje" : "Fatura vence amanhã",
      body: `${ativoLigado?.descricao ?? "Ativo no cartão"} — ${formatBRL(Number(p.valor))}`,
      url: "/ativos",
    });
  }

  const { data: tarefas } = await supabase
    .from("tarefas")
    .select("id, titulo, prazo, responsavel_id")
    .neq("status", "feito")
    .in("prazo", [hoje, amanha])
    .not("responsavel_id", "is", null);

  for (const t of tarefas ?? []) {
    const venceHoje = t.prazo === hoje;
    lembretes.push({
      usuarioId: t.responsavel_id as string,
      title: venceHoje ? "Tarefa vence hoje" : "Tarefa vence amanhã",
      body: t.titulo,
      url: "/tarefas",
    });
  }

  if (lembretes.length === 0) {
    return NextResponse.json({ status: "ok", enviados: 0 });
  }

  const usuarioIds = [...new Set(lembretes.map((l) => l.usuarioId))];
  const { data: subs } = await supabase.from("push_subscriptions").select("*").in("usuario_id", usuarioIds);

  let enviados = 0;
  let falhas = 0;

  for (const lembrete of lembretes) {
    const subsDoUsuario = (subs ?? []).filter((s) => s.usuario_id === lembrete.usuarioId);
    for (const sub of subsDoUsuario) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: lembrete.title, body: lembrete.body, url: lembrete.url }),
        );
        enviados++;
      } catch (err: unknown) {
        falhas++;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }
  }

  return NextResponse.json({ status: "ok", enviados, falhas, lembretes: lembretes.length });
}
