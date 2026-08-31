import Image from "next/image";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen w-full">
      <div
        className="relative hidden w-[46%] max-w-[560px] flex-col justify-between overflow-hidden p-11 md:flex"
        style={{
          background:
            "linear-gradient(160deg, #6d84b8 0%, #4a5f92 38%, #34101e 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 80% 15%, rgba(249,243,174,0.14), transparent 45%)",
          }}
        />
        <div className="relative">
          <Image
            src="/brand/logo-tfo-branco.png"
            alt="The Fashion Office"
            width={158}
            height={118}
            priority
          />
          <div className="mt-2.5 text-[10.5px] tracking-[0.14em] text-white/50 uppercase">
            Gestão
          </div>
        </div>

        <div className="relative">
          <h1 className="max-w-sm font-heading text-2xl leading-snug font-semibold text-white">
            Clareza estratégica para o negócio da moda — e para o nosso também.
          </h1>
          <p className="mt-4 max-w-[360px] text-sm leading-relaxed text-white/65">
            Vendas, custos, cenários e prestação de contas dos produtos SaaS da The
            Fashion Office, num só lugar.
          </p>
        </div>

        <div className="relative flex items-center gap-2 text-[11.5px] text-white/60">
          Acesso restrito — uso interno e confidencial
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[#fbfaf8] px-6">
        <div className="w-full max-w-[340px]">
          <h2 className="font-heading text-[22px] font-semibold">Entrar</h2>
          <p className="mt-1.5 mb-7 text-[13px] text-text-muted">
            Acesse com seu e-mail cadastrado
          </p>

          <LoginForm />

          <div className="mt-6 flex items-start gap-2 rounded-lg bg-primary-soft px-3.5 py-3">
            <span className="text-[11.5px] leading-relaxed text-primary-deep">
              Acesso restrito ao time da The Fashion Office. Fale com a administração
              se precisar de um convite.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
