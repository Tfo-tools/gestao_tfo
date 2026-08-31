"use client";

import { useActionState, useEffect, useState } from "react";
import { criarProduto, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

export function NovoProdutoForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(criarProduto, initialState);

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
        Adicionar produto
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-primary-fill bg-surface p-6">
      <h2 className="mb-4 font-heading text-sm font-semibold">Novo produto</h2>
      <form action={formAction} className="flex flex-col gap-3.5">
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Nome</label>
          <input name="nome" type="text" required className="input" placeholder="Ex: Fashion Trend" />
        </div>
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Descrição</label>
          <input name="descricao" type="text" className="input" placeholder="O que esse produto faz" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">
              Início do desenvolvimento
            </label>
            <input name="data_inicio_desenvolvimento" type="date" className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">
              Lançamento estimado
            </label>
            <input name="data_lancamento_estimada" type="date" className="input" />
          </div>
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
            {pending ? "Criando…" : "Criar produto"}
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
