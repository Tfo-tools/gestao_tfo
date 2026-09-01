"use client";

import { useActionState, useState } from "react";
import { salvarFase, type ActionState } from "../actions";
import { InfoTooltip } from "@/components/info-tooltip";

type Fase = {
  data_inicio: string | null;
  data_fim: string | null;
  taxa_crescimento_mensal: number | null;
  taxa_churn_mensal: number | null;
  observacoes: string | null;
} | null;

type Beta = {
  quantidade: number;
  duracao_dias: number | null;
  tipo: string;
  bonificacao_meses: number | null;
  condicao_especial_pct: number | null;
  condicao_especial_meses: number | null;
} | null;

const initialState: ActionState = { error: null };

export function FaseCard({
  produtoId,
  cenarioId,
  fase,
  label,
  ordem,
  dados,
  beta,
  defaultOpen = false,
}: {
  produtoId: string;
  cenarioId: string;
  fase: string;
  label: string;
  ordem: number;
  dados: Fase;
  beta: Beta;
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
          <Field
            label="Crescimento mensal (%)"
            tooltip="A cada mês, quantos % de clientes novos essa fase deve trazer em relação à base atual. Ex: 16,7% ao mês significa que a base cresce esse percentual todo mês."
          >
            <input
              type="number"
              step="0.01"
              name="taxa_crescimento_mensal"
              defaultValue={dados?.taxa_crescimento_mensal != null ? (dados.taxa_crescimento_mensal * 100).toFixed(2) : ""}
              className="input"
              placeholder="16.7"
            />
          </Field>
          <Field
            label="Churn mensal (%)"
            tooltip="Percentual de clientes que cancelam por mês. Ex: 1,5% significa que, de cada 100 clientes, 1,5 cancela todo mês — isso reduz a base mesmo com crescimento."
          >
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

        <Field label="Observações">
          <input type="text" name="observacoes" defaultValue={dados?.observacoes ?? ""} className="input" />
        </Field>

        <div className="rounded-lg bg-bg px-4 py-3.5">
          <div className="mb-3 flex items-center text-[11.5px] font-semibold text-text-muted">
            Beta testers (opcional, geralmente na Validação ou ao lançar melhorias)
            <InfoTooltip texto="O beta tester não paga nada durante o teste + bonificação. Depois disso, converte em cliente pagante — se você definir uma condição especial abaixo, ele paga com desconto só durante o período informado; depois volta pro preço cheio normalmente." />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Quantidade">
              <input type="number" name="beta_quantidade" defaultValue={beta?.quantidade ?? ""} className="input" />
            </Field>
            <Field label="Duração do teste (dias)">
              <input type="number" name="beta_duracao_dias" defaultValue={beta?.duracao_dias ?? ""} className="input" />
            </Field>
            <Field label="Tipo">
              <select name="beta_tipo" defaultValue={beta?.tipo ?? "mvp_inicial"} className="input">
                <option value="mvp_inicial">MVP inicial</option>
                <option value="melhoria">Melhoria</option>
              </select>
            </Field>
            <Field label="Bonificação (meses grátis extra)">
              <input type="number" name="beta_bonificacao_meses" defaultValue={beta?.bonificacao_meses ?? ""} className="input" />
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field
              label="Condição especial pós-teste (% de desconto)"
              tooltip="Opcional. Desconto que o beta tester mantém por um tempo limitado depois de virar cliente pagante — uma forma comum de recompensar quem testou cedo sem dar desconto pra sempre. Deixe em branco para ele pagar o preço cheio assim que converter."
            >
              <input
                type="number"
                step="0.01"
                name="beta_condicao_especial_pct"
                defaultValue={beta?.condicao_especial_pct != null ? (beta.condicao_especial_pct * 100).toFixed(2) : ""}
                placeholder="Ex: 30"
                className="input"
              />
            </Field>
            <Field
              label="Duração da condição especial (meses)"
              tooltip="Por quantos meses, depois de converter, o beta tester paga com esse desconto — depois disso passa a pagar o preço cheio, igual aos demais clientes."
            >
              <input
                type="number"
                name="beta_condicao_especial_meses"
                defaultValue={beta?.condicao_especial_meses ?? ""}
                placeholder="Ex: 6"
                className="input"
              />
            </Field>
          </div>
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
    </div>
  );
}

function Field({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center text-[11px] font-medium text-text-muted">
        {label}
        {tooltip && <InfoTooltip texto={tooltip} />}
      </label>
      {children}
    </div>
  );
}
