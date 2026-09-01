"use client";

import { useActionState, useRef, useTransition } from "react";
import { criarAlocacaoInvestimento, excluirAlocacaoInvestimento, type ActionState } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";

type Item = { id: string; categoria: string; percentual: number; observacoes: string | null };

const initialState: ActionState = { error: null };

export function AlocacaoInvestimento({ cenarioId, itens, nomeCenario }: { cenarioId: string; itens: Item[]; nomeCenario: string }) {
  const [state, formAction, pending] = useActionState(criarAlocacaoInvestimento, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const somaPct = itens.reduce((acc, i) => acc + Number(i.percentual), 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 flex items-center font-heading text-[13px] font-semibold">
        Destinação do investimento — {nomeCenario}
        <InfoTooltip texto="Como o capital captado (fomento/investimento) será usado neste cenário — útil para a prestação de contas e para explicar a investidores onde o dinheiro será aplicado." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">Defina livremente as categorias e o % de destinação</p>

      <div className="mb-3 flex flex-col gap-1.5">
        {itens.length === 0 && <p className="text-[12px] text-text-faint">Nenhuma destinação definida ainda.</p>}
        {itens.map((i) => (
          <div key={i.id} className="rounded-md border border-border-soft px-2.5 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium">{i.categoria}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-semibold text-primary-deep">{i.percentual}%</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => excluirAlocacaoInvestimento(i.id))}
                  className="text-[11px] text-danger"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg">
              <div className="h-full rounded-full bg-primary-fill" style={{ width: `${Math.min(100, i.percentual)}%` }} />
            </div>
            {i.observacoes && <p className="mt-1 text-[10.5px] text-text-faint">{i.observacoes}</p>}
          </div>
        ))}
        {itens.length > 0 && (
          <div className={`text-right text-[11px] font-medium ${somaPct === 100 ? "text-success" : "text-danger"}`}>
            Total: {somaPct}% {somaPct !== 100 && "(ideal somar 100%)"}
          </div>
        )}
      </div>

      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
        }}
        className="flex flex-wrap items-end gap-2 border-t border-border-soft pt-3"
      >
        <input type="hidden" name="cenario_id" value={cenarioId} />
        <input name="categoria" placeholder="Categoria (ex: Marketing)" className="input min-w-[120px] flex-1" required />
        <input name="percentual" type="number" step="1" min="0" max="100" placeholder="%" className="input w-[70px]" required />
        <input name="observacoes" placeholder="Obs. (opcional)" className="input min-w-[120px] flex-1" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
        >
          {pending ? "…" : "+ Adicionar"}
        </button>
      </form>
      {state.error && <p className="mt-1 text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}
