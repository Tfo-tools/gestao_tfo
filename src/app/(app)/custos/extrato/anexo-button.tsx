"use client";

import { useState, useTransition } from "react";
import { getSignedUrl, trocarTipoAnexo, excluirAnexo } from "../actions";

const LABEL_TIPO: Record<string, string> = {
  fatura: "Fatura",
  comprovante_pagamento: "Comprovante",
  documento: "Documento",
};

/**
 * Botão do arquivo anexado (abre pra ver) + duas ações rápidas de correção, quando `editavel`: um
 * seletor pra reclassificar o tipo (cobre trocar Fatura ↔ Comprovante e também corrigir um
 * "Documento" genérico — uploads antigos da extinta tela de pendentes de Recorrentes não
 * diferenciavam) e "×" pra excluir, sem precisar reabrir o formulário inteiro.
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
  const tipoConhecido = tipo === "fatura" || tipo === "comprovante_pagamento" ? tipo : "";

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
      {podeCorrigir && (
        <select
          disabled={pending}
          value={tipoConhecido}
          title="Corrigir o tipo desse arquivo — acontece de subir no campo errado, ou de vir de um upload antigo sem diferenciar"
          onChange={(e) => {
            const novoTipo = e.target.value;
            startTransition(async () => {
              setErro(null);
              const r = await trocarTipoAnexo(id!, novoTipo);
              if (r.error) setErro(r.error);
            });
          }}
          className="rounded border-none bg-transparent text-[11px] text-text-faint hover:text-primary-deep disabled:opacity-50"
        >
          <option value="" disabled>
            ⇄ corrigir
          </option>
          <option value="fatura">Fatura</option>
          <option value="comprovante_pagamento">Comprovante</option>
        </select>
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
