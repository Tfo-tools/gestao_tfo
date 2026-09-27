"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { criarWebhookFathom, excluirWebhookFathom } from "@/lib/fathom";

export type EstadoFathom = { error: string | null; ok?: boolean };

const CHAVE = "fathom_webhook";

function urlDoWebhook() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://gestaotfo.vercel.app").replace(/\/$/, "");
  return `${base}/api/webhooks/fathom`;
}

/** Cria o webhook no Fathom pela API (com a FATHOM_API_KEY da Vercel) e guarda id + segredo no banco.
 * Se já havia um, apaga o antigo no Fathom antes — um só, sempre apontando pra este app. */
export async function conectarFathom(): Promise<EstadoFathom> {
  const supabase = await createClient();
  const { data: atual } = await supabase.from("integracoes").select("valor").eq("chave", CHAVE).maybeSingle();
  const antigo = (atual?.valor as { id?: string } | null)?.id;
  if (antigo) await excluirWebhookFathom(antigo);

  const { webhook, error } = await criarWebhookFathom(urlDoWebhook());
  if (error || !webhook) return { error: error ?? "Não deu certo." };

  const { error: erroBanco } = await supabase.from("integracoes").upsert(
    { chave: CHAVE, valor: { id: webhook.id, secret: webhook.secret, url: webhook.url, created_at: webhook.created_at }, atualizado_em: new Date().toISOString() },
    { onConflict: "chave" },
  );
  if (erroBanco) return { error: "O webhook foi criado no Fathom, mas não consegui guardar o segredo. Tente de novo." };
  revalidatePath("/agenda");
  return { error: null, ok: true };
}

export async function desconectarFathom(): Promise<EstadoFathom> {
  const supabase = await createClient();
  const { data: atual } = await supabase.from("integracoes").select("valor").eq("chave", CHAVE).maybeSingle();
  const id = (atual?.valor as { id?: string } | null)?.id;
  if (id) {
    const { error } = await excluirWebhookFathom(id);
    if (error) return { error };
  }
  await supabase.from("integracoes").delete().eq("chave", CHAVE);
  revalidatePath("/agenda");
  return { error: null, ok: true };
}
