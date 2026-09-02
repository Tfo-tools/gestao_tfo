"use client";

import { useState, useTransition } from "react";
import { marcarParcelaPaga } from "../actions";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

export function ParcelaPendenteRow({
  id,
  descricao,
  numeroParcela,
  valor,
  dataPrevista,
  pagadorPrevisto,
  pagadores,
  atrasada,
}: {
  id: string;
  descricao: string;
  numeroParcela: number;
  valor: number;
  dataPrevista: string;
  pagadorPrevisto: string | null;
  pagadores: string[];
  atrasada: boolean;
}) {
  const [pagador, setPagador] = useState(pagadorPrevisto ?? "");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-bg px-3.5 py-3">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium">
          {descricao} — {numeroParcela}ª parcela
        </div>
        <div className={`text-[11px] ${atrasada ? "font-medium text-danger" : "text-text-muted"}`}>
          {formatBRL(valor)} · vence {formatDate(dataPrevista)}
          {atrasada && " · atrasada"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <select value={pagador} onChange={(e) => setPagador(e.target.value)} className="input w-[110px] text-[11px]">
          <option value="">Quem pagou?</option>
          {pagadores.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending || !pagador}
          onClick={() => startTransition(() => marcarParcelaPaga(id, true, pagador))}
          className="whitespace-nowrap rounded-lg bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60"
        >
          {isPending ? "…" : "Marcar paga"}
        </button>
      </div>
    </div>
  );
}
