"use client";

import { useActionState, useRef } from "react";
import { adicionarDocumento, type DocumentoFormState } from "./actions";

const ESTADO_INICIAL: DocumentoFormState = { error: null };

export function NovoDocumentoForm() {
  const [state, formAction, pending] = useActionState(adicionarDocumento, ESTADO_INICIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-6">
      <h2 className="mb-3 font-heading text-sm font-semibold">+ Novo documento</h2>
      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Nome</label>
          <input type="text" name="nome" required placeholder="Ex: Procuração" className="input" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Arquivo (opcional)</label>
          <input type="file" name="arquivo" className="input" />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-50"
        >
          {pending ? "Adicionando…" : "Adicionar"}
        </button>
        {state.error && <span className="text-[11.5px] text-danger">{state.error}</span>}
      </form>
    </div>
  );
}
