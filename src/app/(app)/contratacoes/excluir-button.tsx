"use client";

import { useTransition } from "react";
import { excluirContratacao } from "./actions";

export function ExcluirButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => excluirContratacao(id))}
      className="text-[11px] text-danger disabled:opacity-50"
    >
      Remover
    </button>
  );
}
