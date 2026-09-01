"use client";

import { useActionState, useRef } from "react";
import { criarComboProduto, type ActionState } from "./actions";

type Produto = { id: string; nome: string };

const initialState: ActionState = { error: null };

export function ComboProdutoForm({ produtos }: { produtos: Produto[] }) {
  const [state, formAction, pending] = useActionState(criarComboProduto, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 font-heading text-[13px] font-semibold">Novo combo</h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Combo específico entre produtos escolhidos, com seu próprio desconto — não depende de quantos produtos existem no total
      </p>
      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-2.5"
      >
        <input name="nome" placeholder="Nome do combo (ex: Fashion Price + Fashion Skills)" className="input" required />
        <input name="desconto_pct" type="number" step="0.01" placeholder="Desconto (%) ex: 20" className="input" required />

        <div>
          <p className="mb-1.5 text-[11px] font-medium text-text-muted">Produtos no combo</p>
          <div className="flex flex-col gap-1.5">
            {produtos.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" name="produto_ids" value={p.id} className="h-4 w-4 rounded border-border" />
                {p.nome}
              </label>
            ))}
          </div>
        </div>

        <input name="observacoes" type="text" placeholder="Observações (opcional)" className="input" />

        {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar combo"}
        </button>
      </form>
    </div>
  );
}
