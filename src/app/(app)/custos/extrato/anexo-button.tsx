"use client";

import { useState } from "react";
import { getSignedUrl } from "../actions";

const LABEL_TIPO: Record<string, string> = {
  fatura: "Fatura",
  comprovante_pagamento: "Comprovante",
  documento: "Documento",
};

export function AnexoButton({ path, tipo }: { path: string; tipo?: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const url = await getSignedUrl(path);
        setLoading(false);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }}
      className="text-[11.5px] font-medium text-primary-deep hover:text-wine disabled:opacity-50"
    >
      {loading ? "…" : `📄 ${LABEL_TIPO[tipo ?? "documento"] ?? "Documento"}`}
    </button>
  );
}
