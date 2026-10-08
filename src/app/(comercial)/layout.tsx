import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(app)/actions";
import { URL_GESTAO } from "@/lib/hosts";

/**
 * Casca do app COMERCIAL (comercial.thefashionoffice.online): cabeçalho próprio, sem o menu do
 * Gestão. Hoje só as sócias entram; quando houver vendedor externo, ele verá só isto — nunca o
 * Gestão. Em desenvolvimento a mesma casca aparece em localhost/propostas.
 */
export default async function ComercialLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fpropostas");
  const { data: perfil } = await supabase.from("profiles").select("nome, papel").eq("id", user.id).maybeSingle();
  const socia = perfil?.papel === "socia";
  const nome = perfil?.nome ?? user.email ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="bg-wine-deep text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 md:px-8">
          <Link href="/propostas" className="flex items-center gap-2.5">
            <Image src="/brand/logo-tfo-branco.png" alt="The Fashion Office" width={44} height={33} priority />
            <span className="font-heading text-[13px] font-semibold tracking-[0.12em] text-cream uppercase">Comercial</span>
          </Link>
          <nav className="flex items-center gap-1 text-[12.5px]">
            <Link href="/propostas" className="rounded-md px-2.5 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">Propostas</Link>
            <Link href="/propostas/nova" className="rounded-md px-2.5 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">Nova</Link>
            {socia && <Link href="/propostas/parametros" className="rounded-md px-2.5 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">Parâmetros</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[12px] text-white/70">
            <span className="hidden sm:inline">{nome}</span>
            {socia && (
              <a href={URL_GESTAO} className="rounded-md border border-white/20 px-2.5 py-1 text-white/85 hover:bg-white/10">Gestão</a>
            )}
            <form action={signOut}>
              <button type="submit" className="rounded-md px-2 py-1 hover:bg-white/10 hover:text-white">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
