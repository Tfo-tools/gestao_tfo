import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { contaGoogleConectada } from "@/lib/google-calendar";
import { ConexaoGoogleCard } from "@/components/conexao-google-card";
import { driveDisponivel } from "@/lib/google-drive";
import { UsuariosForm } from "./usuarios-form";
import { NotificacoesPush } from "./notificacoes-push";
import { PlanoContasManager } from "./plano-contas-manager";
import { UsuarioPapelSelect } from "./usuario-papel-select";
import { ParametrosTributariosCard } from "./parametros-tributarios";
import { PreferenciasTarefas } from "./preferencias-tarefas";
import type { VisaoTarefas } from "./preferencias-tarefas-actions";
import { parametrosTributariosDe } from "@/lib/impostos";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const [
    { data: profiles },
    { data: usersData },
    { data: planoContas },
    contaConectada,
    { data: tributosRaw },
    { data: programas },
    { data: cenariosLista },
  ] = await Promise.all([
    supabase.from("profiles").select("id, nome, papel, escopo_investidor_id").order("nome"),
    admin.auth.admin.listUsers(),
    supabase.from("plano_contas").select("id, codigo, conta, tipo, classificacao, descricao, parent_codigo"),
    contaGoogleConectada(),
    supabase.from("parametros_tributarios").select("*").maybeSingle(),
    supabase.from("programas_investimento").select("id, nome").order("nome"),
    supabase.from("cenarios").select("id, nome").order("nome"),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  // Anexos de tarefa no Drive dependem da conexão contato@ ter a permissão do Drive (entrou em 05/10/2026).
  const driveOk = contaConectada ? await driveDisponivel() : false;
  const usuarios = (usersData?.users ?? []).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const {
    data: { user: usuarioAtual },
  } = await supabase.auth.getUser();
  const { data: prefs } = usuarioAtual
    ? await supabase.from("profiles").select("tarefas_visao_padrao, tarefas_so_minhas").eq("id", usuarioAtual.id).maybeSingle()
    : { data: null };

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-heading text-[22px] font-semibold">Configurações</h1>
        <p className="mt-1 text-[13px] text-text-muted">Usuárias com acesso ao TFO-Gestão</p>
      </div>

      <div className="mb-6">
        <UsuariosForm />
      </div>

      <div className="mb-6">
        <NotificacoesPush />
      </div>

      <div className="mb-6">
        <PreferenciasTarefas visao={((prefs?.tarefas_visao_padrao as VisaoTarefas) ?? "projeto")} soMinhas={Boolean(prefs?.tarefas_so_minhas)} />
      </div>

      <div className="mb-6">
        <PlanoContasManager contas={planoContas ?? []} />
      </div>

      <div className="mb-6">
        <ParametrosTributariosCard
          valores={parametrosTributariosDe(tributosRaw as Record<string, unknown> | null)}
          observacoes={(tributosRaw as { observacoes?: string | null } | null)?.observacoes ?? null}
        />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 font-heading text-sm font-semibold">Usuárias</h2>
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="px-2 py-1.5 font-medium">Nome</th>
              <th className="px-2 py-1.5 font-medium">E-mail</th>
              <th className="px-2 py-1.5 font-medium">Convidada em</th>
              <th className="px-2 py-1.5 font-medium">Acesso</th>
              <th className="px-2 py-1.5 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const profile = profileById.get(u.id);
              const confirmado = Boolean(u.email_confirmed_at);
              return (
                <tr key={u.id} className="border-t border-border-soft">
                  <td className="px-2 py-2.5">{profile?.nome ?? "—"}</td>
                  <td className="px-2 py-2.5 text-text-muted">{u.email}</td>
                  <td className="px-2 py-2.5 font-mono">{formatDate(u.created_at)}</td>
                  <td className="px-2 py-2.5">
                    {profile ? (
                      <UsuarioPapelSelect
                        id={u.id}
                        papelAtual={profile.papel ?? "socia"}
                        escopoAtual={profile.escopo_investidor_id}
                        ehVoce={u.id === usuarioAtual?.id}
                        programas={programas ?? []}
                        cenarios={cenariosLista ?? []}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <span
                      className={`rounded px-2 py-0.5 text-[10.5px] font-semibold ${
                        confirmado ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                      }`}
                    >
                      {confirmado ? "Ativa" : "Convite pendente"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <ConexaoGoogleCard
          titulo="Google Calendar — agenda compartilhada (contato@)"
          explicacao="É essa conta que recebe os eventos criados pelo link público de agendamento. Pra conectar sua agenda pessoal, isso fica na tela de Agenda."
          contaConectada={contaConectada}
          linkConectar="/api/google/connect"
        />
        {contaConectada && !driveOk && (
          <div className="mt-2 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-[12.5px] text-warning">
            <b>Drive ainda não liberado.</b> Os anexos de tarefa vão pro Drive compartilhado (Zuzu › 8_GESTAO › APP_GESTAO › TAREFAS) e abrem
            editáveis pras duas — mas a conexão contato@ foi feita antes dessa permissão existir. Dois passos, uma vez só: (1) no Drive, adicione{" "}
            <span className="font-mono">contato@thefashionoffice.com.br</span> como <b>Administrador de conteúdo</b> do Drive compartilhado Zuzu; (2) clique em{" "}
            <a href="/api/google/connect" className="font-medium underline">
              Reconectar
            </a>{" "}
            acima e aceite a permissão do Drive. Até lá, os anexos continuam indo pro Supabase (só pra baixar).
          </div>
        )}
        {contaConectada && driveOk && <p className="mt-2 text-[11.5px] text-success">Drive liberado: anexos de tarefa vão pro Drive compartilhado e abrem editáveis.</p>}
      </div>
    </div>
  );
}
