"use client";

import { useActionState, useEffect, useState } from "react";
import { criarPrograma, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

export function NovoProgramaForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(criarPrograma, initialState);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Novo programa
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-primary-fill bg-surface p-6">
      <h2 className="mb-4 font-heading text-sm font-semibold">Novo programa</h2>
      <form action={formAction} className="flex flex-col gap-3.5">
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Nome</label>
          <input name="nome" type="text" required className="input" placeholder="Ex: Centelha III — Fapes" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Tipo</label>
            <select name="tipo" required defaultValue="" className="input">
              <option value="" disabled>
                Selecione…
              </option>
              <option value="fomento">Fomento</option>
              <option value="investimento">Investimento</option>
              <option value="mutuo">Mútuo conversível</option>
              <option value="emprestimo">Empréstimo</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Assinatura prevista</label>
            <input name="data_assinatura_prevista" type="date" className="input" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Valor total</label>
            <input name="valor_total" type="number" step="0.01" required className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Subvenção</label>
            <input name="valor_subvencao" type="number" step="0.01" className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Contrapartida</label>
            <input name="valor_contrapartida" type="number" step="0.01" className="input" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Observações</label>
          <input name="observacoes" type="text" className="input" />
        </div>

        {state.error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
        )}

        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Criando…" : "Criar programa"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-muted"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
