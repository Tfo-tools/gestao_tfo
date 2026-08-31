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
    .select("nome")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar nome={profile?.nome ?? user.email ?? "Usuária"} email={user.email ?? ""} />
      <main className="min-w-0 flex-1 px-10 py-8 pb-12">{children}</main>
    </div>
  );
}
