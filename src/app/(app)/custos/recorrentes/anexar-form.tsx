"use client";

import { useActionState } from "react";
import { anexarComprovantePendente, type AnexoFormState } from "./actions";
import { AnexoButton } from "../extrato/anexo-button";

const initialState: AnexoFormState = { error: null };

type Anexo = { caminho_arquivo: string; tipo?: string };

export function AnexarForm({
  despesaId,
  pagadorAtual,
  pagadores,
  anexos,
}: {
  despesaId: string;
  pagadorAtual: string | null;
  pagadores: string[];
  anexos: Anexo[];
}) {
  const [state, formAction, pending] = useActionState(anexarComprovantePendente, initialState);

  const temFatura = anexos.some((a) => a.tipo === "fatura");
  const temComprovante = anexos.some((a) => a.tipo === "comprovante_pagamento");

  if (temFatura && temComprovante) {
    return (
      <div className="flex items-center gap-3">
        {anexos.map((a, i) => (
          <AnexoButton key={i} path={a.caminho_arquivo} tipo={a.tipo} />
        ))}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="despesa_id" value={despesaId} />
      {anexos.length > 0 && (
        <div className="flex items-center gap-2">
          {anexos.map((a, i) => (
            <AnexoButton key={i} path={a.caminho_arquivo} tipo={a.tipo} />
          ))}
        </div>
      )}
      <div>
        <label className="mb-1 block text-[10.5px] text-text-faint">Quem pagou</label>
        <select name="pagador" defaultValue={pagadorAtual ?? ""} className="input w-[130px]">
          <option value="">Selecione…</option>
          {pagadores.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value="Empresa">Empresa</option>
        </select>
      </div>
      {!temFatura && (
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Fatura / NF</label>
          <input
            name="fatura"
            type="file"
            accept="image/*,application/pdf"
            className="w-[210px] text-[11px] file:mr-2 file:rounded file:border-0 file:bg-bg file:px-2 file:py-1.5 file:text-[10.5px]"
          />
        </div>
      )}
      {!temComprovante && (
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Comprovante de pagamento</label>
          <input
            name="comprovante_pagamento"
            type="file"
            accept="image/*,application/pdf"
            className="w-[210px] text-[11px] file:mr-2 file:rounded file:border-0 file:bg-bg file:px-2 file:py-1.5 file:text-[10.5px]"
          />
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="whitespace-nowrap rounded-lg bg-wine-deep px-3 py-2 text-[11.5px] font-medium text-white disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Anexar"}
      </button>
      {state.success && <span className="text-[11px] font-medium text-success">✓</span>}
      {state.error && <span className="w-full text-[11px] text-danger">{state.error}</span>}
    </form>
  );
}
