"use client";

import { useActionState, useRef, useState } from "react";
import { criarMembroEquipe, type EquipeFormState } from "./actions";
import { AlocacoesEditor } from "./alocacoes-editor";

type Regime = { id: string; nome: string; aliquota_total_efetiva: number };
type Produto = { id: string; nome: string };

const initialState: EquipeFormState = { error: null };

export function EquipeForm({ regimes, produtos }: { regimes: Regime[]; produtos: Produto[] }) {
  const [state, formAction, pending] = useActionState(criarMembroEquipe, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<"clt" | "pj">("pj");
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-[14.5px] font-semibold">Nova contratação</h2>
      <p className="mb-4 text-[11.5px] text-text-muted">
        No início da operação, o padrão é PJ por horas dedicadas — CLT costuma só fazer sentido depois de uns 2 anos de operação com
        venda, mas a estrutura já está pronta pra quando chegar a hora.
      </p>
      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
          setFormKey((k) => k + 1);
        }}
        className="flex flex-col gap-3.5"
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTipo("pj")}
            className={`flex-1 rounded-lg border px-3 py-2 text-[12.5px] font-medium ${
              tipo === "pj" ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border text-text-muted"
            }`}
          >
            PJ — horas dedicadas
          </button>
          <button
            type="button"
            onClick={() => setTipo("clt")}
            className={`flex-1 rounded-lg border px-3 py-2 text-[12.5px] font-medium ${
              tipo === "clt" ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border text-text-muted"
            }`}
          >
            CLT
          </button>
        </div>
        <input type="hidden" name="tipo_contratacao" value={tipo} />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome">
            <input name="nome" type="text" required className="input" placeholder="Ex: João Silva" />
          </Field>
          <Field label="Início">
            <input name="data_inicio" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="input" />
          </Field>
        </div>

        {tipo === "pj" ? (
          <Field label="Valor da hora (R$)">
            <input name="valor_hora" type="number" step="0.01" min="0" required className="input" placeholder="0,00" />
          </Field>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Salário bruto">
                <input name="salario_bruto" type="number" step="0.01" min="0" required className="input" placeholder="0,00" />
              </Field>
              <Field label="Regime tributário">
                <select name="regime_id" required className="input">
                  <option value="">Selecione…</option>
                  {regimes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Benefícios mensais (VT, VR/VA, plano de saúde… opcional)">
              <input name="beneficios_mensal" type="number" step="0.01" min="0" defaultValue={0} className="input" placeholder="0,00" />
            </Field>
          </>
        )}

        <Field label="Onde essa pessoa se dedica?">
          <AlocacoesEditor key={formKey} name="alocacoes" produtos={produtos} />
        </Field>

        <Field label="Observações (opcional)">
          <input name="observacoes" type="text" className="input" />
        </Field>

        {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>}
        {state.success && <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">Contratação registrada.</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Registrar contratação"}
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
