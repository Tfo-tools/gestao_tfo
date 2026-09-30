"use client";

import { useState, type ReactNode } from "react";

/** Seção da lista (projeto, situação): cabeçalho clicável que abre/recolhe as linhas. */
export function GrupoRecolhivel({
  titulo,
  resumo,
  abertoInicial = true,
  tom = "normal",
  children,
}: {
  titulo: ReactNode;
  resumo?: ReactNode;
  abertoInicial?: boolean;
  tom?: "normal" | "atrasadas";
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  const borda = tom === "atrasadas" ? "border-danger/40" : "border-border-soft";
  const cabeca = tom === "atrasadas" ? "bg-danger-soft text-danger" : "bg-bg text-text-muted";
  return (
    <section className={`overflow-hidden rounded-lg border ${borda} bg-surface`}>
      <button type="button" onClick={() => setAberto((v) => !v)} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${cabeca}`}>
        <span className="w-3 text-[10px]">{aberto ? "▾" : "▸"}</span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold">{titulo}</span>
        {resumo && <span className="flex shrink-0 items-center gap-2 font-normal">{resumo}</span>}
      </button>
      {aberto && <div className="flex flex-col gap-1 border-t border-border-soft p-1.5">{children}</div>}
    </section>
  );
}
