import { createAdminClient } from "@/lib/supabase/admin";
import { periodosOcupadosGoogle } from "@/lib/google-calendar";
import { DIAS_A_FRENTE } from "@/lib/agenda-slots";
import { AgendarForm } from "./agendar-form";

// Sem isso o Next tenta pré-renderizar essa página estaticamente no build (não usa cookies, então
// não tem sinal automático de que é dinâmica) — e os horários disponíveis ficariam congelados na
// hora do último deploy em vez de refletir agendamentos em tempo real.
export const dynamic = "force-dynamic";

export default async function AgendarPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  // Link próprio de cada tipo (/agendar?tipo=slug): a página já abre com ele escolhido.
  const { tipo: tipoInicial } = await searchParams;
  const admin = createAdminClient();

  const [{ data: tipos }, { data: regras }, { data: reunioesInternas }, ocupadosGoogle] = await Promise.all([
    admin.from("tipos_reuniao").select("id, nome, slug, duracao_minutos, descricao, mensagem_convite").eq("ativo", true).order("nome"),
    admin.from("disponibilidade_regras").select("id, tipo_reuniao_id, dia_semana, hora_inicio, hora_fim"),
    admin.from("reunioes_agendadas").select("data_hora_inicio, data_hora_fim").eq("status", "confirmada"),
    // Cruza com o que já está ocupado no Google (inclusive compromissos que não nasceram por
    // aqui) pra não oferecer um horário que colide com algo já marcado direto no calendário.
    periodosOcupadosGoogle(DIAS_A_FRENTE),
  ]);
  const reunioes = [...(reunioesInternas ?? []), ...ocupadosGoogle];

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbfaf8] px-6 py-10">
      <div className="w-full max-w-[560px]">
        <div className="mb-7 text-center">
          <div className="text-[10.5px] tracking-[0.14em] text-text-faint uppercase">The Fashion Office</div>
          <h1 className="mt-1.5 font-heading text-[22px] font-semibold">Agendar uma conversa</h1>
        </div>
        <AgendarForm tipos={tipos ?? []} regras={regras ?? []} reunioes={reunioes ?? []} tipoInicial={tipoInicial ?? null} />
      </div>
    </div>
  );
}
