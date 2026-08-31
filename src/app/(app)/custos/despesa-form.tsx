"use client";

import { useActionState, useRef } from "react";
import { criarDespesa, type DespesaFormState } from "./actions";

type PlanoContas = { id: string; codigo: string; conta: string };
type Produto = { id: string; nome: string };

const initialState: DespesaFormState = { error: null };

export function DespesaForm({
  planoContas,
  produtos,
}: {
  planoContas: PlanoContas[];
  produtos: Produto[];
}) {
  const [state, formAction, pending] = useActionState(criarDespesa, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-5 font-heading text-[14.5px] font-semibold">Novo lançamento</h2>
      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-3.5"
      >
        <Field label="Data do gasto">
          <input
            name="data_gasto"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="input"
          />
        </Field>

        <Field label="Categoria (plano de contas)">
          <select name="plano_contas_id" required className="input">
            <option value="">Selecione…</option>
            {planoContas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.conta}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Produto vinculado (opcional)">
          <select name="produto_id" className="input">
            <option value="">Nenhum</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Valor total">
          <input
            name="valor_total"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="0,00"
            className="input"
          />
        </Field>

        <Field label="Descrição (opcional)">
          <input name="descricao" type="text" className="input" placeholder="Ex: campanha Meta Ads agosto" />
        </Field>

        <Field label="Comprovante (NF ou recibo)">
          <input
            name="comprovante"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="w-full rounded-lg border border-dashed border-border bg-bg px-3 py-3 text-[12.5px]"
          />
        </Field>

        <label className="flex items-center gap-2 pt-1 text-[12px]">
          <input name="comprovado" type="checkbox" className="h-4 w-4 rounded border-border" />
          Marcar como comprovado (auditado internamente)
        </label>

        {state.error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
        )}
        {state.success && (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
            Despesa lançada.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Lançar despesa"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  );
}
