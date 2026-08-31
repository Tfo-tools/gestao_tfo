"use client";

import { useState } from "react";
import { getSignedUrl } from "../actions";

export function AnexoButton({ path }: { path: string }) {
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
      className="text-[12px] font-medium text-primary-deep hover:text-wine disabled:opacity-50"
    >
      {loading ? "Abrindo…" : "Abrir comprovante"}
    </button>
  );
}
