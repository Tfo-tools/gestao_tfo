import { createClient } from "@/lib/supabase/server";
import { contaGoogleConectada, listarProximosEventos } from "@/lib/google-calendar";
import { anthropicConfigurado } from "@/lib/anthropic";
import { AgendaManager, type ReuniaoAgendada } from "./agenda-manager";
import { lerEventosIcs } from "@/lib/agenda-icloud";
import type { Ata } from "./atas-manager";
import type { TarefaComPrazo } from "./calendario-semana";

const DIAS_A_FRENTE_LISTAGEM = 30;
// O calendário da semana precisa enxergar reuniões passadas também (pra navegar "semana
// anterior"), diferente das outras seções da tela que só mostram o que ainda vai acontecer.
const DIAS_ATRAS_CALENDARIO = 45;
const DIAS_A_FRENTE_CALENDARIO = 90;

export default async function AgendaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const agora = new Date();
  const inicioJanelaCalendario = new Date(agora.getTime() - DIAS_ATRAS_CALENDARIO * 24 * 60 * 60 * 1000).toISOString();
  const fimJanelaCalendario = new Date(agora.getTime() + DIAS_A_FRENTE_CALENDARIO * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: tipos },
    { data: regras },
    { data: reunioes },
    { data: reunioesCalendario },
    contaConectada,
    contaPessoalConectada,
    { data: pessoas },
    { data: atas },
    { data: tarefasComPrazo },
    { data: perfilAtual },
  ] = await Promise.all([
    supabase.from("tipos_reuniao").select("id, nome, slug, duracao_minutos, descricao, ativo, mensagem_convite").order("nome"),
    supabase.from("disponibilidade_regras").select("id, tipo_reuniao_id, dia_semana, hora_inicio, hora_fim"),
    supabase
      .from("reunioes_agendadas")
      .select(
        "id, data_hora_inicio, data_hora_fim, status, observacoes, meet_link, tipos_reuniao(nome), contatos_externos(nome, email, empresa)",
      )
      .eq("status", "confirmada")
      .gte("data_hora_inicio", agora.toISOString())
      .order("data_hora_inicio"),
    supabase
      .from("reunioes_agendadas")
      .select(
        "id, data_hora_inicio, data_hora_fim, status, observacoes, meet_link, tipos_reuniao(nome), contatos_externos(nome, email, empresa)",
      )
      .eq("status", "confirmada")
      .gte("data_hora_inicio", inicioJanelaCalendario)
      .lte("data_hora_inicio", fimJanelaCalendario)
      .order("data_hora_inicio"),
    contaGoogleConectada(),
    user ? contaGoogleConectada(user.id) : Promise.resolve(null),
    supabase.from("profiles").select("id, nome").order("nome"),
    supabase
      .from("reuniao_atas")
      .select("id, titulo, data_reuniao, participantes, conteudo, reuniao_id, google_event_id")
      .order("data_reuniao", { ascending: false }),
    supabase.from("tarefas").select("id, titulo, prazo, responsavel_id, status").not("prazo", "is", null),
    user ? supabase.from("profiles").select("ics_pessoal_url").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const icsPessoalUrl = (perfilAtual as { ics_pessoal_url?: string | null } | null)?.ics_pessoal_url ?? null;

  // Só busca no Google depois de saber que tem conta conectada — evita uma chamada de API à toa.
  const [eventosGoogle, eventosPessoaisGoogle, eventosIcloud] = await Promise.all([
    contaConectada ? listarProximosEventos(DIAS_A_FRENTE_LISTAGEM) : Promise.resolve([]),
    contaPessoalConectada && user ? listarProximosEventos(DIAS_A_FRENTE_LISTAGEM, 20, user.id) : Promise.resolve([]),
    icsPessoalUrl
      ? lerEventosIcs(icsPessoalUrl, agora, new Date(agora.getTime() + DIAS_A_FRENTE_LISTAGEM * 24 * 60 * 60 * 1000)).catch(() => [])
      : Promise.resolve([]),
  ]);
  // iCloud já chega como "Compromisso pessoal" (título real nunca sai de lá).
  const eventosPessoais = [...eventosPessoaisGoogle, ...eventosIcloud].sort((a, b) => a.inicioIso.localeCompare(b.inicioIso));

  const reunioesAgendadas = (reunioes ?? []) as unknown as ReuniaoAgendada[];
  const reunioesParaCalendario = (reunioesCalendario ?? []) as unknown as ReuniaoAgendada[];

  // Toda reunião marcada convida as duas sócias, e o Google espelha automaticamente na agenda
  // pessoal de quem foi convidada — é o MESMO compromisso, não dois. `iCalUID` é estável entre a
  // cópia do organizador (contato@) e a cópia da convidada, ao contrário de `id` (só único dentro
  // de um calendário), então dá pra reconhecer e não listar de novo na agenda pessoal.
  // Chave = iCalUID + início: evento recorrente repete o iCalUID em cada instância.
  const idsNaAgendaCompartilhada = new Set(eventosGoogle.map((e) => `${e.iCalUID}|${e.inicioIso}`));
  const eventosPessoaisSemDuplicata = eventosPessoais.filter((e) => !idsNaAgendaCompartilhada.has(`${e.iCalUID}|${e.inicioIso}`));

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">Agenda</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-text-muted">
          Configure os tipos de reunião e os horários disponíveis — o link público de agendamento fica em{" "}
          <span className="font-mono text-text">/agendar</span>. Toda reunião marcada por lá cria um compromisso no
          Google Calendar da conta conectada, com você e a Emyli como convidadas.
        </p>
      </div>

      <AgendaManager
        tipos={tipos ?? []}
        regras={regras ?? []}
        reunioes={reunioesAgendadas}
        reunioesParaCalendario={reunioesParaCalendario}
        tarefas={(tarefasComPrazo ?? []) as TarefaComPrazo[]}
        contaConectada={contaConectada}
        eventosGoogle={eventosGoogle}
        contaPessoalConectada={contaPessoalConectada}
        eventosPessoais={eventosPessoaisSemDuplicata}
        icsPessoalUrl={icsPessoalUrl}
        atas={(atas ?? []) as Ata[]}
        pessoas={pessoas ?? []}
        iaConfigurada={anthropicConfigurado()}
      />
    </div>
  );
}
