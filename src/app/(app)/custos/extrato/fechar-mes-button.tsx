"use client";

import { useState, useTransition } from "react";
import { fecharMes, reabrirMes } from "../actions";

export function FecharMesButton({ mes, fechado }: { mes: string; fechado: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {erro && <span className="text-[11px] text-danger">{erro}</span>}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!fechado && !confirm(`Fechar ${mes}? Nenhum lançamento desse mês poderá ser editado ou excluído até reabrir.`)) return;
          startTransition(async () => {
            setErro(null);
            const result = fechado ? await reabrirMes(mes) : await fecharMes(mes);
            if (result.error) setErro(result.error);
          });
        }}
        className={`rounded-lg px-3.5 py-2 text-[12px] font-medium ${
          fechado ? "border border-border text-text-muted" : "bg-wine-deep text-white"
        } disabled:opacity-60`}
      >
        {isPending ? "…" : fechado ? "🔒 Mês fechado — Reabrir" : "Fechar mês"}
      </button>
    </div>
  );
}
