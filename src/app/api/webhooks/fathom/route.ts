import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anthropicConfigurado, extrairAcoesDaAta } from "@/lib/anthropic";
import { buscarTranscricaoFathom, extrairRecordingId, montarAta, verificarAssinaturaFathom, type FathomPayload } from "@/lib/fathom";

/**
 * Ata do Fathom entra sozinha: o Fathom chama aqui quando termina de processar uma reunião.
 * 1. confere a assinatura (FATHOM_WEBHOOK_SECRET, gerado na tela do webhook no Fathom);
 * 2. salva/atualiza a ata em reuniao_atas (chave fathom_recording_id — reenvio não duplica);
 * 3. só na PRIMEIRA vez que a ata entra, pede à IA os próximos passos e cria as tarefas direto,
 *    sem revisão, com a etiqueta `criada-automaticamente` (decisão da Vanessa em 26/09/2026:
 *    só reunião pula a revisão; mensagem colada em /tarefas continua exigindo o clique).
 * Roda com o service role porque não há sessão de usuário numa chamada de webhook.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ETIQUETA_AUTOMATICA = "criada-automaticamente";

export async function POST(request: NextRequest) {
  const segredo = process.env.FATHOM_WEBHOOK_SECRET;
  if (!segredo) return NextResponse.json({ error: "FATHOM_WEBHOOK_SECRET não configurado" }, { status: 503 });

  const corpoCru = await request.text();
  const assinatura = verificarAssinaturaFathom(
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    corpoCru,
    segredo,
  );
  if (!assinatura.ok) {
    console.warn("Fathom webhook recusado:", assinatura.motivo);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(corpoCru) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "corpo não é JSON" }, { status: 400 });
  }
  const recordingId = extrairRecordingId(payload);
  if (!recordingId) {
    // Formato diferente do documentado: fica logado pra ajustar extrairRecordingId.
    console.error("Fathom webhook sem recording_id reconhecível:", corpoCru.slice(0, 4000));
    return NextResponse.json({ ok: true, ignorado: "sem recording_id" });
  }

  const dados = payload as unknown as FathomPayload;
  if (!dados.transcript || dados.transcript.length === 0) {
    const transcricao = await buscarTranscricaoFathom(recordingId);
    if (transcricao) dados.transcript = transcricao;
  }
  const ata = montarAta(dados);

  const admin = createAdminClient();
  const { data: existente } = await admin.from("reuniao_atas").select("id").eq("fathom_recording_id", recordingId).maybeSingle();

  if (existente) {
    // Reenvio (o Fathom repete quando não recebe 2xx): atualiza o texto, não cria tarefa de novo.
    const { error } = await admin
      .from("reuniao_atas")
      .update({ ...ata, atualizado_em: new Date().toISOString() })
      .eq("id", existente.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ata_id: existente.id, reenvio: true });
  }

  const { data: nova, error } = await admin
    .from("reuniao_atas")
    .insert({ ...ata, fathom_recording_id: recordingId })
    .select("id")
    .single();
  if (error || !nova) return NextResponse.json({ error: error?.message ?? "não salvou" }, { status: 500 });

  let tarefasCriadas = 0;
  let avisoIa: string | null = null;
  if (anthropicConfigurado()) {
    const { data: pessoas } = await admin.from("profiles").select("id, nome");
    const lista = (pessoas ?? []) as { id: string; nome: string }[];
    const { error: erroIa, acoes } = await extrairAcoesDaAta(ata.conteudo, lista.map((p) => p.nome));
    if (erroIa) avisoIa = erroIa;
    if (acoes.length > 0) {
      const quando = ata.data_reuniao.split("-").reverse().join("/");
      const { error: erroTarefas } = await admin.from("tarefas").insert(
        acoes.map((a) => {
          const pessoa = lista.find((p) => p.nome.toLowerCase() === (a.responsavel_sugerido ?? "").toLowerCase());
          return {
            titulo: a.titulo,
            descricao: `Criada automaticamente a partir da ata do Fathom «${ata.titulo}» (${quando}) — ainda não revisada.${a.responsavel_sugerido && !pessoa ? ` Responsável sugerido: ${a.responsavel_sugerido}.` : ""}`,
            responsavel_id: pessoa?.id ?? null,
            prazo: a.prazo_sugerido,
            origem_ata_id: nova.id,
            etiquetas: [ETIQUETA_AUTOMATICA],
          };
        }),
      );
      if (erroTarefas) avisoIa = erroTarefas.message;
      else tarefasCriadas = acoes.length;
    }
  } else {
    avisoIa = "ANTHROPIC_API_KEY não configurada — ata salva, tarefas não criadas.";
  }

  return NextResponse.json({ ok: true, ata_id: nova.id, tarefas_criadas: tarefasCriadas, aviso: avisoIa });
}
