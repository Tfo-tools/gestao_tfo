"use client";

import { useActionState, useRef, useTransition } from "react";
import { salvarTierCombo, excluirTierCombo, type ActionState } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";

type Tier = { id: string; quantidade_produtos: number; desconto_pct: number; observacoes: string | null };

const initialState: ActionState = { error: null };

export function TiersCombo({ tiers }: { tiers: Tier[] }) {
  const [state, formAction, pending] = useActionState(salvarTierCombo, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 flex items-center font-heading text-[13px] font-semibold">
        Pacotes de desconto
        <InfoTooltip texto="Regra comercial válida para qualquer combinação de produtos: quando o cliente assina N produtos ao mesmo tempo, aplica-se este desconto sobre a soma dos preços. Ex: 2 produtos = 20% off, 3 produtos = 30% off." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Desconto aplicado sobre a soma dos preços quando o cliente assina múltiplos produtos juntos
      </p>

      <div className="mb-4 flex flex-col gap-2">
        {tiers.length === 0 && <p className="text-[12px] text-text-faint">Nenhum pacote cadastrado ainda.</p>}
        {tiers
          .slice()
          .sort((a, b) => a.quantidade_produtos - b.quantidade_produtos)
          .map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-border-soft px-3 py-2.5">
              <div>
                <div className="text-[12.5px] font-semibold">{t.quantidade_produtos} produtos</div>
                {t.observacoes && <div className="text-[10.5px] text-text-faint">{t.observacoes}</div>}
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[11.5px] font-semibold text-primary-deep">
                  -{(t.desconto_pct * 100).toFixed(0)}%
                </span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => excluirTierCombo(t.id))}
                  className="text-[11px] text-danger"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
      </div>

      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-2.5 border-t border-border-soft pt-4"
      >
        <div className="grid grid-cols-2 gap-2">
          <input
            name="quantidade_produtos"
            type="number"
            min="2"
            step="1"
            placeholder="Qtd. produtos (ex: 2)"
            className="input"
            required
          />
          <input name="desconto_pct" type="number" step="0.01" placeholder="Desconto (%) ex: 20" className="input" required />
        </div>
        <input name="observacoes" type="text" placeholder="Observações (opcional)" className="input" />

        {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
        >
          {pending ? "Salvando…" : "+ Salvar pacote"}
        </button>
      </form>
    </div>
  );
}
