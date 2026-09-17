"use client";

import { useEffect } from "react";

/**
 * Passando o mouse num card, contorna em amarelo o que ele aguarda e em azul o que ele libera.
 * Só lê os data-* dos cards (`data-tarefa`, `data-aguarda`, `data-libera`) — nada de estado.
 */
export function RealceDependencias() {
  useEffect(() => {
    const limpar = () => {
      document.querySelectorAll(".realce-aguarda, .realce-libera").forEach((el) => el.classList.remove("realce-aguarda", "realce-libera"));
    };
    const marcar = (ids: string, classe: string) => {
      for (const id of ids.split(",").filter(Boolean)) {
        document.querySelectorAll(`[data-tarefa="${id}"]`).forEach((el) => el.classList.add(classe));
      }
    };
    const onOver = (e: Event) => {
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tarefa]");
      limpar();
      if (!card) return;
      marcar(card.dataset.aguarda ?? "", "realce-aguarda");
      marcar(card.dataset.libera ?? "", "realce-libera");
    };
    document.addEventListener("mouseover", onOver);
    return () => {
      document.removeEventListener("mouseover", onOver);
      limpar();
    };
  }, []);
  return null;
}
