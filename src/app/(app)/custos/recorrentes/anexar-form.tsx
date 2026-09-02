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
      <div className="flex items-center gap-2">
        {anexos.map((a, i) => (
          <AnexoButton key={i} path={a.caminho_arquivo} tipo={a.tipo} />
        ))}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="despesa_id" value={despesaId} />
      {anexos.length > 0 &&
        anexos.map((a, i) => <AnexoButton key={i} path={a.caminho_arquivo} tipo={a.tipo} />)}
      <select name="pagador" defaultValue={pagadorAtual ?? ""} className="input w-[110px] text-[11px]">
        <option value="">Quem pagou?</option>
        {pagadores.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value="Empresa">Empresa</option>
      </select>
      {!temFatura && (
        <label className="flex items-center gap-1 text-[11px]">
          Fatura
          <input
            name="fatura"
            type="file"
            accept="image/*,application/pdf"
            className="w-[110px] text-[11px] file:mr-1 file:rounded file:border-0 file:bg-bg file:px-1.5 file:py-1 file:text-[10.5px]"
          />
        </label>
      )}
      {!temComprovante && (
        <label className="flex items-center gap-1 text-[11px]">
          Comprovante
          <input
            name="comprovante_pagamento"
            type="file"
            accept="image/*,application/pdf"
            className="w-[110px] text-[11px] file:mr-1 file:rounded file:border-0 file:bg-bg file:px-1.5 file:py-1 file:text-[10.5px]"
          />
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="whitespace-nowrap rounded-lg bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Anexar"}
      </button>
      {state.success && <span className="text-[11px] font-medium text-success">✓</span>}
      {state.error && <span className="w-full text-[11px] text-danger">{state.error}</span>}
    </form>
  );
}
