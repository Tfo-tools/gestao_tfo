"use client";

import { useState, useTransition } from "react";
import { salvarPreferenciaInicio } from "./inicio-actions";

/** "minhas · todas" da caixa de ações. Salva no perfil, vale em qualquer aparelho. */
export function SeletorInicio({ soMinhas }: { soMinhas: boolean }) {
  const [minhas, setMinhas] = useState(soMinhas);
  const [pendente, start] = useTransition();
  const seg = (ativo: boolean) => `px-2.5 py-1 text-[11.5px] ${ativo ? "bg-wine-deep text-white" : "text-text-muted hover:text-text"}`;
  const salvar = (v: boolean) => {
    setMinhas(v);
    start(async () => void (await salvarPreferenciaInicio(v)));
  };
  return (
    <span className={`inline-flex overflow-hidden rounded-lg border border-border ${pendente ? "opacity-60" : ""}`}>
      <button type="button" disabled={pendente} onClick={() => salvar(true)} className={seg(minhas)}>
        minhas
      </button>
      <button type="button" disabled={pendente} onClick={() => salvar(false)} className={seg(!minhas)}>
        todas
      </button>
    </span>
  );
}
