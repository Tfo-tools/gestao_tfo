import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { periodosOcupadosGoogle } from "@/lib/google-calendar";
import { calcularSlotsDisponiveis, DIAS_A_FRENTE } from "@/lib/agenda-slots";
import { EntrevistaForm } from "./entrevista-form";

export const dynamic = "force-dynamic";

/** Agenda interna de entrevista de perfil (só sócias). Mostra os horários livres nas janelas de
 * dias úteis e cria o compromisso "TFO + [empresa]" já etiquetado como pesquisa. */
export default async function AgendarEntrevistaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect("/agenda");

  const admin = createAdminClient();
  const { data: tipo } = await admin.from("tipos_reuniao").select("id, duracao_minutos").eq("slug", "entrevista-perfil").single();
  if (!tipo) redirect("/agenda");
  const [{ data: regras }, { data: reunioesInternas }, ocupadosGoogle] = await Promise.all([
    admin.from("disponibilidade_regras").select("dia_semana, hora_inicio, hora_fim").eq("tipo_reuniao_id", tipo.id),
    admin.from("reunioes_agendadas").select("data_hora_inicio, data_hora_fim").eq("status", "confirmada"),
    periodosOcupadosGoogle(DIAS_A_FRENTE),
  ]);
  const slots = calcularSlotsDisponiveis(regras ?? [], tipo.duracao_minutos, [...(reunioesInternas ?? []), ...ocupadosGoogle]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/agenda" className="text-[12px] text-text-muted hover:underline">← Agenda</Link>
        <h1 className="font-heading text-[20px] font-semibold">Agendar entrevista de perfil</h1>
      </div>
      <p className="max-w-2xl text-[12.5px] text-text-muted">
        Cria o compromisso como <b>&quot;TFO + [empresa]&quot;</b>, já etiquetado como pesquisa — a ata do Fathom cai na ficha da marca (ClienteX) e não vira sugestão de tarefa. Horários: seg/qua 9:30–11h e 15–17h; ter/qui/sex 15–17h. E-mail do cliente é opcional; sem e-mail, você copia o link pra enviar no WhatsApp.
      </p>
      <EntrevistaForm slots={slots} />
    </div>
  );
}
