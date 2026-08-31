"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DefinirSenhaForm() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [sessionOk, setSessionOk] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();

      // Links with ?code=... (PKCE) need an explicit exchange. Links with
      // #access_token=... (the format this project's e-mails use) are
      // picked up automatically when the client initializes below.
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }

      const { data } = await supabase.auth.getSession();
      setSessionOk(Boolean(data.session));
      setChecking(false);
    })();
  }, []);

  if (checking) {
    return <p className="text-sm text-text-muted">Verificando link…</p>;
  }

  if (!sessionOk) {
    return (
      <p className="rounded-lg bg-danger-soft px-3.5 py-3 text-[13px] text-danger">
        Esse link expirou ou já foi usado. Peça um novo em{" "}
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
        const { error } = await supabase.auth.updateUser({ password: senha });
        setPending(false);

        if (error) {
          setError("Não foi possível salvar a senha. Peça um novo link.");
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
