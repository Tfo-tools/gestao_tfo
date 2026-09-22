"use client";

import { useActionState, useState } from "react";
import { salvarNotaCargo, type ActionState } from "./actions";

export type NotaCargo = { cargo_chave: string; produtividade: string | null; estrategia: string | null };

const initialState: ActionState = { error: null };

/**
 * A tabela mostra o número; esta nota guarda o raciocínio — quanto cada pessoa produz e por que
 * aquele modelo de contratação, e não outro. Sem ela, quem abre o plano meses depois (ou a sócia,
 * ou a investidora) só vê a alocação e tenta deduzir a lógica de trás pra frente.
 */
export function NotaCargo({
  cenarioId,
  cargoChave,
  cargoLabel,
  nota,
}: {
  cenarioId: string;
  cargoChave: string;
  cargoLabel: string;
  nota?: NotaCargo;
}) {
  const [state, formAction, pending] = useActionState(salvarNotaCargo, initialState);
  const [editando, setEditando] = useState(false);
  const vazia = !nota?.produtividade && !nota?.estrategia;

  if (!editando) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-bg px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-heading text-[11.5px] font-semibold text-text-muted">
            Como {cargoLabel} foi planejado
          </h3>
          <button type="button" onClick={() => setEditando(true)} className="text-[11px] text-primary-deep underline">
            {vazia ? "escrever" : "editar"}
          </button>
        </div>
        {vazia ? (
          <p className="mt-1 text-[11.5px] text-text-faint">
            Registre a produtividade considerada e por que este modelo de contratação — é o que explica a alocação pra quem
            abrir o plano depois.
          </p>
        ) : (
          <>
            {nota?.produtividade && <p className="mt-1.5 text-[11.5px] font-medium">{nota.produtividade}</p>}
            {nota?.estrategia && <p className="mt-1 text-[11.5px] leading-relaxed text-text-muted">{nota.estrategia}</p>}
          </>
        )}
      </div>
    );
  }

  return (
    <form
      action={async (fd) => {
        await formAction(fd);
        setEditando(false);
      }}
      className="flex flex-col gap-2 rounded-lg border border-primary-fill bg-bg px-4 py-3"
    >
      <input type="hidden" name="cenario_id" value={cenarioId} />
      <input type="hidden" name="cargo_chave" value={cargoChave} />
      <h3 className="font-heading text-[11.5px] font-semibold">Como {cargoLabel} foi planejado</h3>
      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] font-medium text-text-muted">Produtividade considerada (1 frase)</span>
        <input name="produtividade" defaultValue={nota?.produtividade ?? ""} className="input w-full" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] font-medium text-text-muted">Por que este modelo e qual a estratégia (2 frases)</span>
        <textarea name="estrategia" defaultValue={nota?.estrategia ?? ""} rows={3} className="input w-full" />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60">
          {pending ? "Salvando…" : "Salvar observação"}
        </button>
        <button type="button" onClick={() => setEditando(false)} className="rounded-lg border border-border px-3 py-1.5 text-[11.5px] text-text-muted">
          Cancelar
        </button>
        {state.error && <span className="text-[11px] text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
