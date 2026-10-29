"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirViagem } from "../actions";

export function ExcluirViagem({ id, titulo }: { id: string; titulo: string }) {
  const router = useRouter();
  const [excluindo, start] = useTransition();
  return (
    <button
      type="button"
      disabled={excluindo}
      onClick={() => {
        if (!confirm(`Excluir a viagem "${titulo}"? Isso remove o itinerário e os e-tickets dela. Não dá pra desfazer.`)) return;
        start(async () => {
          const r = await excluirViagem(id);
          if (r.error) {
            alert(r.error);
            return;
          }
          router.push("/viagens");
          router.refresh();
        });
      }}
      className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[11.5px] font-medium text-danger disabled:opacity-50"
    >
      {excluindo ? "Excluindo…" : "Excluir viagem"}
    </button>
  );
}
