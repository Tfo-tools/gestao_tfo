"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthState } from "./actions";

const initialState: AuthState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-text-muted">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary-fill"
          placeholder="voce@thefashionoffice.online"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-text-muted">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary-fill"
          placeholder="••••••••••••"
        />
      </div>

      <Link href="/recuperar-senha" className="-mt-2 self-end text-[12px] text-primary-deep">
        Esqueci minha senha
      </Link>

      {state.error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-wine-deep px-4 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
