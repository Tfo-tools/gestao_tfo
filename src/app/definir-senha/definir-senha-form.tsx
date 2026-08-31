"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DefinirSenhaForm({
  tokenHash,
  type,
}: {
  tokenHash?: string;
  type?: string;
}) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!tokenHash || !type) {
    return (
      <p className="rounded-lg bg-danger-soft px-3.5 py-3 text-[13px] text-danger">
        Link inválido. Peça um novo em{" "}
        <a href="/recuperar-senha" className="font-medium underline">
          Recuperar senha
        </a>
        .
      </p>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);

        if (senha.length < 8) {
          setError("A senha precisa ter pelo menos 8 caracteres.");
          return;
        }
        if (senha !== confirmar) {
          setError("As senhas não coincidem.");
          return;
        }

        setPending(true);
        const supabase = createClient();

        // The one-time token is only consumed here, on real form submission —
        // never on a bare page load — so email link-preview prefetching can't
        // burn it before the person actually sets their password.
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: type as any,
        });

        if (verifyError) {
          setPending(false);
          setError("Esse link expirou ou já foi usado. Peça um novo em Recuperar senha.");
          return;
        }

        const { error: updateError } = await supabase.auth.updateUser({ password: senha });
        setPending(false);

        if (updateError) {
          setError("Não foi possível salvar a senha. Tente novamente.");
          return;
        }

        router.push("/");
        router.refresh();
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-muted">Nova senha</label>
        <input
          type="password"
          required
          minLength={8}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="input"
          placeholder="mínimo 8 caracteres"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-muted">Confirmar senha</label>
        <input
          type="password"
          required
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          className="input"
        />
      </div>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-wine-deep px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar senha e entrar"}
      </button>
    </form>
  );
}
