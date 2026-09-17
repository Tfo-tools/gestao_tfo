"use client";

import { useState, useTransition } from "react";
import { useAcaoEdicao } from "@/lib/use-acao-edicao";
import { atualizarTarefa, mudarStatusTarefa, excluirTarefa, type TarefaFormState } from "./actions";
import { CamposTarefa } from "./campos-tarefa";
import { TarefaForm, type DadosFormulario } from "./tarefa-form";
import { STATUS_LABEL, STATUS_ORDEM, type FaseProjeto, type TarefaNo } from "./tipos";

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const initialState: TarefaFormState = { error: null };

/** Uma tarefa e, recursivamente, suas subtarefas (indentadas). */
export function TarefaArvore({
  no,
  nivel = 0,
  dados,
  dependeDe,
  mostrarFase = true,
}: {
  no: TarefaNo;
  nivel?: number;
  dados: DadosFormulario;
  /** tarefa_id → ids das quais depende (todas, feitas ou não), pra pré-marcar na edição. */
  dependeDe: Map<string, string[]>;
  mostrarFase?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <TarefaRow tarefa={no} nivel={nivel} dados={dados} dependeDe={dependeDe.get(no.id) ?? []} mostrarFase={mostrarFase} />
      {no.filhas.map((f) => (
        <TarefaArvore key={f.id} no={f} nivel={nivel + 1} dados={dados} dependeDe={dependeDe} mostrarFase={mostrarFase} />
      ))}
    </div>
  );
}

function TarefaRow({
  tarefa,
  nivel,
  dados,
  dependeDe,
  mostrarFase,
}: {
  tarefa: TarefaNo;
  nivel: number;
  dados: DadosFormulario;
  dependeDe: string[];
  mostrarFase: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [novaSub, setNovaSub] = useState(false);
  const [state, formAction, pending] = useAcaoEdicao(atualizarTarefa, initialState, () => setEditando(false));
  const [isPending, startTransition] = useTransition();

  const responsavel = dados.pessoas.find((p) => p.id === tarefa.responsavel_id);
  const produto = dados.produtos.find((p) => p.id === tarefa.produto_id);
  const fase: FaseProjeto | undefined = dados.fases.find((f) => f.id === tarefa.fase_id);
  const hoje = new Date().toISOString().slice(0, 10);
  const feita = tarefa.status === "feito";
  const atrasada = !feita && !!tarefa.prazo && tarefa.prazo < hoje;
  const hojeVence = !feita && tarefa.prazo === hoje;
  const bloqueada = !feita && tarefa.aguardando.length > 0;
  const recuo = { marginLeft: `${nivel * 22}px` };

  if (editando) {
    return (
      <div style={recuo} className="rounded-lg border border-primary-fill bg-primary-soft/20 p-3.5">
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={tarefa.id} />
          <input type="hidden" name="parent_id" value={tarefa.parent_id ?? ""} />
          <CamposTarefa
            tarefa={tarefa}
            pessoas={dados.pessoas}
            produtos={dados.produtos}
            projetos={dados.projetos}
            fases={dados.fases}
            candidatasDependencia={dados.candidatasDependencia}
            dependeDe={dependeDe}
            fixarProjeto={!!tarefa.parent_id}
            abrirTudo
          />
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
    <>
      <div
        style={recuo}
        className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
          feita ? "border-border-soft bg-bg opacity-60" : bloqueada ? "border-border-soft bg-bg" : "border-border-soft bg-surface"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {nivel > 0 && <span className="text-text-faint">↳</span>}
            <span className={`text-[13px] font-medium ${feita ? "line-through" : bloqueada ? "text-text-muted" : ""}`}>{tarefa.titulo}</span>
            {bloqueada && (
              <span
                title={`Aguardando: ${tarefa.aguardando.map((a) => a.titulo).join(", ")}`}
                className="rounded-full border border-warning bg-warning-soft px-2 py-0.5 text-[10.5px] text-text-muted"
              >
                ⏳ aguarda {tarefa.aguardando.length === 1 ? tarefa.aguardando[0].titulo : `${tarefa.aguardando.length} tarefas`}
              </span>
            )}
            {tarefa.progresso !== null && (
              <span className="flex items-center gap-1.5 text-[10.5px] text-text-muted">
                <span className="h-1.5 w-14 overflow-hidden rounded-full bg-bg">
                  <span className="block h-full rounded-full bg-primary-fill" style={{ width: `${Math.round(tarefa.progresso * 100)}%` }} />
                </span>
                {Math.round(tarefa.progresso * 100)}%
              </span>
            )}
            {responsavel && <span className="rounded-full bg-bg px-2 py-0.5 text-[10.5px] text-text-muted">{responsavel.nome}</span>}
            {mostrarFase && fase && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] text-primary-deep">{fase.nome}</span>}
            {tarefa.etiquetas.map((e) => (
              <span key={e} className="rounded-full bg-cream px-2 py-0.5 text-[10.5px] text-wine">
                #{e}
              </span>
            ))}
            {produto && <span className="rounded-full bg-bg px-2 py-0.5 text-[10.5px] text-text-muted">{produto.nome}</span>}
            {tarefa.area && <span className="rounded-full bg-bg px-2 py-0.5 text-[10.5px] text-text-muted">{tarefa.area}</span>}
          </div>
          {tarefa.descricao && <p className="mt-0.5 whitespace-pre-line text-[11.5px] text-text-muted">{tarefa.descricao}</p>}
          {(tarefa.prazo || tarefa.data_inicio) && (
            <p className={`mt-0.5 text-[11px] ${atrasada ? "font-semibold text-danger" : hojeVence ? "font-semibold text-primary-deep" : "text-text-faint"}`}>
              {tarefa.data_inicio && `${formatDate(tarefa.data_inicio)} → `}
              {tarefa.prazo ? (atrasada ? `Atrasada — ${formatDate(tarefa.prazo)}` : hojeVence ? "Vence hoje" : formatDate(tarefa.prazo)) : "sem prazo"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
          {nivel < 2 && (
            <button type="button" onClick={() => setNovaSub((v) => !v)} title="Adicionar subtarefa" className="text-[11.5px] text-text-muted hover:text-primary-deep">
              + sub
            </button>
          )}
          <button type="button" onClick={() => setEditando(true)} className="text-[11.5px] font-medium text-primary-deep">
            Editar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const aviso = tarefa.filhas.length > 0 ? `Excluir essa tarefa e suas ${tarefa.filhas.length} subtarefa(s)?` : "Excluir essa tarefa?";
              if (!confirm(aviso)) return;
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
      {novaSub && (
        <div style={{ marginLeft: `${(nivel + 1) * 22}px` }}>
          <TarefaForm dados={dados} projetoInicial={tarefa.projeto_id} parentId={tarefa.id} aoConcluir={() => setNovaSub(false)} />
        </div>
      )}
    </>
  );
}
