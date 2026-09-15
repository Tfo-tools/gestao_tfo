import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  carregarAgendaCombinada,
  dataLocal,
  eventosEmBreve,
  minutoLocalAgora,
  textoEvento,
  textoResumoHoje,
} from "@/lib/agenda-combinada";

/**
 * Lembrete de agenda por notificação push — chamado a cada 5 min pelo pg_cron do Supabase (o plano
 * Hobby da Vercel só permite cron diário). Não depende de Mac nem de celular ligado: o servidor
 * decide a hora e a notificação chega em todo aparelho inscrito.
 *   - resumo do dia: uma vez, a partir das HORA_RESUMO
 *   - aviso por compromisso: uma vez, quando faltarem até MINUTOS_ANTES min
 * A tabela agenda_lembretes_enviados guarda o que já saiu, pra não repetir a cada rodada.
 */
export const dynamic = "force-dynamic";

const HORA_RESUMO = 8 * 60;
const MINUTOS_ANTES = 15;

type Aviso = { chave: string; title: string; body: string };

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    return NextResponse.json({ error: "vapid não configurado" }, { status: 500 });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const supabase = createAdminClient();
  const eventos = await carregarAgendaCombinada();
  const hoje = dataLocal(new Date().toISOString());

  const candidatos: Aviso[] = [];

  if (minutoLocalAgora() >= HORA_RESUMO) {
    candidatos.push({ chave: `resumo:${hoje}`, title: "Agenda de hoje — TFO-Gestão", body: textoResumoHoje(eventos) });
  }
  for (const ev of eventosEmBreve(eventos, MINUTOS_ANTES)) {
    candidatos.push({ chave: `evento:${ev.id}:${dataLocal(ev.inicioIso)}`, title: "Compromisso chegando — TFO-Gestão", body: textoEvento(ev) });
  }

  if (candidatos.length === 0) return NextResponse.json({ status: "ok", enviados: 0 });

  const { data: jaEnviados } = await supabase
    .from("agenda_lembretes_enviados")
    .select("chave")
    .in("chave", candidatos.map((c) => c.chave));
  const enviadosSet = new Set((jaEnviados ?? []).map((r) => r.chave));
  const avisos = candidatos.filter((c) => !enviadosSet.has(c.chave));

  if (avisos.length === 0) return NextResponse.json({ status: "ok", enviados: 0, jaEnviados: candidatos.length });

  // Marca ANTES de mandar: se duas rodadas do cron se cruzarem, só uma consegue inserir a chave.
  const { data: inseridos } = await supabase
    .from("agenda_lembretes_enviados")
    .upsert(avisos.map((a) => ({ chave: a.chave })), { onConflict: "chave", ignoreDuplicates: true })
    .select("chave");
  const chavesGanhas = new Set((inseridos ?? []).map((r) => r.chave));
  const paraEnviar = avisos.filter((a) => chavesGanhas.has(a.chave));

  // Agenda é das duas sócias — vai pra todo aparelho inscrito, não por dono do compromisso.
  const { data: subs } = await supabase.from("push_subscriptions").select("*");

  let enviados = 0;
  let falhas = 0;
  for (const aviso of paraEnviar) {
    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: aviso.title, body: aviso.body, url: "/agenda" }),
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

  // Limpa o histórico com mais de 7 dias — as chaves levam a data, não precisa guardar mais que isso.
  await supabase
    .from("agenda_lembretes_enviados")
    .delete()
    .lt("enviado_em", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  return NextResponse.json({ status: "ok", enviados, falhas, avisos: paraEnviar.map((a) => a.chave) });
}
