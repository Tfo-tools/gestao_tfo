"use client";

import { useActionState } from "react";
import { atualizarDatasProduto, type ActionState } from "../actions";
import { InfoTooltip } from "@/components/info-tooltip";

const initialState: ActionState = { error: null };

export function DatasProduto({
  produtoId,
  dataInicioDesenvolvimento,
  dataLancamentoEstimada,
}: {
  produtoId: string;
  dataInicioDesenvolvimento: string | null;
  dataLancamentoEstimada: string | null;
}) {
  const [state, formAction, pending] = useActionState(atualizarDatasProduto, initialState);

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 font-heading text-[13px] font-semibold">Datas do produto</h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Usadas pelo cálculo da projeção — preencha aqui, não em nenhuma fase
      </p>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="produto_id" value={produtoId} />
        <div>
          <label className="mb-1 flex items-center text-[11px] font-medium text-text-muted">
            Início do desenvolvimento
            <InfoTooltip texto="Mês em que a projeção mês a mês do produto começa a contar (é o 'mês 1' da simulação). Se não preencher, o sistema usa a data de início da primeira fase cadastrada." />
          </label>
          <input
            type="date"
            name="data_inicio_desenvolvimento"
            defaultValue={dataInicioDesenvolvimento ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1 flex items-center text-[11px] font-medium text-text-muted">
            Lançamento estimado
            <InfoTooltip texto="Data em que o produto começa a vender de verdade. Usada pra 3 coisas: (1) calcular a receita pró-rata no mês exato do lançamento, (2) contar 1 ano pra começar a aplicar o reajuste anual de preço, (3) contar os meses pra ativar módulos com gatilho 'por tempo' (ex: melhorias do Fashion Mind em 12/24 meses)." />
          </label>
          <input type="date" name="data_lancamento_estimada" defaultValue={dataLancamentoEstimada ?? ""} className="input" />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-wine-deep px-4 py-2.5 text-[12.5px] font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar datas"}
        </button>
        {state.error && <p className="w-full text-[11px] text-danger">{state.error}</p>}
        {state.success && <p className="w-full text-[11px] text-success">Datas salvas.</p>}
      </form>
    </div>
  );
}
