"use client";

import { useActionState, useRef } from "react";
import { criarTarefa, type TarefaFormState } from "./actions";

type Pessoa = { id: string; nome: string };
type Produto = { id: string; nome: string };

const initialState: TarefaFormState = { error: null };

export function TarefaForm({ pessoas, produtos }: { pessoas: Pessoa[]; produtos: Produto[] }) {
  const [state, formAction, pending] = useActionState(criarTarefa, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-[10.5px] text-text-faint">Nova tarefa</label>
          <input name="titulo" type="text" placeholder="Ex: Enviar proposta pro edital X" required className="input w-full" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Responsável</label>
          <select name="responsavel_id" className="input w-[130px]">
            <option value="">—</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Prazo</label>
          <input name="prazo" type="date" className="input w-[140px]" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Produto</label>
          <select name="produto_id" className="input w-[130px]">
            <option value="">—</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Área</label>
          <input name="area" type="text" placeholder="opcional" className="input w-[110px]" />
        </div>
        <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-60">
          {pending ? "…" : "+ Adicionar"}
        </button>
        {state.error && <p className="w-full text-[11px] text-danger">{state.error}</p>}
      </form>
    </div>
  );
}
