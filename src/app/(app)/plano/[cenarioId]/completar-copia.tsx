"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completarCenarioClonado } from "@/app/(app)/cenarios/actions";

/** Pra cenário espelhado: preenche o que a cópia deixou pra trás, sem mexer no que já foi editado. */
export function CompletarCopia({ cenarioId, origemNome }: { cenarioId: string; origemNome: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-3.5">
      <p className="max-w-3xl text-[12px] text-text-muted">
        Espelhado de <span className="font-medium text-text">{origemNome}</span>. Se algo não veio igual (níveis/módulos, premissas em
        branco, canais, COGS, crescimento por trimestre), &quot;Completar cópia&quot; traz só o que falta — não altera o que você já
        editou aqui — e recalcula a projeção.
      </p>
      <div className="flex items-center gap-2">
        {mensagem && <span className={`text-[11.5px] ${mensagem.tipo === "ok" ? "text-success" : "text-danger"}`}>{mensagem.texto}</span>}
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setMensagem(null);
            startTransition(async () => {
              const r = await completarCenarioClonado(cenarioId);
              setMensagem(r.error ? { tipo: "erro", texto: r.error } : { tipo: r.aviso ? "erro" : "ok", texto: r.aviso ?? "Cópia completada e projeção recalculada." });
              router.refresh();
            });
          }}
          className="whitespace-nowrap rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-medium text-primary-deep disabled:opacity-60"
        >
          {isPending ? "Completando…" : "Completar cópia"}
        </button>
      </div>
    </div>
  );
}
