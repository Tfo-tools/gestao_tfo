import { createClient } from "@/lib/supabase/server";
import { DefinirSenhaForm } from "./definir-senha-form";

export default async function DefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbfaf8] px-6">
      <div className="w-full max-w-[340px]">
        <h1 className="font-heading text-[22px] font-semibold">Definir senha</h1>
        <p className="mt-1.5 mb-7 text-[13px] text-text-muted">
          Escolha a senha que você vai usar para acessar o TFO-Gestão
        </p>
        <DefinirSenhaForm />
      </div>
    </div>
  );
}
