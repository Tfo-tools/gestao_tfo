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

type Funil = {
  taxa_conversao: number | null;
  capacidade_vendedor_mes: number | null;
  span_of_control: number | null;
  horas_suporte_por_cliente_mes: number | null;
} | null;

const initialState: ActionState = { error: null };

export function FaseCard({
  produtoId,
  cenarioId,
  fase,
  label,
  ordem,
  dados,
  funil,
  defaultOpen = false,
}: {
  produtoId: string;
  cenarioId: string;
  fase: string;
  label: string;
  ordem: number;
  dados: Fase;
  funil: Funil;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, formAction, pending] = useActionState(salvarFase, initialState);

  const preenchida = Boolean(dados?.data_inicio || dados?.data_fim);
  const semDataFimOk = fase === "maturidade";

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
              {dados?.data_inicio} → {dados?.data_fim || (semDataFimOk ? "em diante" : "—")}
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Início da fase">
            <input type="date" name="data_inicio" defaultValue={dados?.data_inicio ?? ""} className="input" />
          </Field>
          <Field
            label="Fim da fase"
            tooltip={semDataFimOk ? "Maturidade pode ficar sem data de fim — ela vale até o fim do horizonte simulado, enquanto o plano existir." : undefined}
          >
            <input
              type="date"
              name="data_fim"
              defaultValue={dados?.data_fim ?? ""}
              className="input"
              placeholder={semDataFimOk ? "deixe em branco" : undefined}
            />
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

        <div className="border-t border-border-soft pt-3.5">
          <div className="mb-3 text-[11px] font-semibold text-text-muted">Funil de vendas nessa fase</div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Taxa de conversão (%)"
              tooltip="De cada 100 leads (contatos/oportunidades) que entram no funil nessa fase, quantos % viram clientes pagantes."
            >
              <input
                type="number"
                step="0.01"
                name="taxa_conversao"
                defaultValue={funil?.taxa_conversao != null ? (funil.taxa_conversao * 100).toFixed(2) : ""}
                className="input"
                placeholder="20"
              />
            </Field>
            <Field
              label="Capacidade / vendedor / mês"
              tooltip="Quantos leads (oportunidades) um vendedor consegue trabalhar por mês nessa fase — usado pra calcular quantos vendedores são necessários."
            >
              <input
                type="number"
                name="capacidade_vendedor_mes"
                defaultValue={funil?.capacidade_vendedor_mes ?? ""}
                className="input"
                placeholder="88"
              />
            </Field>
            <Field
              label="Span of control"
              tooltip="Quantos vendedores um único coordenador consegue supervisionar. Usado pra calcular quando é preciso contratar mais coordenação."
            >
              <input type="number" name="span_of_control" defaultValue={funil?.span_of_control ?? 8} className="input" />
            </Field>
            <Field
              label="Horas de suporte / cliente / mês"
              tooltip="Quantas horas de suporte um cliente ativo demanda por mês, nessa fase. Multiplicado pelos clientes ativos, dá as horas de suporte necessárias — usado em Necessidade de Contratação."
            >
              <input
                type="number"
                step="0.01"
                name="horas_suporte_por_cliente_mes"
                defaultValue={funil?.horas_suporte_por_cliente_mes ?? ""}
                className="input"
                placeholder="0.5"
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
