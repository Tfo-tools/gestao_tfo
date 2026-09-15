import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, papel")
    .eq("id", user.id)
    .single();

  // Contabilidade externa não vê cenários (é dado estratégico/projeção) — nem busca a lista.
  const ehContabilidade = profile?.papel === "contabilidade";

  // Os cenários descem para o menu: a Sidebar é componente de cliente e precisa deles pra oferecer
  // acesso direto a cada plano, sem passar pela tela de criação de cenários.
  const { data: cenarios } = ehContabilidade
    ? { data: [] }
    : await supabase.from("cenarios").select("id, nome, is_base").order("created_at");

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar
        nome={profile?.nome ?? user.email ?? "Usuária"}
        email={user.email ?? ""}
        cenarios={cenarios ?? []}
        papel={profile?.papel ?? "socia"}
      />
      <main className="min-w-0 flex-1 px-4 pt-16 pb-10 md:px-10 md:py-8 md:pb-12">{children}</main>
    </div>
  );
}
