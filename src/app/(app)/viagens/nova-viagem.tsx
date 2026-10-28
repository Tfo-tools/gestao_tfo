"use client";

import { useActionState, useState } from "react";
import { criarViagem, type ViagemFormState } from "./actions";

const inicial: ViagemFormState = { error: null };

export function NovaViagem({ pessoas }: { pessoas: { id: string; nome: string }[] }) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(criarViagem, inicial);
  const cap = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);

  if (state.id && aberto) setAberto(false); // criou: recolhe (a lista revalida)

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12.5px] font-medium text-white">
        + Nova viagem
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
      <h2 className="font-heading text-sm font-semibold">Nova viagem</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px]">Nome da viagem <span className="text-text-faint">(obrigatório)</span>
          <input name="titulo" required placeholder="Ex.: Latam Retail Show — SP" className="input" />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">Destino <span className="text-text-faint">(opcional)</span>
          <input name="destino" placeholder="Cidade" className="input" />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">Ida
          <input name="data_inicio" type="date" className="input" />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">Volta
          <input name="data_fim" type="date" className="input" />
        </label>
      </div>
      <div>
        <p className="mb-1 text-[12px]">Quem vai</p>
        <div className="flex flex-wrap gap-3">
          {pessoas.map((p) => (
            <label key={p.id} className="flex items-center gap-1.5 text-[12px]">
              <input type="checkbox" name="participantes" value={p.id} className="h-3.5 w-3.5 rounded border-border" />
              {cap(p.nome)}
            </label>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-[12px]">Observações <span className="text-text-faint">(opcional)</span>
        <input name="observacoes" placeholder="Ex.: feira do setor, estande A12" className="input" />
      </label>
      {state.error && <p className="text-[12px] text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60">
          {pending ? "Criando…" : "Criar viagem"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-border px-4 py-2 text-[13px] text-text-muted">Cancelar</button>
      </div>
    </form>
  );
}
