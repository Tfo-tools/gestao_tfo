"use client";

import { useActionState, useRef, useTransition } from "react";
import { criarPlano, excluirPlano, type ActionState } from "../actions";

type Plano = {
  id: string;
  nome_plano: string;
  tipo_cobranca: string;
  tipo_venda: string;
  preco: number;
  desconto_pct: number | null;
  is_annual_only: boolean;
  mix_percentual: number | null;
};

const initialState: ActionState = { error: null };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PlanosPrecificacao({ produtoId, planos }: { produtoId: string; planos: Plano[] }) {
  const [state, formAction, pending] = useActionState(criarPlano, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const somaMix = planos.reduce((acc, p) => acc + Number(p.mix_percentual ?? 0), 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 font-heading text-[13px] font-semibold">Planos de precificação</h2>
      <p className="mb-4 text-[11px] text-text-muted">Não muda por cenário — é uma decisão do produto</p>

      <div className="mb-4 flex flex-col gap-2">
        {planos.length === 0 && (
          <p className="text-[12px] text-text-faint">Nenhum plano cadastrado ainda.</p>
        )}
        {planos.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-border-soft px-3 py-2.5">
            <div>
              <div className="text-[12.5px] font-semibold">{p.nome_plano}</div>
              <div className="text-[10.5px] text-text-faint">
                {p.tipo_cobranca} · {p.tipo_venda}
                {p.is_annual_only ? " · annual-only" : ""}
                {p.desconto_pct ? ` · -${p.desconto_pct}%` : ""}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {p.mix_percentual != null && (
                <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-primary-deep">
                  {p.mix_percentual}%
                </span>
              )}
              <span className="font-mono text-[13px] font-semibold">{formatBRL(Number(p.preco))}</span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => excluirPlano(p.id, produtoId))}
                className="text-[11px] text-danger"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
        {planos.length > 0 && (
          <div
            className={`text-right text-[11px] font-medium ${
              somaMix === 100 ? "text-success" : "text-danger"
            }`}
          >
            Mix total: {somaMix}% {somaMix !== 100 && "(precisa somar 100%)"}
          </div>
        )}
      </div>

      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-2.5 border-t border-border-soft pt-4"
      >
        <input type="hidden" name="produto_id" value={produtoId} />
        <input name="nome_plano" placeholder="Nome do plano (ex: Mensal)" className="input" required />
        <div className="grid grid-cols-2 gap-2">
          <select name="tipo_cobranca" className="input" required defaultValue="">
            <option value="" disabled>
              Cobrança
            </option>
            <option value="mensal">Mensal</option>
            <option value="semestral">Semestral</option>
            <option value="anual">Anual</option>
          </select>
          <select name="tipo_venda" className="input" defaultValue="individual">
            <option value="individual">Individual</option>
            <option value="pacote">Pacote</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="preco" type="number" step="0.01" placeholder="Preço (R$)" className="input" required />
          <input name="desconto_pct" type="number" step="0.01" placeholder="Desconto (%)" className="input" />
        </div>
        <div>
          <input
            name="mix_percentual"
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="% dos clientes nesse plano (ex: 60)"
            className="input"
          />
          <p className="mt-1 text-[10px] text-text-faint">
            Usado pra calcular a receita média por cliente — a soma de todos os planos deve dar 100%
          </p>
        </div>
        <label className="flex items-center gap-2 text-[11.5px]">
          <input type="checkbox" name="is_annual_only" className="h-4 w-4 rounded border-border" />
          Somente contrato anual (annual-only)
        </label>

        {state.error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
        >
          {pending ? "Adicionando…" : "+ Adicionar plano"}
        </button>
      </form>
    </div>
  );
}
