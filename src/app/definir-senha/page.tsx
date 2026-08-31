import { DefinirSenhaForm } from "./definir-senha-form";

export default function DefinirSenhaPage() {
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
