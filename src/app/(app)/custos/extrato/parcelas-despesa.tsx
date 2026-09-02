"use client";

import { useActionState, useRef, useTransition } from "react";
import { criarParcelaDespesa, excluirParcelaDespesa, marcarParcelaPaga, type ParcelaFormState } from "../actions";

export type Parcela = {
  id: string;
  numero_parcela: number;
  valor: number;
  data_prevista: string;
  pagador: string | null;
  status: string;
  paga_em: string | null;
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

const initialState: ParcelaFormState = { error: null };

export function ParcelasDespesa({
  despesaId,
  valorTotalDespesa,
  parcelas,
  pagadores,
}: {
  despesaId: string;
  valorTotalDespesa: number;
  parcelas: Parcela[];
  pagadores: string[];
}) {
  const [state, formAction, pending] = useActionState(criarParcelaDespesa, initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const somaParcelas = parcelas.reduce((s, p) => s + Number(p.valor), 0);
  const proximoNumero = parcelas.length > 0 ? Math.max(...parcelas.map((p) => p.numero_parcela)) + 1 : 1;

  return (
    <div className="w-full rounded-lg border border-border-soft bg-bg p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11.5px] font-semibold text-text-muted">
          Rateio parcelado entre sócias — o valor total ({formatBRL(valorTotalDespesa)}) já conta inteiro no resultado; isso aqui é só
          o cronograma de quem paga cada parcela.
        </span>
      </div>

      {parcelas.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5">
          {parcelas
            .slice()
            .sort((a, b) => a.numero_parcela - b.numero_parcela)
            .map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border-soft bg-surface px-3 py-2">
                <span className="text-[12px]">
                  <span className="font-semibold">{p.numero_parcela}ª</span>
                  <span className="ml-2 font-mono">{formatBRL(Number(p.valor))}</span>
                  <span className="ml-2 text-text-faint">vence {formatDate(p.data_prevista)}</span>
                  {p.pagador && <span className="ml-2 text-text-faint">· {p.pagador}</span>}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                      p.status === "paga" ? "bg-success-soft text-success" : "bg-bg text-text-faint"
                    }`}
                  >
                    {p.status === "paga" ? `Paga${p.paga_em ? ` em ${formatDate(p.paga_em)}` : ""}` : "Prevista"}
                  </span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(() => marcarParcelaPaga(p.id, p.status !== "paga", p.pagador))
                    }
                    className="text-[11px] font-medium text-primary-deep"
                  >
                    {p.status === "paga" ? "Desmarcar" : "Marcar paga"}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => startTransition(() => excluirParcelaDespesa(p.id))}
                    className="text-[11px] text-danger"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          <div className={`text-right text-[11px] font-medium ${somaParcelas === valorTotalDespesa ? "text-success" : "text-text-faint"}`}>
            {formatBRL(somaParcelas)} de {formatBRL(valorTotalDespesa)} parcelados
          </div>
        </div>
      )}

      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="despesa_id" value={despesaId} />
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Nº</label>
          <input name="numero_parcela" type="number" min="1" defaultValue={proximoNumero} className="input w-[60px]" required />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Valor</label>
          <input name="valor" type="number" step="0.01" min="0" className="input w-[110px]" required />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Vencimento previsto</label>
          <input name="data_prevista" type="date" className="input w-[145px]" required />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Quem vai pagar</label>
          <select name="pagador" className="input w-[120px]">
            <option value="">A definir</option>
            {pagadores.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
        >
          {pending ? "…" : "+ Parcela"}
        </button>
        {state.error && <p className="w-full text-[11px] text-danger">{state.error}</p>}
      </form>
    </div>
  );
}
