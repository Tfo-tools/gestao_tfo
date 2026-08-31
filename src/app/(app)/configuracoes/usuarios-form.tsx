"use client";

import { useActionState, useRef } from "react";
import { convidarUsuario, type ConvidarState } from "./actions";

const initialState: ConvidarState = { error: null };

export function UsuariosForm() {
  const [state, formAction, pending] = useActionState(convidarUsuario, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-sm font-semibold">Convidar usuária</h2>
      <p className="mb-4 text-[12px] text-text-muted">
        Ela recebe um e-mail para definir a senha e acessar o painel.
      </p>
      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-[160px] flex-1">
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Nome</label>
          <input name="nome" type="text" className="input" placeholder="Rayssa" />
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">
            E-mail (@thefashionoffice.online)
          </label>
          <input name="email" type="email" required className="input" placeholder="rayssa@thefashionoffice.online" />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Enviando…" : "Enviar convite"}
        </button>
      </form>
      {state.error && (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
      )}
      {state.success && (
        <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
          Convite enviado.
        </p>
      )}
    </div>
  );
}
