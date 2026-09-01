"use client";

import { useActionState, useState } from "react";
import { salvarFase, type ActionState } from "../actions";
import { EquipeAlocada } from "./equipe-alocada";

type Fase = {
  data_inicio: string | null;
  data_fim: string | null;
  taxa_crescimento_mensal: number | null;
  taxa_churn_mensal: number | null;
  investimento_ms_mensal: number | null;
  observacoes: string | null;
} | null;

type Beta = {
  quantidade: number;
  duracao_dias: number | null;
  tipo: string;
  bonificacao_meses: number | null;
  sem_custo_adicional: boolean;
} | null;

type Alocacao = {
  id: string;
  cargo: string;
  categoria: string;
  quantidade_funcionarios: number;
  horas_mes: number;
  custo_hora: number;
};

const initialState: ActionState = { error: null };

export function FaseCard({
  produtoId,
  cenarioId,
  fase,
  label,
  ordem,
  dados,
  beta,
  alocacoes,
  defaultOpen = false,
}: {
  produtoId: string;
  cenarioId: string;
  fase: string;
  label: string;
  ordem: number;
  dados: Fase;
  beta: Beta;
  alocacoes: Alocacao[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, formAction, pending] = useActionState(salvarFase, initialState);

  const preenchida = Boolean(dados?.data_inicio || dados?.data_fim);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4.5 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className={`h-2 w-2 rounded-full ${preenchida ? "bg-primary-fill" : "bg-border"}`}
          />
          <span className="text-[13px] font-semibold">
            {ordem}. {label}
          </span>
          {preenchida && (
            <span className="text-[11.5px] text-text-faint">
              {dados?.data_inicio} → {dados?.data_fim || "—"}
            </span>
          )}
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-text-faint">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    );
  }

  return (
    <div className="rounded-lg border-[1.5px] border-primary-fill bg-surface px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-primary-fill" />
          <span className="font-heading text-sm font-semibold">
            {ordem}. {label}
          </span>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-text-faint">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="produto_id" value={produtoId} />
        <input type="hidden" name="cenario_id" value={cenarioId} />
        <input type="hidden" name="fase" value={fase} />

        <div className="grid grid-cols-4 gap-3">
          <Field label="Início da fase">
            <input type="date" name="data_inicio" defaultValue={dados?.data_inicio ?? ""} className="input" />
          </Field>
          <Field label="Fim da fase">
            <input type="date" name="data_fim" defaultValue={dados?.data_fim ?? ""} className="input" />
          </Field>
          <Field label="Crescimento mensal (%)">
            <input
              type="number"
              step="0.01"
              name="taxa_crescimento_mensal"
              defaultValue={dados?.taxa_crescimento_mensal != null ? (dados.taxa_crescimento_mensal * 100).toFixed(2) : ""}
              className="input"
              placeholder="16.7"
            />
          </Field>
          <Field label="Churn mensal (%)">
            <input
              type="number"
              step="0.01"
              name="taxa_churn_mensal"
              defaultValue={dados?.taxa_churn_mensal != null ? (dados.taxa_churn_mensal * 100).toFixed(2) : ""}
              className="input"
              placeholder="1.5"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Investimento M&S no período (R$/mês)">
            <input
              type="number"
              step="0.01"
              name="investimento_ms_mensal"
              defaultValue={dados?.investimento_ms_mensal ?? ""}
              className="input"
            />
          </Field>
          <Field label="Observações">
            <input type="text" name="observacoes" defaultValue={dados?.observacoes ?? ""} className="input" />
          </Field>
        </div>

        <div className="rounded-lg bg-bg px-4 py-3.5">
          <div className="mb-3 text-[11.5px] font-semibold text-text-muted">
            Beta testers (opcional, geralmente na Validação ou ao lançar melhorias)
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Quantidade">
              <input type="number" name="beta_quantidade" defaultValue={beta?.quantidade ?? ""} className="input" />
            </Field>
            <Field label="Duração (dias)">
              <input type="number" name="beta_duracao_dias" defaultValue={beta?.duracao_dias ?? ""} className="input" />
            </Field>
            <Field label="Tipo">
              <select name="beta_tipo" defaultValue={beta?.tipo ?? "mvp_inicial"} className="input">
                <option value="mvp_inicial">MVP inicial</option>
                <option value="melhoria">Melhoria</option>
              </select>
            </Field>
            <Field label="Bonificação (meses grátis)">
              <input type="number" name="beta_bonificacao_meses" defaultValue={beta?.bonificacao_meses ?? ""} className="input" />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              name="beta_sem_custo"
              defaultChecked={beta?.sem_custo_adicional ?? true}
              className="h-4 w-4 rounded border-border"
            />
            Sem custo adicional na assinatura durante o beta
          </label>
        </div>

        {state.error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
        )}
        {state.success && (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">Fase salva.</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar fase"}
        </button>
      </form>

      <div className="mt-4">
        <EquipeAlocada produtoId={produtoId} cenarioId={cenarioId} fase={fase} alocacoes={alocacoes} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  );
}
