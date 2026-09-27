import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anthropicConfigurado, extrairAcoesDaAta } from "@/lib/anthropic";
import { listarEventosEntre } from "@/lib/google-calendar";
import { buscarTranscricaoFathom, extrairRecordingId, montarAta, verificarAssinaturaFathom, type FathomPayload } from "@/lib/fathom";

/**
 * Ata do Fathom entra sozinha, na reunião certa: o Fathom chama aqui quando termina de processar.
 * 1. confere a assinatura (FATHOM_WEBHOOK_SECRET, gerado na tela do webhook no Fathom);
 * 2. acha a reunião em que a gravação aconteceu — primeiro uma reunião marcada pelo app
 *    (reunioes_agendadas), depois um compromisso da agenda compartilhada do Google — pelo horário
 *    (±30 min do início da gravação), desempatando por convidado em comum;
 * 3. salva/atualiza a ata em reuniao_atas (chave fathom_recording_id — reenvio não duplica). Se a
 *    reunião já tinha ata escrita à mão, a do Fathom entra abaixo dela, sem apagar nada;
 * 4. criar tarefas pela IA só se FATHOM_TAREFAS_AUTOMATICAS=1 (automação cancelada por custo em
 *    26/09/2026 — sem essa variável e sem ANTHROPIC_API_KEY nada é chamado).
 * Roda com o service role porque não há sessão de usuário numa chamada de webhook.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ETIQUETA_AUTOMATICA = "criada-automaticamente";
const JANELA_MINUTOS = 30;

type ReuniaoApp = { id: string; data_hora_inicio: string; google_event_id: string | null; contatos_externos: { email: string | null } | { email: string | null }[] | null };

/** Reunião marcada pelo app cujo início cai a ±30 min da gravação; com mais de uma, a de convidado em comum ou a mais próxima. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function acharReuniaoDoApp(admin: any, inicio: Date, emails: Set<string>): Promise<ReuniaoApp | null> {
  const de = new Date(inicio.getTime() - JANELA_MINUTOS * 60000).toISOString();
  const ate = new Date(inicio.getTime() + JANELA_MINUTOS * 60000).toISOString();
  const { data } = await admin
    .from("reunioes_agendadas")
    .select("id, data_hora_inicio, google_event_id, contatos_externos(email)")
    .eq("status", "confirmada")
    .gte("data_hora_inicio", de)
    .lte("data_hora_inicio", ate);
  const candidatas = (data ?? []) as ReuniaoApp[];
  if (candidatas.length === 0) return null;
  const emailDe = (r: ReuniaoApp) => {
    const c = Array.isArray(r.contatos_externos) ? r.contatos_externos[0] : r.contatos_externos;
    return c?.email?.toLowerCase() ?? null;
  };
  const comConvidado = candidatas.filter((r) => {
    const e = emailDe(r);
    return e && emails.has(e);
  });
  const lista = comConvidado.length > 0 ? comConvidado : candidatas;
  return lista.sort((a, b) => Math.abs(new Date(a.data_hora_inicio).getTime() - inicio.getTime()) - Math.abs(new Date(b.data_hora_inicio).getTime() - inicio.getTime()))[0];
}

/** Compromisso da agenda compartilhada do Google a ±30 min da gravação (sem dia inteiro). */
async function acharEventoGoogle(inicio: Date, emails: Set<string>): Promise<string | null> {
  const de = new Date(inicio.getTime() - JANELA_MINUTOS * 60000).toISOString();
  const ate = new Date(inicio.getTime() + JANELA_MINUTOS * 60000).toISOString();
  let eventos;
  try {
    eventos = await listarEventosEntre(de, ate);
  } catch (e) {
    console.error("Fathom: não consegui listar eventos do Google:", e);
    return null;
  }
  const candidatos = eventos.filter((ev) => !ev.diaTodo && Math.abs(new Date(ev.inicioIso).getTime() - inicio.getTime()) <= JANELA_MINUTOS * 60000);
  if (candidatos.length === 0) return null;
  const comConvidado = candidatos.filter((ev) => ev.convidados.some((c) => emails.has(c.email.toLowerCase())));
  const lista = comConvidado.length > 0 ? comConvidado : candidatos;
  return lista.sort((a, b) => Math.abs(new Date(a.inicioIso).getTime() - inicio.getTime()) - Math.abs(new Date(b.inicioIso).getTime() - inicio.getTime()))[0].id;
}

export async function POST(request: NextRequest) {
  // O segredo vem do webhook que o app criou (tela Agenda → "Conectar Fathom"), guardado em
  // integracoes; FATHOM_WEBHOOK_SECRET na Vercel é só alternativa manual.
  const adminSegredo = createAdminClient();
  const { data: integracao } = await adminSegredo.from("integracoes").select("valor").eq("chave", "fathom_webhook").maybeSingle();
  const segredo = (integracao?.valor as { secret?: string } | null)?.secret || process.env.FATHOM_WEBHOOK_SECRET;
  if (!segredo) return NextResponse.json({ error: "Fathom não conectado — Agenda → Conectar Fathom" }, { status: 503 });

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

  // ── Reunião exata ──────────────────────────────────────────────────────────────────────────
  const inicioIso = dados.recording_start_time || dados.scheduled_start_time || dados.created_at;
  const inicio = inicioIso ? new Date(inicioIso) : null;
  const emails = new Set(
    [...(dados.calendar_invitees ?? []).map((c) => c.email), dados.recorded_by?.email].filter((e): e is string => Boolean(e)).map((e) => e.toLowerCase()),
  );
  let reuniao_id: string | null = null;
  let google_event_id: string | null = null;
  if (inicio && !Number.isNaN(inicio.getTime())) {
    const reuniao = await acharReuniaoDoApp(admin, inicio, emails);
    if (reuniao) reuniao_id = reuniao.id;
    else google_event_id = await acharEventoGoogle(inicio, emails);
  }

  // ── Salvar ─────────────────────────────────────────────────────────────────────────────────
  const { data: existentePorFathom } = await admin.from("reuniao_atas").select("id").eq("fathom_recording_id", recordingId).maybeSingle();
  if (existentePorFathom) {
    // Reenvio (o Fathom repete quando não recebe 2xx): atualiza o texto, mantém o vínculo.
    const { error } = await admin
      .from("reuniao_atas")
      .update({ conteudo: ata.conteudo, participantes: ata.participantes, atualizado_em: new Date().toISOString() })
      .eq("id", existentePorFathom.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ata_id: existentePorFathom.id, reenvio: true });
  }

  // A reunião já tinha ata escrita à mão? Uma ata por reunião: a do Fathom entra abaixo da existente.
  let ataId: string | null = null;
  if (reuniao_id || google_event_id) {
    const q = admin.from("reuniao_atas").select("id, conteudo");
    const { data: manual } = await (reuniao_id ? q.eq("reuniao_id", reuniao_id) : q.eq("google_event_id", google_event_id!)).maybeSingle();
    if (manual) {
      const { error } = await admin
        .from("reuniao_atas")
        .update({
          conteudo: `${manual.conteudo}\n\n---\n\n${ata.conteudo}`,
          fathom_recording_id: recordingId,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", manual.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      ataId = manual.id;
    }
  }
  if (!ataId) {
    const { data: nova, error } = await admin
      .from("reuniao_atas")
      .insert({ ...ata, reuniao_id, google_event_id, fathom_recording_id: recordingId })
      .select("id")
      .single();
    if (error || !nova) return NextResponse.json({ error: error?.message ?? "não salvou" }, { status: 500 });
    ataId = nova.id;
  }

  // ── Tarefas automáticas (desligadas por padrão) ────────────────────────────────────────────
  let tarefasCriadas = 0;
  let aviso: string | null = null;
  if (process.env.FATHOM_TAREFAS_AUTOMATICAS === "1" && anthropicConfigurado()) {
    const { data: pessoas } = await admin.from("profiles").select("id, nome");
    const lista = (pessoas ?? []) as { id: string; nome: string }[];
    const { error: erroIa, acoes } = await extrairAcoesDaAta(ata.conteudo, lista.map((p) => p.nome));
    if (erroIa) aviso = erroIa;
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
            origem_ata_id: ataId,
            etiquetas: [ETIQUETA_AUTOMATICA],
          };
        }),
      );
      if (erroTarefas) aviso = erroTarefas.message;
      else tarefasCriadas = acoes.length;
    }
  }

  return NextResponse.json({
    ok: true,
    ata_id: ataId,
    vinculo: reuniao_id ? { reuniao_id } : google_event_id ? { google_event_id } : "sem reunião identificada",
    tarefas_criadas: tarefasCriadas,
    aviso,
  });
}
