"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { renomearCenario, excluirCenario, type CenarioFormState } from "./actions";

type Cenario = {
  id: string;
  nome: string;
  descricao: string | null;
  is_base: boolean;
  status: string;
};

const initialState: CenarioFormState = { error: null };

export function CenarioCard({ cenario }: { cenario: Cenario }) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(renomearCenario, initialState);
  const [isPending, startTransition] = useTransition();
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);
  const foiPending = useRef(false);

  useEffect(() => {
    if (foiPending.current && !pending && state.error === null) setEditando(false);
    foiPending.current = pending;
  }, [pending, state.error]);

  function handleExcluir() {
    if (!confirm(`Excluir o cenário "${cenario.nome}"? Isso apaga todas as fases, custos e simulações dele — não dá pra desfazer.`)) return;
    startTransition(async () => {
      const resultado = await excluirCenario(cenario.id);
      setErroExcluir(resultado.error);
    });
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-primary-fill bg-surface p-5">
        <form action={formAction} className="flex flex-col gap-2.5">
          <input type="hidden" name="id" value={cenario.id} />
          <div>
            <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Nome</label>
            <input name="nome" type="text" defaultValue={cenario.nome} required className="input" />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Descrição</label>
            <input name="descricao" type="text" defaultValue={cenario.descricao ?? ""} className="input" />
          </div>
          {state.error && <p className="rounded-lg bg-danger-soft px-2.5 py-1.5 text-[11px] text-danger">{state.error}</p>}
          <div className="mt-1 flex gap-2">
            <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60">
              {pending ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={() => setEditando(false)} className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary-fill">
      <div className="flex items-center justify-between">
        <span
          className={`w-fit rounded px-2 py-0.5 text-[10.5px] font-semibold ${
            cenario.is_base ? "bg-success-soft text-success" : "bg-[#eef0f4] text-[#4a5064]"
          }`}
        >
          {cenario.is_base ? "CENÁRIO-BASE" : cenario.status.toUpperCase()}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditando(true)} className="text-[11px] text-primary-deep">
            Renomear
          </button>
          <button type="button" disabled={isPending} onClick={handleExcluir} className="text-[11px] text-danger disabled:opacity-60">
            Excluir
          </button>
        </div>
      </div>
      <Link href={`/produtos?cenario=${cenario.id}`} className="flex flex-col gap-1">
        <div className="font-heading text-[15px] font-semibold">{cenario.nome}</div>
        <p className="text-[12px] text-text-muted">{cenario.descricao ?? "Sem descrição."}</p>
      </Link>
      {erroExcluir && <p className="rounded-lg bg-danger-soft px-2.5 py-1.5 text-[11px] text-danger">{erroExcluir}</p>}
    </div>
  );
}
