"use client";

import { useActionState, useState } from "react";
import { criarCenario, type CenarioFormState } from "./actions";

type Cenario = { id: string; nome: string; is_base: boolean };

const initialState: CenarioFormState = { error: null };

export function NovoCenarioForm({ cenarios }: { cenarios: Cenario[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(criarCenario, initialState);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Novo cenário
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-primary-fill bg-surface p-6">
      <h2 className="mb-4 font-heading text-sm font-semibold">Novo cenário</h2>
      <form action={formAction} className="flex flex-col gap-3.5">
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Nome</label>
          <input
            name="nome"
            type="text"
            required
            className="input"
            placeholder="Ex: Com Aporte Fomento — Mar/2027"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Descrição</label>
          <input name="descricao" type="text" className="input" placeholder="O que muda nesse cenário" />
        </div>
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Espelhar cenário de</label>
          <p className="mb-1.5 text-[10.5px] text-text-faint">
            Copia produtos, custos, funil e tudo mais do cenário escolhido — o Plano base ou qualquer outro cenário (fomento,
            investimento etc.) que você já tenha criado. Ajuste só o que muda a partir daí.
          </p>
          <select name="duplicar_de" className="input">
            <option value="">Começar em branco</option>
            {cenarios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.is_base ? " (Plano base)" : ""}
              </option>
            ))}
          </select>
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
            {pending ? "Criando…" : "Criar cenário"}
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
