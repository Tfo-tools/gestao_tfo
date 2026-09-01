"use client";

import { useActionState, useRef, useTransition } from "react";
import { criarModulo, excluirModulo, type ActionState } from "../actions";
import { FASES } from "@/lib/fases";
import { InfoTooltip } from "@/components/info-tooltip";

type Modulo = {
  id: string;
  nome: string;
  preco: number;
  fase_lancamento: string;
  adesao_inicial_pct: number;
  crescimento_adesao_mensal_pct: number;
};

const initialState: ActionState = { error: null };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const FASE_LABEL: Record<string, string> = Object.fromEntries(FASES.map((f) => [f.value, f.label]));

export function ModulosProduto({ produtoId, modulos }: { produtoId: string; modulos: Modulo[] }) {
  const [state, formAction, pending] = useActionState(criarModulo, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 flex items-center font-heading text-[13px] font-semibold">
        Módulos add-on
        <InfoTooltip texto="Para produtos com combo de módulos (ex: Fashion Mind): cada módulo é vendido separadamente, com preço próprio, e é lançado numa fase específica do produto. A adesão começa num % inicial da base de clientes e cresce todo mês até saturar em 100%." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Receita adicional além dos planos — ex: integração com apps, acompanhamento de plano, campanhas, fluxo de pagamentos
      </p>

      <div className="mb-4 flex flex-col gap-2">
        {modulos.length === 0 && (
          <p className="text-[12px] text-text-faint">Nenhum módulo cadastrado ainda.</p>
        )}
        {modulos.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border border-border-soft px-3 py-2.5">
            <div>
              <div className="text-[12.5px] font-semibold">{m.nome}</div>
              <div className="text-[10.5px] text-text-faint">
                lança na {FASE_LABEL[m.fase_lancamento] ?? m.fase_lancamento} · adesão inicial{" "}
                {(m.adesao_inicial_pct * 100).toFixed(1)}% · +{(m.crescimento_adesao_mensal_pct * 100).toFixed(1)}%/mês
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[13px] font-semibold">{formatBRL(Number(m.preco))}</span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => excluirModulo(m.id, produtoId))}
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
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-2.5 border-t border-border-soft pt-4"
      >
        <input type="hidden" name="produto_id" value={produtoId} />
        <input name="nome" placeholder="Nome do módulo (ex: Fluxo de pagamentos)" className="input" required />
        <div className="grid grid-cols-2 gap-2">
          <input name="preco" type="number" step="0.01" placeholder="Preço (R$/mês)" className="input" required />
          <select name="fase_lancamento" className="input" required defaultValue="">
            <option value="" disabled>
              Fase de lançamento…
            </option>
            {FASES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
              Adesão inicial (%)
              <InfoTooltip texto="No mês em que o módulo é lançado, qual % da base de clientes (novos e atuais) já adere a ele de imediato." />
            </label>
            <input name="adesao_inicial_pct" type="number" step="0.01" placeholder="Ex: 10" className="input" />
          </div>
          <div>
            <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
              Crescimento mensal da adesão (%)
              <InfoTooltip texto="A cada mês seguinte, quanto a adesão cresce sobre o percentual atual (crescimento composto, até no máximo 100% da base)." />
            </label>
            <input name="crescimento_adesao_mensal_pct" type="number" step="0.01" placeholder="Ex: 5" className="input" />
          </div>
        </div>

        {state.error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
        >
          {pending ? "Adicionando…" : "+ Adicionar módulo"}
        </button>
      </form>
    </div>
  );
}
