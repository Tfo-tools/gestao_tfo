"use client";

import { useTransition } from "react";
import { atualizarTipoPrecificacao } from "../actions";

export function TipoPrecificacaoToggle({ produtoId, tipoAtual }: { produtoId: string; tipoAtual: string }) {
  const [isPending, startTransition] = useTransition();

  function trocar(tipo: "tempo" | "modulos") {
    if (tipo === tipoAtual) return;
    const fd = new FormData();
    fd.set("produto_id", produtoId);
    fd.set("tipo_precificacao", tipo);
    startTransition(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      atualizarTipoPrecificacao({ error: null } as any, fd);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-text-muted">Precificação:</span>
      <div className="flex gap-1 rounded-lg bg-bg p-1">
        <button
          type="button"
          disabled={isPending}
          onClick={() => trocar("tempo")}
          className={`rounded-md px-3 py-1.5 text-[11.5px] font-medium disabled:opacity-60 ${
            tipoAtual === "tempo" ? "bg-surface shadow-sm" : "text-text-muted"
          }`}
        >
          Por tempo
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => trocar("modulos")}
          className={`rounded-md px-3 py-1.5 text-[11.5px] font-medium disabled:opacity-60 ${
            tipoAtual === "modulos" ? "bg-surface shadow-sm" : "text-text-muted"
          }`}
        >
          Por módulos
        </button>
      </div>
    </div>
  );
}
