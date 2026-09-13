"use client";

import { useState, useTransition } from "react";
import { alterarStatusProduto } from "./status-actions";
import {
  AJUDA_STATUS,
  LABEL_STATUS,
  type StatusProduto,
} from "@/lib/fases-produto";
import { InfoTooltip } from "@/components/info-tooltip";

const ORDEM: StatusProduto[] = [
  "planejado",
  "aprovado",
  "iniciado",
  "descartado",
];

const COR: Record<StatusProduto, string> = {
  planejado: "bg-bg text-text-muted border-border",
  aprovado: "bg-primary-soft text-primary-deep border-primary-fill",
  iniciado: "bg-wine-soft text-wine border-[#e6d3d9]",
  descartado: "bg-bg text-text-faint border-border-soft",
};

/** Selo de status, para as listas. */
export function SeloStatus({ status }: { status: StatusProduto }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[9.5px] font-semibold ${COR[status]}`}
    >
      {LABEL_STATUS[status].toUpperCase()}
    </span>
  );
}

/**
 * Troca o status do produto. É decisão de negócio global: não pertence a cenário nenhum.
 * O Base absorve sozinho o que está aprovado ou iniciado; os outros cenários escolhem à mão.
 */
export function StatusProdutoControle({
  produtoId,
  status,
  nome,
}: {
  produtoId: string;
  status: StatusProduto;
  nome: string;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="p-5">
      <p className="mb-3 text-[11px] text-text-muted">
        {AJUDA_STATUS[status]}
        <InfoTooltip
          texto={`Status de ${nome}: onde o produto está na decisão de negócio. Vale para o produto inteiro, não para um cenário: o Base (plano da empresa) absorve automaticamente tudo que estiver aprovado ou iniciado, e os demais cenários escolhem quais produtos simular.`}
        />
      </p>

      <div className="flex flex-wrap gap-2">
        {ORDEM.map((s) => {
          const atual = s === status;
          return (
            <button
              key={s}
              type="button"
              disabled={pending || atual}
              onClick={() =>
                startTransition(async () => {
                  const r = await alterarStatusProduto(produtoId, s);
                  setErro(r.error);
                })
              }
              title={AJUDA_STATUS[s]}
              className={`rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-100 ${
                atual
                  ? COR[s] + " font-semibold"
                  : "border-border text-text-muted hover:border-primary-fill"
              }`}
            >
              {LABEL_STATUS[s]}
            </button>
          );
        })}
      </div>

      {erro && <p className="mt-3 text-[11px] text-danger">{erro}</p>}

      {status === "iniciado" && (
        <p className="mt-3 rounded-lg border border-[#e6d3d9] bg-wine-soft px-3 py-2 text-[11px] text-wine">
          Produto iniciado: as datas das fases estão congeladas. Para
          ajustá-las, volte o status para aprovado.
        </p>
      )}
    </div>
  );
}
