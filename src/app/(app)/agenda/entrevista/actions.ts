"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarEventoReuniao, periodosOcupadosGoogle } from "@/lib/google-calendar";
import { calcularSlotsDisponiveis, TIMEZONE_AGENDA, DIAS_A_FRENTE } from "@/lib/agenda-slots";
import { montarDescricaoConvite } from "@/lib/convite-agenda";

export type EntrevistaState = {
  error: string | null;
  sucesso?: { id: string; inicioIso: string; titulo: string; meetLink: string | null; textoWhatsapp: string };
};

async function ehSocia(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: perfil } = await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle();
  return perfil?.papel === "socia";
}

const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: TIMEZONE_AGENDA, weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });

/**
 * Agenda interna de entrevista de perfil (só sócias). Cria o compromisso "TFO + [empresa]" com o tipo
 * "Entrevista de perfil" — cujo nome tem palavra-chave, então a ata do Fathom cai sozinha na ficha
 * ClienteX. E-mail do cliente é opcional; sem e-mail, devolve o texto pronto pra enviar no WhatsApp.
 */
export async function criarEntrevista(_prev: EntrevistaState, formData: FormData): Promise<EntrevistaState> {
  if (!(await ehSocia())) return { error: "Só as sócias agendam entrevistas." };

  const empresa = String(formData.get("empresa") || "").trim();
  const nome = String(formData.get("nome") || "").trim() || empresa;
  const email = (String(formData.get("email") || "").trim().toLowerCase()) || null;
  const inicioIso = String(formData.get("inicio_iso") || "");
  const fimIso = String(formData.get("fim_iso") || "");
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!empresa) return { error: "Informe o nome da empresa." };
  if (!inicioIso || !fimIso) return { error: "Escolha um horário." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "E-mail inválido." };

  const admin = createAdminClient();
  const { data: tipo } = await admin
    .from("tipos_reuniao")
    .select("id, nome, duracao_minutos, ativo, mensagem_convite")
    .eq("slug", "entrevista-perfil")
    .single();
  if (!tipo || !tipo.ativo) return { error: "Tipo de entrevista não encontrado." };

  // Revalida o horário contra as janelas + o que já está ocupado (evita duas no mesmo horário).
  const { data: regras } = await admin.from("disponibilidade_regras").select("dia_semana, hora_inicio, hora_fim").eq("tipo_reuniao_id", tipo.id);
  const [{ data: reunioesExistentes }, ocupadosGoogle] = await Promise.all([
    admin.from("reunioes_agendadas").select("data_hora_inicio, data_hora_fim").eq("status", "confirmada"),
    periodosOcupadosGoogle(DIAS_A_FRENTE),
  ]);
  const slots = calcularSlotsDisponiveis(regras ?? [], tipo.duracao_minutos, [...(reunioesExistentes ?? []), ...ocupadosGoogle]);
  if (!slots.some((s) => s.inicioIso === inicioIso && s.fimIso === fimIso)) return { error: "Esse horário ficou indisponível — escolha outro." };

  // Contato: reaproveita por e-mail quando houver; senão cria um novo (empresa).
  let contatoId: string | undefined;
  if (email) {
    const { data: existente } = await admin.from("contatos_externos").select("id").eq("email", email).maybeSingle();
    if (existente) { contatoId = existente.id; await admin.from("contatos_externos").update({ nome, empresa }).eq("id", existente.id); }
  }
  if (!contatoId) {
    const { data: novo, error } = await admin.from("contatos_externos").insert({ nome, email, empresa }).select("id").single();
    if (error || !novo) return { error: "Não consegui registrar o contato." };
    contatoId = novo.id;
  }

  const { data: reuniao, error: erroReuniao } = await admin
    .from("reunioes_agendadas")
    .insert({ tipo_reuniao_id: tipo.id, contato_id: contatoId, data_hora_inicio: inicioIso, data_hora_fim: fimIso, observacoes })
    .select("id")
    .single();
  if (erroReuniao || !reuniao) return { error: "Não consegui salvar a reunião." };

  // Convidadas: as sócias sempre; o cliente só se tiver e-mail.
  const { data: socias } = await admin.from("profiles").select("id").eq("papel", "socia");
  const { data: usersData } = await admin.auth.admin.listUsers();
  const emailsSocias = (usersData?.users ?? []).filter((u) => (socias ?? []).some((s) => s.id === u.id)).map((u) => u.email).filter((e): e is string => !!e);

  const titulo = `TFO + ${empresa}`;
  const evento = await criarEventoReuniao({
    titulo,
    descricao: montarDescricaoConvite({ mensagem: tipo.mensagem_convite, empresa, observacoes }),
    inicioIso, fimIso, timeZone: TIMEZONE_AGENDA,
    emailsConvidados: email ? [...emailsSocias, email] : emailsSocias,
  });
  if (evento) await admin.from("reunioes_agendadas").update({ google_event_id: evento.id, meet_link: evento.meetLink }).eq("id", reuniao.id);

  const textoWhatsapp = [
    "Oi! Confirmando nossa conversa com o The Fashion Office 💬",
    `📅 ${fmtDataHora(inicioIso)}`,
    evento?.meetLink ? `🔗 Google Meet: ${evento.meetLink}` : null,
    "É um bate-papo de uns 45 min pra conhecer a sua marca e como funcionam as suas coleções. Até lá!",
  ].filter(Boolean).join("\n");

  return { error: null, sucesso: { id: reuniao.id, inicioIso, titulo, meetLink: evento?.meetLink ?? null, textoWhatsapp } };
}
