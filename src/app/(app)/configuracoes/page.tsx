import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { UsuariosForm } from "./usuarios-form";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: profiles }, { data: usersData }] = await Promise.all([
    supabase.from("profiles").select("id, nome, papel"),
    admin.auth.admin.listUsers(),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const usuarios = (usersData?.users ?? []).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-heading text-[22px] font-semibold">Configurações</h1>
        <p className="mt-1 text-[13px] text-text-muted">Usuárias com acesso ao TFO-Gestão</p>
      </div>

      <div className="mb-6">
        <UsuariosForm />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 font-heading text-sm font-semibold">Usuárias</h2>
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="px-2 py-1.5 font-medium">Nome</th>
              <th className="px-2 py-1.5 font-medium">E-mail</th>
              <th className="px-2 py-1.5 font-medium">Convidada em</th>
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
    </div>
  );
}
