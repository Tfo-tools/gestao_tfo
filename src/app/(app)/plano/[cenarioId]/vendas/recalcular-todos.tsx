"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recalcularSimulacao } from "@/app/(app)/produtos/[id]/simulacao-actions";

type Resultado = { nome: string; erro: string | null };

/** Um botão só recalcula a projeção dos N produtos do cenário. Não para no primeiro erro: se um
 * produto falha, os outros continuam e a tela mostra qual falhou — antes o loop abortava em
 * silêncio e deixava parte dos produtos com a projeção antiga, sem ninguém perceber. */
export function RecalcularTodos({
  cenarioId,
  produtos,
}: {
  cenarioId: string;
  produtos: { id: string; nome: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const router = useRouter();

  const falhas = resultados.filter((r) => r.erro);
  const sucessos = resultados.filter((r) => !r.erro);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setResultados([]);
            const parciais: Resultado[] = [];
            for (const produto of produtos) {
              const r = await recalcularSimulacao(produto.id, cenarioId);
              parciais.push({ nome: produto.nome, erro: r.error });
            }
            setResultados(parciais);
            router.refresh();
          })
        }
        className="whitespace-nowrap rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-medium text-primary-deep disabled:opacity-60"
      >
        {isPending ? "Recalculando…" : "↻ Recalcular projeção"}
      </button>

      {!isPending && resultados.length > 0 && (
        <div className="text-right">
          {sucessos.length > 0 && (
            <p className="text-[11px] text-success">
              {sucessos.length} de {resultados.length} atualizado(s).
            </p>
          )}
          {falhas.map((f) => (
            <p key={f.nome} className="text-[11px] text-danger">
              {f.nome}: {f.erro}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
