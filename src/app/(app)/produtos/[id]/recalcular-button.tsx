"use client";

import { useState, useTransition } from "react";
import { recalcularSimulacao } from "./simulacao-actions";

export function RecalcularButton({ produtoId, cenarioId }: { produtoId: string; cenarioId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setOk(false);
            const result = await recalcularSimulacao(produtoId, cenarioId);
            if (result.error) setError(result.error);
            else setOk(true);
          })
        }
        className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-medium text-primary-deep disabled:opacity-60"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        {isPending ? "Calculando…" : "Recalcular projeção"}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
      {ok && <span className="text-[11px] text-success">Projeção atualizada.</span>}
    </div>
  );
}
