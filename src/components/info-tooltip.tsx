"use client";

import { useState } from "react";

export function InfoTooltip({ texto }: { texto: string }) {
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
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-text-faint text-[9px] font-semibold text-text-faint hover:border-primary-deep hover:text-primary-deep"
      >
        ?
      </button>
      {aberto && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-56 -translate-x-1/2 rounded-lg bg-wine-deep px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg">
          {texto}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-wine-deep" />
        </span>
      )}
    </span>
  );
}
