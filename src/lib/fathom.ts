import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Fathom (gravador de reuniões) → gestao_tfo.
 *
 * O Fathom chama o webhook quando termina de processar uma reunião. Configurando o webhook com
 * transcrição, resumo e ações incluídos, o payload já traz tudo — não precisa de chamada de volta.
 * Assinatura segue o padrão "Standard Webhooks": HMAC-SHA256 de `${id}.${timestamp}.${corpo}` com o
 * segredo (base64 depois do prefixo `whsec_`), comparado com cada `v1,<base64>` do header.
 * Referência: developers.fathom.ai (webhooks / new-meeting-content-ready).
 */

export type FathomPayload = {
  recording_id: number | string;
  title: string;
  meeting_title?: string | null;
  meeting_type?: string | null;
  url?: string;
  share_url?: string;
  created_at?: string;
  scheduled_start_time?: string;
  recording_start_time?: string;
  recording_end_time?: string;
  transcript_language?: string;
  calendar_invitees?: { name?: string | null; email?: string | null; is_external?: boolean }[] | null;
  recorded_by?: { name?: string | null; email?: string | null } | null;
  transcript?: { speaker?: { display_name?: string | null } | null; text?: string; timestamp?: string }[] | null;
  default_summary?: { template_name?: string; markdown_formatted?: string } | null;
  action_items?: { description?: string; assignee?: { name?: string | null; email?: string | null } | null; completed?: boolean }[] | null;
};

const TOLERANCIA_SEGUNDOS = 5 * 60;

/** Confere id + timestamp + corpo cru contra o segredo do webhook. Tolerância de 5 min no relógio. */
export function verificarAssinaturaFathom(
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  corpoCru: string,
  segredo: string,
): { ok: boolean; motivo?: string } {
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, motivo: "headers de assinatura ausentes" };
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, motivo: "timestamp inválido" };
  if (Math.abs(Date.now() / 1000 - ts) > TOLERANCIA_SEGUNDOS) return { ok: false, motivo: "timestamp fora da tolerância" };

  const chave = Buffer.from(segredo.replace(/^whsec_/, ""), "base64");
  const esperado = createHmac("sha256", chave).update(`${headers.id}.${headers.timestamp}.${corpoCru}`).digest();
  for (const parte of headers.signature.split(" ")) {
    const [versao, valor] = parte.split(",");
    if (versao !== "v1" || !valor) continue;
    const recebido = Buffer.from(valor, "base64");
    if (recebido.length === esperado.length && timingSafeEqual(recebido, esperado)) return { ok: true };
  }
  return { ok: false, motivo: "assinatura não confere" };
}

/** O id da gravação pode vir como número ou string; alguns payloads antigos usam `id`. */
export function extrairRecordingId(payload: Record<string, unknown>): string | null {
  const candidatos = [payload.recording_id, payload.id, (payload.recording as Record<string, unknown> | undefined)?.id];
  for (const c of candidatos) {
    if (typeof c === "number" && Number.isFinite(c)) return String(c);
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

/** Transcrição em texto corrido: "[00:05:32] Jane Doe: Let's revisit…" — é o que a IA lê. */
export function transcricaoParaTexto(transcript: FathomPayload["transcript"]): string {
  return (transcript ?? [])
    .map((t) => {
      const quem = t.speaker?.display_name?.trim();
      const hora = t.timestamp?.trim();
      return `${hora ? `[${hora}] ` : ""}${quem ? `${quem}: ` : ""}${(t.text ?? "").trim()}`;
    })
    .filter((l) => l.trim())
    .join("\n");
}

/** Monta a ata como o app guarda: resumo do Fathom, ações que ele mesmo marcou e a transcrição. */
export function montarAta(payload: FathomPayload): { titulo: string; data_reuniao: string; participantes: string | null; conteudo: string } {
  const titulo = (payload.meeting_title || payload.title || "Reunião gravada no Fathom").trim();
  const inicio = payload.recording_start_time || payload.scheduled_start_time || payload.created_at || new Date().toISOString();
  const data_reuniao = inicio.slice(0, 10);
  const nomes = [
    ...new Set(
      [payload.recorded_by?.name, ...(payload.calendar_invitees ?? []).map((c) => c.name)].filter((n): n is string => Boolean(n && n.trim())),
    ),
  ];
  const participantes = nomes.length > 0 ? nomes.join(", ") : null;

  const partes: string[] = [];
  const resumo = payload.default_summary?.markdown_formatted?.trim();
  if (resumo) partes.push(`## Resumo (Fathom)\n${resumo}`);
  const acoes = (payload.action_items ?? []).map((a) => a.description?.trim()).filter((d): d is string => Boolean(d));
  if (acoes.length > 0) partes.push(`## Ações marcadas pelo Fathom\n${acoes.map((a) => `- ${a}`).join("\n")}`);
  const transcricao = transcricaoParaTexto(payload.transcript);
  if (transcricao) partes.push(`## Transcrição\n${transcricao}`);
  if (payload.share_url || payload.url) partes.push(`Gravação: ${payload.share_url || payload.url}`);

  return { titulo, data_reuniao, participantes, conteudo: partes.join("\n\n") || "(ata sem conteúdo — o webhook chegou sem transcrição nem resumo)" };
}

/** Só usado quando o webhook vem sem transcrição (config sem "include transcript"). Precisa de FATHOM_API_KEY. */
export async function buscarTranscricaoFathom(recordingId: string): Promise<FathomPayload["transcript"] | null> {
  const chave = process.env.FATHOM_API_KEY;
  if (!chave) return null;
  const resp = await fetch(`https://api.fathom.ai/external/v1/recordings/${encodeURIComponent(recordingId)}/transcript`, {
    headers: { "X-Api-Key": chave },
  });
  if (!resp.ok) {
    console.error("Fathom: transcrição não veio", resp.status, await resp.text());
    return null;
  }
  const dados = (await resp.json()) as unknown;
  if (Array.isArray(dados)) return dados as FathomPayload["transcript"];
  const obj = dados as { transcript?: unknown };
  return Array.isArray(obj.transcript) ? (obj.transcript as FathomPayload["transcript"]) : null;
}
