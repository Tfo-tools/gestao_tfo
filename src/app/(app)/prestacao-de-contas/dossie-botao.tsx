"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Ícone (acima dos cards) que abre o dossiê de prestação como uma sobreposição — a tela consolidada
 * de comprovação, pra sócia ou pro prestador olhar tudo numa vez. Não é aba: é consulta sob demanda.
 */
export function DossieBotao({ pendencias, children }: { pendencias?: number; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Abrir o dossiê de comprovação (consolidado por rúbrica)"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-wine/40 bg-wine-soft/40 px-3 py-1.5 text-[12px] font-medium text-wine-deep hover:bg-wine-soft"
      >
        <span aria-hidden>📋</span> Dossiê
        {pendencias && pendencias > 0 ? <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{pendencias}</span> : null}
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6" onClick={() => setAberto(false)}>
          <div className="my-4 w-full max-w-4xl rounded-2xl bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between gap-3 rounded-t-2xl border-b border-border bg-surface px-5 py-3.5">
              <div>
                <h2 className="font-heading text-[15px] font-semibold">Dossiê de prestação — documentos por rúbrica</h2>
                <p className="text-[11px] text-text-muted">Consolidado da comprovação. É pra cá que o prestador é direcionado.</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} className="rounded-md px-2 py-1 text-[18px] leading-none text-text-muted hover:bg-bg">✕</button>
            </div>
            <div className="px-5 py-4">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
