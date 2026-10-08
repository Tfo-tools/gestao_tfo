import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Notificação push para pessoas específicas (todos os aparelhos inscritos em Configurações).
 * Mesmo mecanismo dos lembretes do cron; aqui é avulso — ex.: menção @nome numa observação de tarefa.
 * Silencioso quando VAPID não está configurado ou a pessoa não tem aparelho inscrito.
 */
export async function enviarPush(usuarioIds: string[], aviso: { title: string; body: string; url: string }): Promise<number> {
  const ids = [...new Set(usuarioIds)].filter(Boolean);
  if (ids.length === 0) return 0;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublic || !vapidPrivate || !vapidSubject) return 0;
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const admin = createAdminClient();
  const { data: subs } = await admin.from("push_subscriptions").select("*").in("usuario_id", ids);
  let enviados = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(aviso));
      enviados++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", sub.id);
    }
  }
  return enviados;
}
