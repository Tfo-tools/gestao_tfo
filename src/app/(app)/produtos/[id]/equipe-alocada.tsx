"use client";

import { useActionState, useRef, useTransition } from "react";
import { criarAlocacao, excluirAlocacao, type ActionState } from "./alocacao-actions";

type Alocacao = {
  id: string;
  cargo: string;
  categoria: string;
  quantidade_funcionarios: number;
  horas_mes: number;
  custo_hora: number;
};

const initialState: ActionState = { error: null };
const CATEGORIA_LABEL: Record<string, string> = { pd: "P&D", sm: "S&M", ga: "G&A" };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function EquipeAlocada({
  produtoId,
  cenarioId,
  fase,
  alocacoes,
}: {
  produtoId: string;
  cenarioId: string;
  fase: string;
  alocacoes: Alocacao[];
}) {
  const [state, formAction, pending] = useActionState(criarAlocacao, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const custoTotalFase = alocacoes.reduce(
    (acc, a) => acc + a.quantidade_funcionarios * a.horas_mes * a.custo_hora,
    0,
  );

  return (
    <div className="rounded-lg bg-bg px-4 py-3.5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11.5px] font-semibold text-text-muted">
          Equipe alocada nesta fase (rateio por horas)
        </div>
        {custoTotalFase > 0 && (
          <span className="font-mono text-[12px] font-semibold text-primary-deep">
            {formatBRL(custoTotalFase)}/mês
          </span>
        )}
      </div>

      {alocacoes.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5">
          {alocacoes.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md border border-border-soft bg-surface px-2.5 py-2"
            >
              <div className="text-[12px]">
                <span className="font-medium">{a.cargo}</span>
                <span className="ml-1.5 rounded bg-primary-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-primary-deep">
                  {CATEGORIA_LABEL[a.categoria] ?? a.categoria}
                </span>
                <span className="ml-2 text-text-faint">
                  {a.quantidade_funcionarios} pessoa(s) × {a.horas_mes}h/mês × {formatBRL(a.custo_hora)}/h
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-semibold">
                  {formatBRL(a.quantidade_funcionarios * a.horas_mes * a.custo_hora)}
                </span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => excluirAlocacao(a.id, produtoId))}
                  className="text-[11px] text-danger"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="produto_id" value={produtoId} />
        <input type="hidden" name="cenario_id" value={cenarioId} />
        <input type="hidden" name="fase" value={fase} />

        <input name="cargo" type="text" placeholder="Cargo (ex: Dev Backend)" className="input min-w-[130px] flex-1" required />
        <select
          name="categoria"
          defaultValue="pd"
          className="input w-[90px]"
          title="P&D = Pesquisa e Desenvolvimento (equipe de produto/tech) · S&M = Vendas e Marketing · G&A = Geral e Administrativo"
        >
          <option value="pd">P&amp;D</option>
          <option value="sm">S&amp;M</option>
          <option value="ga">G&amp;A</option>
        </select>
        <input name="quantidade_funcionarios" type="number" step="0.5" min="0" placeholder="Pessoas" className="input w-[85px]" required />
        <input name="horas_mes" type="number" step="1" min="0" placeholder="Horas/mês" className="input w-[95px]" required />
        <input name="custo_hora" type="number" step="0.01" min="0" placeholder="R$/hora" className="input w-[95px]" required />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
        >
          {pending ? "…" : "+ Adicionar"}
        </button>
      </form>
      {state.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}
