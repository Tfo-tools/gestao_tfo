"use client";

import { useActionState, useState } from "react";
import { salvarFunil, type ActionState } from "../actions";

type Funil = {
  taxa_conversao: number | null;
  capacidade_vendedor_mes: number | null;
  span_of_control: number | null;
} | null;

type EquipeItem = { cargo: string; salario_bruto: number; regime_id: string } | undefined;
type Regime = { id: string; nome: string; aliquota_total_efetiva: number };

const initialState: ActionState = { error: null };
const CARGO_LABEL: Record<string, string> = { sdr: "SDR", vendedor: "Vendedor / AE", coordenador: "Coordenador" };

export function FaseFunilCard({
  produtoId,
  cenarioId,
  fase,
  label,
  ordem,
  funil,
  equipe,
  regimes,
  defaultOpen = false,
}: {
  produtoId: string;
  cenarioId: string;
  fase: string;
  label: string;
  ordem: number;
  funil: Funil;
  equipe: Record<string, EquipeItem>;
  regimes: Regime[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, formAction, pending] = useActionState(salvarFunil, initialState);

  const preenchida = Boolean(funil?.taxa_conversao);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4.5 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`h-2 w-2 rounded-full ${preenchida ? "bg-primary-fill" : "bg-border"}`} />
          <span className="text-[13px] font-semibold">
            {ordem}. {label}
          </span>
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

        <div className="grid grid-cols-3 gap-3">
          <Field label="Taxa de conversão (%)">
            <input
              type="number"
              step="0.01"
              name="taxa_conversao"
              defaultValue={funil?.taxa_conversao != null ? (funil.taxa_conversao * 100).toFixed(2) : ""}
              className="input"
              placeholder="20"
            />
          </Field>
          <Field label="Capacidade / vendedor / mês">
            <input
              type="number"
              name="capacidade_vendedor_mes"
              defaultValue={funil?.capacidade_vendedor_mes ?? ""}
              className="input"
              placeholder="88"
            />
          </Field>
          <Field label="Span of control">
            <input
              type="number"
              name="span_of_control"
              defaultValue={funil?.span_of_control ?? 8}
              className="input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {(["sdr", "vendedor", "coordenador"] as const).map((cargo) => (
            <CargoFields key={cargo} cargo={cargo} item={equipe[cargo]} regimes={regimes} />
          ))}
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

function CargoFields({
  cargo,
  item,
  regimes,
}: {
  cargo: "sdr" | "vendedor" | "coordenador";
  item: EquipeItem;
  regimes: Regime[];
}) {
  const [salario, setSalario] = useState(item?.salario_bruto ?? 0);
  const [regimeId, setRegimeId] = useState(item?.regime_id ?? "");

  const regime = regimes.find((r) => r.id === regimeId);
  const custoTotal = regime ? salario * (1 + Number(regime.aliquota_total_efetiva)) : null;

  return (
    <div className="rounded-lg bg-bg px-3.5 py-3.5">
      <div className="mb-2.5 text-[11.5px] font-semibold text-text-muted">{CARGO_LABEL[cargo]}</div>
      <label className="mb-1 block text-[10.5px] text-text-faint">Salário bruto CTPS</label>
      <input
        type="number"
        step="0.01"
        name={`salario_${cargo}`}
        value={salario || ""}
        onChange={(e) => setSalario(Number(e.target.value) || 0)}
        className="input mb-2"
        placeholder="0,00"
      />
      <label className="mb-1 block text-[10.5px] text-text-faint">Regime</label>
      <select
        name={`regime_${cargo}`}
        value={regimeId}
        onChange={(e) => setRegimeId(e.target.value)}
        className="input"
      >
        <option value="">Selecione…</option>
        {regimes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nome}
          </option>
        ))}
      </select>
      {custoTotal !== null && (
        <div className="mt-2 rounded bg-primary-soft px-2 py-1.5 text-[11px] font-semibold text-primary-deep">
          Custo total: R$ {custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      )}
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
