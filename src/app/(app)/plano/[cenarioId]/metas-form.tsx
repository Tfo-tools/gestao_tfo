"use client";

import { useActionState, useState } from "react";
import { salvarMetasCenario, type CenarioFormState } from "../../cenarios/actions";
import type { MetasCenario } from "../metas-header";

const initialState: CenarioFormState = { error: null };

export function MetasForm({ cenarioId, metas }: { cenarioId: string; metas: MetasCenario }) {
  const [state, formAction, pending] = useActionState(salvarMetasCenario, initialState);
  const [aberto, setAberto] = useState(
    metas.meta_receita_mensal == null && metas.meta_cac == null && metas.meta_ltv == null && metas.meta_margem_bruta_pct == null && metas.meta_tir_pct == null,
  );

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="mb-5 text-[12px] font-medium text-primary-deep">
        ✎ Editar metas do plano
      </button>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-dashed border-primary-fill bg-primary-soft/20 p-5">
      <h2 className="mb-1 font-heading text-[13.5px] font-semibold">Onde esse plano quer chegar?</h2>
      <p className="mb-4 text-[11.5px] text-text-muted">
        Defina a meta antes de construir o detalhe — o topo da tela mostra o quanto o plano já está perto (ou longe) dela, à medida
        que você for inserindo produtos, preços e custos.
      </p>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={cenarioId} />
        <Campo label="Receita mensal desejada (R$)">
          <input name="meta_receita_mensal" type="number" step="0.01" min="0" defaultValue={metas.meta_receita_mensal ?? ""} className="input w-[160px]" />
        </Campo>
        <Campo label="CAC alvo (R$)">
          <input name="meta_cac" type="number" step="0.01" min="0" defaultValue={metas.meta_cac ?? ""} className="input w-[130px]" />
        </Campo>
        <Campo label="LTV alvo (R$)">
          <input name="meta_ltv" type="number" step="0.01" min="0" defaultValue={metas.meta_ltv ?? ""} className="input w-[130px]" />
        </Campo>
        <Campo label="Margem bruta alvo (%)">
          <input name="meta_margem_bruta_pct" type="number" step="0.1" min="0" max="100" defaultValue={metas.meta_margem_bruta_pct ?? ""} className="input w-[110px]" />
        </Campo>
        <Campo label="TIR alvo (% a.a.)">
          <input name="meta_tir_pct" type="number" step="0.1" min="0" defaultValue={metas.meta_tir_pct ?? ""} className="input w-[110px]" />
        </Campo>
        <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-60">
          {pending ? "Salvando…" : "Salvar metas"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-border px-3 py-2 text-[12.5px] text-text-muted">
          Fechar
        </button>
        {state.error && <p className="w-full text-[11px] text-danger">{state.error}</p>}
      </form>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10.5px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  );
}
