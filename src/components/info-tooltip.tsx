"use client";

import { useState } from "react";

/** `posicao="baixo"` é pra quando o "?" fica dentro de um container com rolagem: aberto pra cima,
 *  o balão some atrás da borda do container. */
export function InfoTooltip({ texto, posicao = "cima" }: { texto: string; posicao?: "cima" | "baixo" }) {
  const [aberto, setAberto] = useState(false);

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        tabIndex={-1}
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        onClick={(e) => {
          e.preventDefault();
          setAberto((v) => !v);
        }}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-primary-fill text-[9px] font-semibold text-primary-deep hover:bg-primary-soft"
      >
        ?
      </button>
      {aberto && (
        <span
          className={`pointer-events-none absolute left-1/2 z-50 w-56 -translate-x-1/2 rounded-lg bg-wine-deep px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg ${
            posicao === "baixo" ? "top-full mt-1.5" : "bottom-full mb-1.5"
          }`}
        >
          {texto}
          <span
            className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${
              posicao === "baixo" ? "bottom-full border-b-wine-deep" : "top-full border-t-wine-deep"
            }`}
          />
        </span>
      )}
    </span>
  );
}
