"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recalcularCenario } from "@/app/(app)/cenarios/actions";

/** Refaz a projeção de todos os produtos do cenário — pra depois de ajustes em lote (canais,
 *  premissas, período) ou quando algum número parecer desatualizado. Não altera nenhum dado. */
export function RecalcularProjecao({ cenarioId }: { cenarioId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  return (
    <div className="flex items-center gap-2">
      {mensagem && <span className={`text-[11.5px] ${mensagem.tipo === "ok" ? "text-success" : "text-danger"}`}>{mensagem.texto}</span>}
      <button
        type="button"
        disabled={isPending}
        title="Refaz a projeção de todos os produtos com as premissas atuais. Não altera nenhum dado lançado."
        onClick={() => {
          setMensagem(null);
          startTransition(async () => {
            const r = await recalcularCenario(cenarioId);
            setMensagem(r.error ? { tipo: "erro", texto: r.error } : { tipo: "ok", texto: "Projeção recalculada." });
            router.refresh();
          });
        }}
        className="whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-primary-deep disabled:opacity-60"
      >
        {isPending ? "Recalculando…" : "↻ Recalcular projeção"}
      </button>
    </div>
  );
}
