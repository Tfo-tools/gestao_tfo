import Link from "next/link";
import { RecuperarSenhaForm } from "./recuperar-senha-form";

export default function RecuperarSenhaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbfaf8] px-6">
      <div className="w-full max-w-[340px]">
        <h1 className="font-heading text-[22px] font-semibold">Recuperar senha</h1>
        <p className="mt-1.5 mb-7 text-[13px] text-text-muted">
          Informe o e-mail cadastrado para receber o link de redefinição
        </p>
        <RecuperarSenhaForm />
        <Link href="/login" className="mt-5 block text-center text-[12.5px] text-text-muted">
          Voltar para o login
        </Link>
      </div>
    </div>
  );
}
