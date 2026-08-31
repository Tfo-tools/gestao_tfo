"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function RecuperarSenhaForm() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [pending, setPending] = useState(false);

  if (enviado) {
    return (
      <p className="rounded-lg bg-success-soft px-3.5 py-3 text-[13px] text-success">
        Se esse e-mail estiver cadastrado, você vai receber um link para redefinir a senha.
      </p>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const supabase = createClient();
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/definir-senha`,
        });
        setPending(false);
        setEnviado(true);
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-muted">E-mail</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          placeholder="voce@thefashionoffice.online"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-wine-deep px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviar link de redefinição"}
      </button>
    </form>
  );
}
