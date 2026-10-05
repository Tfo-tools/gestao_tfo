import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { contaGoogleConectada } from "@/lib/google-calendar";
import { ConexaoGoogleCard } from "@/components/conexao-google-card";
import { acessoDrive } from "@/lib/google-drive";
import { MigrarAnexos } from "./migrar-anexos";
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
  const usuarios = (usersData?.users ?? []).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const {
    data: { user: usuarioAtual },
  } = await supabase.auth.getUser();
  const { data: prefs } = usuarioAtual
    ? await supabase.from("profiles").select("tarefas_visao_padrao, tarefas_so_minhas").eq("id", usuarioAtual.id).maybeSingle()
    : { data: null };
  // Anexos de tarefa no Drive (05/10/2026): precisa de alguma conexão Google com a permissão do Drive
  // e da pasta "Arquivos_tarefas" no Espaço TFO. Anexos antigos (Storage) migram pelo botão.
  const [acesso, { count: anexosAntigos }] = await Promise.all([
    acessoDrive(usuarioAtual?.id ?? null),
    supabase.from("anexos_tarefa").select("id", { count: "exact", head: true }).not("caminho_arquivo", "is", null),
  ]);

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
        <div className="mt-3 rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-1 font-heading text-sm font-semibold">Google Drive — anexos de tarefa</h2>
          <p className="text-[12px] text-text-muted">
            Arquivos anexados nas tarefas vão pra pasta <b>Arquivos_tarefas</b> do Drive compartilhado <b>Espaço TFO</b> (uma subpasta por tarefa). Word, Excel e
            PowerPoint viram Docs, Sheets e Slides e abrem editáveis pra quem é membro do Espaço TFO. Sobem pela conta Google de quem anexa (ou de outra sócia
            conectada) — ninguém precisa autorizar nada além da própria conexão.
          </p>
          {acesso ? (
            <p className="mt-2 rounded-lg bg-success-soft px-3 py-2 text-[12px] text-success">
              Drive liberado pela conta <span className="font-medium">{acesso.conta ?? "conectada"}</span>. Pasta Arquivos_tarefas encontrada.
            </p>
          ) : (
            <p className="mt-2 rounded-lg border border-warning bg-warning-soft px-3 py-2 text-[12px] text-warning">
              <b>Drive ainda não liberado.</b> Em <a href="/agenda" className="underline">Agenda → Sua agenda pessoal → Gerenciar → Reconectar</a>, entre com a sua conta
              @thefashionoffice.com.br e aceite a permissão do Google Drive. Se a pasta Arquivos_tarefas ainda não existir na raiz do Espaço TFO, crie. Até lá os anexos
              vão pro Supabase, só pra baixar.
            </p>
          )}
          <MigrarAnexos antigos={anexosAntigos ?? 0} driveOk={!!acesso} />
        </div>
      </div>
    </div>
  );
}
