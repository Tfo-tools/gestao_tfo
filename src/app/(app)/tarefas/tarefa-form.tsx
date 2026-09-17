"use client";

import { useActionState, useRef } from "react";
import { criarTarefa, type TarefaFormState } from "./actions";
import { CamposTarefa } from "./campos-tarefa";
import type { FaseProjeto, Pessoa, Produto, Projeto, Tarefa } from "./tipos";

const initialState: TarefaFormState = { error: null };

export type DadosFormulario = {
  pessoas: Pessoa[];
  produtos: Produto[];
  projetos: Projeto[];
  fases: FaseProjeto[];
  candidatasDependencia: Pick<Tarefa, "id" | "titulo" | "projeto_id" | "status">[];
};

/** Formulário de nova tarefa. Com `parentId`, vira o formulário inline de subtarefa. */
export function TarefaForm({
  dados,
  projetoInicial,
  parentId,
  aoConcluir,
}: {
  dados: DadosFormulario;
  projetoInicial?: string | null;
  parentId?: string;
  aoConcluir?: () => void;
}) {
  const [state, formAction, pending] = useActionState(criarTarefa, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className={parentId ? "rounded-lg border border-dashed border-border p-3" : "rounded-xl border border-border bg-surface p-4"}>
      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
          aoConcluir?.();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        {parentId && <input type="hidden" name="parent_id" value={parentId} />}
        <CamposTarefa
          pessoas={dados.pessoas}
          produtos={dados.produtos}
          projetos={dados.projetos}
          fases={dados.fases}
          candidatasDependencia={dados.candidatasDependencia}
          projetoInicial={projetoInicial}
          fixarProjeto={!!parentId}
        />
        <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-60">
          {pending ? "…" : parentId ? "+ Subtarefa" : "+ Adicionar"}
        </button>
        {aoConcluir && (
          <button type="button" onClick={aoConcluir} className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
            Cancelar
          </button>
        )}
        {state.error && <p className="w-full text-[11px] text-danger">{state.error}</p>}
      </form>
    </div>
  );
}
