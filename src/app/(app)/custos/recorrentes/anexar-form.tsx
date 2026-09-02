"use client";

import { useActionState } from "react";
import { anexarComprovantePendente, type AnexoFormState } from "./actions";

const initialState: AnexoFormState = { error: null };

export function AnexarForm({ despesaId }: { despesaId: string }) {
  const [state, formAction, pending] = useActionState(anexarComprovantePendente, initialState);

  if (state.success) {
    return <span className="text-[11.5px] font-medium text-success">Comprovante anexado ✓</span>;
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="despesa_id" value={despesaId} />
      <input
        name="comprovante"
        type="file"
        accept="image/*,application/pdf"
        required
        className="max-w-[220px] text-[11px] file:mr-2 file:rounded file:border-0 file:bg-bg file:px-2 file:py-1 file:text-[11px]"
      />
      <button
        type="submit"
        disabled={pending}
        className="whitespace-nowrap rounded-lg bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Anexar"}
      </button>
      {state.error && <span className="text-[11px] text-danger">{state.error}</span>}
    </form>
  );
}
