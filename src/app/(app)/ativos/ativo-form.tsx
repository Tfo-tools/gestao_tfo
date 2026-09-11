"use client";

import { useActionState, useRef } from "react";
import { criarAtivo, type AtivoFormState } from "./actions";

type PlanoContas = { id: string; codigo: string; conta: string };
type Produto = { id: string; nome: string };

const initialState: AtivoFormState = { error: null };

export function AtivoForm({ planoContas, produtos }: { planoContas: PlanoContas[]; produtos: Produto[] }) {
  const [state, formAction, pending] = useActionState(criarAtivo, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 font-heading text-[14.5px] font-semibold">Novo ativo</h2>
      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-3.5"
      >
        <Field label="Descrição">
          <input name="descricao" type="text" required className="input" placeholder="Ex: Notebook Dell, licença anual do Figma" />
        </Field>

        <Field label="Conta do plano de contas">
          <select name="plano_contas_id" required className="input">
            <option value="">Selecione…</option>
            {planoContas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.conta}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Produto (opcional — vazio = geral da empresa)">
          <select name="produto_id" className="input">
            <option value="">Geral</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor">
            <input name="valor" type="number" step="0.01" min="0" required className="input" placeholder="0,00" />
          </Field>
          <Field label="Data de aquisição">
            <input name="data_aquisicao" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="input" />
          </Field>
        </div>

        <Field label="Vida útil em meses (opcional)">
          <input name="vida_util_meses" type="number" min="1" className="input" placeholder="Ex: 60" />
        </Field>

        <Field label="Observações (opcional)">
          <input name="observacoes" type="text" className="input" />
        </Field>

        {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>}
        {state.success && <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">Ativo registrado.</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Registrar ativo"}
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
