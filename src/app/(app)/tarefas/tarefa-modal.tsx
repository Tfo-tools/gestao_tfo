"use client";

import { useEffect } from "react";
import { TarefaCard, type DadosFormulario } from "./tarefa-card";
import type { TarefaNo } from "./tipos";

/**
 * A tarefa completa numa janela por cima da tela (pop-up): a mesma caixinha da lista, já aberta,
 * com subtarefas, observações, anexos e edição. Esc ou clicar fora fecha. Abre pelo ⤢ do card,
 * pelo ⤢ da grade de projeto e ao chegar por link direto (?tarefa=id).
 */
export function TarefaModal({ no, dados, dependeDe, aoFechar }: { no: TarefaNo; dados: DadosFormulario; dependeDe: Map<string, string[]>; aoFechar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = overflow;
    };
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()} role="dialog" aria-modal="true" aria-label={no.titulo}>
      <div className="mt-4 w-full max-w-[760px] rounded-xl bg-bg p-2 shadow-2xl sm:p-3">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="text-[10.5px] text-text-faint">Tarefa completa · Esc fecha</span>
          <button type="button" onClick={aoFechar} title="Fechar" aria-label="Fechar" className="rounded px-2 text-[16px] leading-none text-text-faint hover:bg-surface hover:text-danger">
            ×
          </button>
        </div>
        <TarefaCard no={no} dados={dados} dependeDe={dependeDe} mostrarFase mostrarProjeto destaque emModal />
      </div>
    </div>
  );
}
