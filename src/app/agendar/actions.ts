"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { criarEventoReuniao, periodosOcupadosGoogle } from "@/lib/google-calendar";
import { calcularSlotsDisponiveis, TIMEZONE_AGENDA, DIAS_A_FRENTE } from "@/lib/agenda-slots";

export type AgendamentoState = { error: string | null; sucesso?: { dataHora: string; meetLink: string | null } };

/** Roda com a service role porque quem chama aqui é um visitante sem login — a validação de
 * autorização de quem PODE mexer nas tabelas de agenda é feita nas telas internas (/agenda),
 * aqui só criamos o registro público de um agendamento já validado contra os horários livres. */
export async function criarAgendamento(_prevState: AgendamentoState, formData: FormData): Promise<AgendamentoState> {
  const tipo_reuniao_id = String(formData.get("tipo_reuniao_id") || "");
  const inicioIso = String(formData.get("inicio_iso") || "");
  const fimIso = String(formData.get("fim_iso") || "");
  const nome = String(formData.get("nome") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const empresa = String(formData.get("empresa") || "").trim() || null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!tipo_reuniao_id || !inicioIso || !fimIso || !nome || !email) {
    return { error: "Preencha nome, e-mail e escolha um horário." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "E-mail inválido." };
  }

  const admin = createAdminClient();

  const { data: tipo } = await admin
    .from("tipos_reuniao")
    .select("id, nome, duracao_minutos, ativo")
    .eq("id", tipo_reuniao_id)
    .single();
  if (!tipo || !tipo.ativo) return { error: "Esse tipo de reunião não está mais disponível." };

  // Revalida o horário no servidor no momento da confirmação — evita que duas pessoas reservem o
  // mesmo horário entre a pessoa abrir a tela e clicar em confirmar.
  const { data: regras } = await admin.from("disponibilidade_regras").select("dia_semana, hora_inicio, hora_fim").eq("tipo_reuniao_id", tipo_reuniao_id);
  const [{ data: reunioesExistentes }, ocupadosGoogle] = await Promise.all([
    admin.from("reunioes_agendadas").select("data_hora_inicio, data_hora_fim").eq("status", "confirmada"),
    periodosOcupadosGoogle(DIAS_A_FRENTE),
  ]);

  const slotsValidos = calcularSlotsDisponiveis(regras ?? [], tipo.duracao_minutos, [...(reunioesExistentes ?? []), ...ocupadosGoogle]);
  const slotValido = slotsValidos.some((s) => s.inicioIso === inicioIso && s.fimIso === fimIso);
  if (!slotValido) {
    return { error: "Esse horário acabou de ficar indisponível — escolha outro." };
  }

  const { data: contatoExistente } = await admin.from("contatos_externos").select("id").eq("email", email).maybeSingle();
  let contatoId = contatoExistente?.id as string | undefined;
  if (contatoId) {
    await admin.from("contatos_externos").update({ nome, empresa }).eq("id", contatoId);
  } else {
    const { data: novoContato, error: erroContato } = await admin
      .from("contatos_externos")
      .insert({ nome, email, empresa })
      .select("id")
      .single();
    if (erroContato || !novoContato) return { error: "Não foi possível registrar seus dados — tente de novo." };
    contatoId = novoContato.id;
  }

  const { data: reuniao, error: erroReuniao } = await admin
    .from("reunioes_agendadas")
    .insert({
      tipo_reuniao_id,
      contato_id: contatoId,
      data_hora_inicio: inicioIso,
      data_hora_fim: fimIso,
      observacoes,
    })
    .select("id")
    .single();
  if (erroReuniao || !reuniao) return { error: "Não foi possível confirmar o agendamento — tente de novo." };

  const { data: socias } = await admin.from("profiles").select("id").eq("papel", "socia");
  const { data: usersData } = await admin.auth.admin.listUsers();
  const emailsSocias = (usersData?.users ?? [])
    .filter((u) => (socias ?? []).some((s) => s.id === u.id))
    .map((u) => u.email)
    .filter((e): e is string => !!e);

  const eventoGoogle = await criarEventoReuniao({
    titulo: `${tipo.nome} — TFO com ${nome}`,
    descricao: [`Agendado via TFO-Gestão.`, empresa ? `Empresa: ${empresa}` : null, observacoes ? `Observações: ${observacoes}` : null]
      .filter(Boolean)
      .join("\n"),
    inicioIso,
    fimIso,
    timeZone: TIMEZONE_AGENDA,
    emailsConvidados: [...emailsSocias, email],
  });

  if (eventoGoogle) {
    await admin
      .from("reunioes_agendadas")
      .update({ google_event_id: eventoGoogle.id, meet_link: eventoGoogle.meetLink })
      .eq("id", reuniao.id);
  }

  return { error: null, sucesso: { dataHora: inicioIso, meetLink: eventoGoogle?.meetLink ?? null } };
}
