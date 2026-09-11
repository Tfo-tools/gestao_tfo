"use client";

import { useActionState, useState, useTransition } from "react";
import { atualizarTarefa, mudarStatusTarefa, excluirTarefa, type TarefaFormState } from "./actions";

type Pessoa = { id: string; nome: string };
type Produto = { id: string; nome: string };

export type TarefaRowData = {
  id: string;
  titulo: string;
  descricao: string | null;
  responsavel_id: string | null;
  prazo: string | null;
  status: string;
  produto_id: string | null;
  area: string | null;
};

const STATUS_LABEL: Record<string, string> = { a_fazer: "A fazer", fazendo: "Fazendo", feito: "Feito" };
const STATUS_ORDEM = ["a_fazer", "fazendo", "feito"];

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

const initialState: TarefaFormState = { error: null };

export function TarefaRow({ tarefa, pessoas, produtos }: { tarefa: TarefaRowData; pessoas: Pessoa[]; produtos: Produto[] }) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(atualizarTarefa, initialState);
  const [isPending, startTransition] = useTransition();

  if (state.success && editando) setEditando(false);

  const responsavel = pessoas.find((p) => p.id === tarefa.responsavel_id);
  const produto = produtos.find((p) => p.id === tarefa.produto_id);
  const hoje = new Date().toISOString().slice(0, 10);
  const atrasada = tarefa.status !== "feito" && !!tarefa.prazo && tarefa.prazo < hoje;
  const hojeVence = tarefa.status !== "feito" && tarefa.prazo === hoje;

  if (editando) {
    return (
      <div className="rounded-lg border border-primary-fill bg-primary-soft/20 p-3.5">
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={tarefa.id} />
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-[10.5px] text-text-faint">Título</label>
            <input name="titulo" type="text" defaultValue={tarefa.titulo} required className="input w-full" />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Responsável</label>
            <select name="responsavel_id" defaultValue={tarefa.responsavel_id ?? ""} className="input w-[130px]">
              <option value="">—</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Prazo</label>
            <input name="prazo" type="date" defaultValue={tarefa.prazo ?? ""} className="input w-[140px]" />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Produto (opcional)</label>
            <select name="produto_id" defaultValue={tarefa.produto_id ?? ""} className="input w-[130px]">
              <option value="">—</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Área (opcional)</label>
            <input name="area" type="text" defaultValue={tarefa.area ?? ""} className="input w-[120px]" />
          </div>
          <div className="w-full">
            <label className="mb-1 block text-[10.5px] text-text-faint">Descrição (opcional)</label>
            <input name="descricao" type="text" defaultValue={tarefa.descricao ?? ""} className="input w-full" />
          </div>
          <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60">
            {pending ? "…" : "Salvar"}
          </button>
          <button type="button" onClick={() => setEditando(false)} className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
            Cancelar
          </button>
          {state.error && <p className="w-full text-[11px] text-danger">{state.error}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between rounded-lg border border-border-soft p-3.5 ${tarefa.status === "feito" ? "bg-bg opacity-60" : "bg-surface"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-[13px] font-medium ${tarefa.status === "feito" ? "line-through" : ""}`}>{tarefa.titulo}</span>
          {responsavel && <span className="rounded-full bg-bg px-2 py-0.5 text-[10.5px] text-text-muted">{responsavel.nome}</span>}
          {produto && <span className="rounded-full bg-bg px-2 py-0.5 text-[10.5px] text-text-muted">{produto.nome}</span>}
          {tarefa.area && <span className="rounded-full bg-bg px-2 py-0.5 text-[10.5px] text-text-muted">{tarefa.area}</span>}
        </div>
        {tarefa.descricao && <p className="mt-0.5 text-[11.5px] text-text-muted">{tarefa.descricao}</p>}
        {tarefa.prazo && (
          <p className={`mt-0.5 text-[11px] ${atrasada ? "font-semibold text-danger" : hojeVence ? "font-semibold text-primary-deep" : "text-text-faint"}`}>
            {atrasada ? "Atrasada — " : hojeVence ? "Vence hoje — " : "Prazo: "}
            {formatDate(tarefa.prazo)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={tarefa.status}
          disabled={isPending}
          onChange={(e) => {
            const novoStatus = e.target.value;
            startTransition(async () => {
              await mudarStatusTarefa(tarefa.id, novoStatus);
            });
          }}
          className="input w-[100px] text-[11.5px]"
        >
          {STATUS_ORDEM.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setEditando(true)} className="text-[11.5px] font-medium text-primary-deep">
          Editar
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (!confirm("Excluir essa tarefa?")) return;
            startTransition(async () => {
              await excluirTarefa(tarefa.id);
            });
          }}
          className="text-[11.5px] text-danger"
        >
          ×
        </button>
      </div>
    </div>
  );
}
