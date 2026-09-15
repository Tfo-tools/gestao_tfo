"use client";

import { useState, useTransition } from "react";
import { getSignedUrl, trocarTipoAnexo, excluirAnexo } from "../actions";

const LABEL_TIPO: Record<string, string> = {
  fatura: "Fatura",
  comprovante_pagamento: "Comprovante",
  documento: "Documento",
};

/**
 * Botão do arquivo anexado (abre pra ver) + duas ações rápidas de correção, quando `editavel`:
 * "⇄" troca fatura ↔ comprovante (acontece de subir a NF no campo errado) e "×" exclui, sem
 * precisar reabrir o formulário inteiro.
 */
export function AnexoButton({
  path,
  tipo,
  id,
  editavel = false,
}: {
  path: string;
  tipo?: string;
  /** Necessário pra trocar tipo/excluir — sem id, o botão só abre o arquivo. */
  id?: string;
  /** Mostra os controles de trocar tipo / excluir. Desligado por padrão nas listas só de leitura. */
  editavel?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const podeCorrigir = editavel && !!id;

  return (
    <span className="inline-flex items-center gap-1">
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
      {podeCorrigir && (tipo === "fatura" || tipo === "comprovante_pagamento") && (
        <button
          type="button"
          disabled={pending}
          title={`Trocar pra ${tipo === "fatura" ? "Comprovante" : "Fatura"} — corrige quando o arquivo foi anexado no campo errado`}
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await trocarTipoAnexo(id!, tipo!);
              if (r.error) setErro(r.error);
            })
          }
          className="text-[11px] text-text-faint hover:text-primary-deep disabled:opacity-50"
        >
          ⇄
        </button>
      )}
      {podeCorrigir && (
        <button
          type="button"
          disabled={pending}
          title="Excluir este arquivo"
          onClick={() =>
            startTransition(async () => {
              if (!confirm("Excluir este arquivo anexado?")) return;
              setErro(null);
              const r = await excluirAnexo(id!, path);
              if (r.error) setErro(r.error);
            })
          }
          className="text-[11px] text-text-faint hover:text-danger disabled:opacity-50"
        >
          ×
        </button>
      )}
      {erro && <span className="text-[10px] text-danger">{erro}</span>}
    </span>
  );
}
