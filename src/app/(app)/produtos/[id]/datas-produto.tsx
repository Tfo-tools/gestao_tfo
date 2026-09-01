"use client";

import { useActionState, useState } from "react";
import { atualizarDatasProduto, type ActionState } from "../actions";
import { InfoTooltip } from "@/components/info-tooltip";

const initialState: ActionState = { error: null };

function formatDate(iso: string | null) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "não definida";
}

export function DatasProduto({
  produtoId,
  dataInicioDesenvolvimento,
  dataLancamentoEstimada,
}: {
  produtoId: string;
  dataInicioDesenvolvimento: string | null;
  dataLancamentoEstimada: string | null;
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(atualizarDatasProduto, initialState);

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border-soft bg-bg px-3 py-2 text-left text-[11px] text-text-muted hover:border-primary-fill"
      >
        <span className="flex items-center">
          Início do desenvolvimento: <strong className="ml-1 font-medium text-text">{formatDate(dataInicioDesenvolvimento)}</strong>
        </span>
        <span className="flex items-center">
          Lançamento estimado: <strong className="ml-1 font-medium text-text">{formatDate(dataLancamentoEstimada)}</strong>
          <InfoTooltip texto="Início do desenvolvimento = mês em que a projeção mês a mês começa a contar (mês 1 da simulação). Lançamento estimado = data usada pra calcular o mês pró-rata da receita, quando o reajuste anual de preço começa a contar (1 ano depois disso) e quando módulos com gatilho 'por tempo' entram (ex: melhorias 12/24 meses depois)." />
        </span>
        <span className="ml-auto text-[10px] text-primary-deep underline">editar</span>
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-1.5 flex flex-wrap items-end gap-3 rounded-lg border border-primary-fill bg-bg px-3 py-3"
    >
      <input type="hidden" name="produto_id" value={produtoId} />
      <div>
        <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
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
        <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
          Lançamento estimado
          <InfoTooltip texto="Data em que o produto começa a vender de verdade. Usada pra 3 coisas: (1) calcular a receita pró-rata no mês exato do lançamento, (2) contar 1 ano pra começar a aplicar o reajuste anual de preço, (3) contar os meses pra ativar módulos com gatilho 'por tempo' (ex: melhorias do Fashion Mind em 12/24 meses)." />
        </label>
        <input type="date" name="data_lancamento_estimada" defaultValue={dataLancamentoEstimada ?? ""} className="input" />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar"}
      </button>
      <button
        type="button"
        onClick={() => setEditando(false)}
        className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted"
      >
        Cancelar
      </button>
      {state.error && <p className="w-full text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}
