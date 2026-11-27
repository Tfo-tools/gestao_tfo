"use client";

import { useState, type ReactNode } from "react";

/**
 * Abas do painel de execução: "Cronograma de atividades" (barras) e "Orçamento" (uma tabela só,
 * por rúbrica × mês, com comprovação por clique). Os cards ficam acima das abas; a ação do canto
 * (download de comprovantes) só aparece na aba Orçamento. Ambos os painéis ficam montados (um
 * escondido) pra preservar o estado ao alternar.
 */
export function PainelTabs({
  cards,
  cronograma,
  orcamento,
  documentos,
  pinCrono,
  pinOrc,
  pinDoc,
  acaoOrcamento,
}: {
  cards: ReactNode;
  cronograma: ReactNode;
  orcamento: ReactNode;
  documentos?: ReactNode;
  pinCrono?: string;
  pinOrc?: string;
  pinDoc?: string;
  acaoOrcamento?: ReactNode;
}) {
  const [aba, setAba] = useState<"crono" | "orc" | "doc">("crono");

  return (
    <div className="flex flex-col gap-5">
      {cards}

      <div className="flex items-end gap-1 overflow-x-auto border-b border-border">
        <TabBtn ativo={aba === "crono"} onClick={() => setAba("crono")} label="Cronograma de atividades" pin={pinCrono} />
        <TabBtn ativo={aba === "orc"} onClick={() => setAba("orc")} label="Orçamento" pin={pinOrc} />
        {documentos != null && <TabBtn ativo={aba === "doc"} onClick={() => setAba("doc")} label="Documentos" pin={pinDoc} />}
        <div className="flex-1" />
        {aba === "orc" && acaoOrcamento ? <div className="mb-1.5">{acaoOrcamento}</div> : null}
      </div>

      <div className={aba === "crono" ? "flex flex-col gap-2" : "hidden"}>{cronograma}</div>
      <div className={aba === "orc" ? "flex flex-col gap-2" : "hidden"}>{orcamento}</div>
      {documentos != null && <div className={aba === "doc" ? "flex flex-col gap-2" : "hidden"}>{documentos}</div>}
    </div>
  );
}

function TabBtn({ ativo, onClick, label, pin }: { ativo: boolean; onClick: () => void; label: string; pin?: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativo}
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-[2.5px] px-4 py-2.5 text-[13.5px] font-semibold ${
        ativo ? "border-wine text-text" : "border-transparent text-text-muted hover:text-text"
      }`}
    >
      {label}
      {pin && <span className="rounded-full bg-bg px-2 py-px text-[10.5px] font-medium tabular-nums text-text-muted">{pin}</span>}
    </button>
  );
}
