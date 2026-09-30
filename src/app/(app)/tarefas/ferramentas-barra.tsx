"use client";

import { useState, type ReactNode } from "react";

/** Rotinas e "colar mensagem" saem da frente da lista: viram botões na barra e só aparecem
 * quando alguém clica. */
export function FerramentasBarra({ rotinas, nota, rotinasAtivas }: { rotinas: ReactNode; nota: ReactNode; rotinasAtivas: number }) {
  const [aberta, setAberta] = useState<"rotinas" | "nota" | null>(null);
  const botao = (ativo: boolean) => `rounded-lg border px-2.5 py-1 text-[11.5px] ${ativo ? "border-wine bg-wine-soft text-wine" : "border-border text-text-muted hover:border-wine"}`;
  return (
    <>
      <button type="button" onClick={() => setAberta((a) => (a === "rotinas" ? null : "rotinas"))} className={botao(aberta === "rotinas")}>
        Rotinas{rotinasAtivas > 0 ? ` · ${rotinasAtivas}` : ""}
      </button>
      <button type="button" onClick={() => setAberta((a) => (a === "nota" ? null : "nota"))} className={botao(aberta === "nota")}>
        Colar mensagem (IA)
      </button>
      {aberta === "rotinas" && <div className="basis-full">{rotinas}</div>}
      {aberta === "nota" && <div className="basis-full">{nota}</div>}
    </>
  );
}
