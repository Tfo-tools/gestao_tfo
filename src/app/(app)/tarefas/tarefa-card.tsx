"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useAcaoEdicao } from "@/lib/use-acao-edicao";
import { atualizarTarefa, criarTarefa, mudarStatusTarefa, excluirTarefa, type TarefaFormState } from "./actions";
import { CamposTarefa } from "./campos-tarefa";
import { STATUS_LABEL, STATUS_ORDEM, type FaseProjeto, type Pessoa, type Produto, type Projeto, type Tarefa, type TarefaNo } from "./tipos";

export type DadosFormulario = {
  pessoas: Pessoa[];
  produtos: Produto[];
  projetos: Projeto[];
  fases: FaseProjeto[];
  candidatasDependencia: Pick<Tarefa, "id" | "titulo" | "projeto_id" | "status">[];
};

const initialState: TarefaFormState = { error: null };

function fmt(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const botaoPrimario = "rounded-md bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60";
const botaoSecundario = "rounded-md border border-border px-3 py-1.5 text-[11.5px] text-text-muted";

/** Formulário de edição (tarefa ou subtarefa) — mesmo bloco de campos, dentro da caixinha. */
function FormEdicao({ tarefa, dados, dependeDe, aoFechar }: { tarefa: TarefaNo; dados: DadosFormulario; dependeDe: string[]; aoFechar: () => void }) {
  const [state, formAction, pending] = useAcaoEdicao(atualizarTarefa, initialState, aoFechar);
  return (
    <form action={formAction} className="flex flex-col gap-2">
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
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={botaoPrimario}>
          {pending ? "…" : "Salvar"}
        </button>
        <button type="button" onClick={aoFechar} className={botaoSecundario}>
          Cancelar
        </button>
      </div>
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

/**
 * Caixinha tracejada "+ Nova tarefa". Fechada, ocupa uma linha; aberta, vira o formulário
 * compacto. Com `parentId` é a subtarefa inline (só título + responsável + prazo importam).
 */
export function NovaTarefaCard({
  dados,
  projetoInicial,
  faseInicial,
  parentId,
  rotulo = "+ Nova tarefa",
  aoConcluir,
}: {
  dados: DadosFormulario;
  projetoInicial?: string | null;
  faseInicial?: string | null;
  parentId?: string;
  rotulo?: string;
  aoConcluir?: () => void;
}) {
  const [aberto, setAberto] = useState(!!parentId);
  const [state, formAction, pending] = useActionState(criarTarefa, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const fechar = () => {
    setAberto(false);
    aoConcluir?.();
  };

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-dashed border-border text-[12px] text-text-muted hover:border-primary-fill hover:text-primary-deep"
      >
        {rotulo}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-primary-fill bg-surface p-3">
      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
          if (parentId) fechar();
        }}
        className="flex flex-col gap-2"
      >
        {parentId && <input type="hidden" name="parent_id" value={parentId} />}
        <CamposTarefa
          pessoas={dados.pessoas}
          produtos={dados.produtos}
          projetos={dados.projetos}
          fases={dados.fases}
          candidatasDependencia={dados.candidatasDependencia}
          projetoInicial={projetoInicial}
          faseInicial={faseInicial}
          fixarProjeto={!!parentId}
        />
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className={botaoPrimario}>
            {pending ? "…" : parentId ? "Adicionar subtarefa" : "Adicionar"}
          </button>
          <button type="button" onClick={fechar} className={botaoSecundario}>
            Fechar
          </button>
        </div>
        {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
      </form>
    </div>
  );
}

/** Linha de subtarefa dentro da caixinha: checkbox de feito, título, prazo, editar/×. */
function SubLinha({ no, nivel, dados, dependeDe }: { no: TarefaNo; nivel: number; dados: DadosFormulario; dependeDe: Map<string, string[]> }) {
  const [editando, setEditando] = useState(false);
  const [novaSub, setNovaSub] = useState(false);
  const [isPending, startTransition] = useTransition();
  const feita = no.status === "feito";
  const hoje = new Date().toISOString().slice(0, 10);
  const atrasada = !feita && !!no.prazo && no.prazo < hoje;
  const resp = dados.pessoas.find((p) => p.id === no.responsavel_id);

  if (editando) {
    return (
      <div className="rounded-md border border-primary-fill bg-primary-soft/20 p-2" style={{ marginLeft: `${nivel * 14}px` }}>
        <FormEdicao tarefa={no} dados={dados} dependeDe={dependeDe.get(no.id) ?? []} aoFechar={() => setEditando(false)} />
      </div>
    );
  }

  return (
    <>
      <div className="group flex items-center gap-1.5 text-[11.5px]" style={{ marginLeft: `${nivel * 14}px` }}>
        <input
          type="checkbox"
          checked={feita}
          disabled={isPending}
          onChange={(e) => {
            const novo = e.target.checked ? "feito" : "a_fazer";
            startTransition(async () => {
              await mudarStatusTarefa(no.id, novo);
            });
          }}
          className="accent-wine"
        />
        <span className={`min-w-0 flex-1 truncate ${feita ? "text-text-faint line-through" : no.aguardando.length > 0 ? "text-text-muted" : ""}`} title={no.titulo}>
          {no.titulo}
          {no.aguardando.length > 0 && !feita && <span title={`Aguarda: ${no.aguardando.map((a) => a.titulo).join(", ")}`}> ⏳</span>}
        </span>
        {resp && <span className="shrink-0 text-[10px] text-text-faint">{resp.nome.split(" ")[0]}</span>}
        {no.prazo && <span className={`shrink-0 text-[10px] ${atrasada ? "font-semibold text-danger" : "text-text-faint"}`}>{fmt(no.prazo)}</span>}
        <span className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
          {nivel < 2 && (
            <button type="button" onClick={() => setNovaSub(true)} title="Subtarefa" className="text-[10.5px] text-text-muted hover:text-primary-deep">
              +
            </button>
          )}
          <button type="button" onClick={() => setEditando(true)} className="text-[10.5px] text-primary-deep">
            editar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!confirm("Excluir essa subtarefa?")) return;
              startTransition(async () => {
                await excluirTarefa(no.id);
              });
            }}
            className="text-[10.5px] text-danger"
          >
            ×
          </button>
        </span>
      </div>
      {no.filhas.map((f) => (
        <SubLinha key={f.id} no={f} nivel={nivel + 1} dados={dados} dependeDe={dependeDe} />
      ))}
      {novaSub && (
        <div style={{ marginLeft: `${(nivel + 1) * 14}px` }}>
          <NovaTarefaCard dados={dados} projetoInicial={no.projeto_id} faseInicial={no.fase_id} parentId={no.id} aoConcluir={() => setNovaSub(false)} />
        </div>
      )}
    </>
  );
}

/** A caixinha da tarefa: título, etiquetas, prazo, status, subtarefas como checklist. */
export function TarefaCard({
  no,
  dados,
  dependeDe,
  mostrarFase = true,
  mostrarProjeto = false,
}: {
  no: TarefaNo;
  dados: DadosFormulario;
  dependeDe: Map<string, string[]>;
  mostrarFase?: boolean;
  mostrarProjeto?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [novaSub, setNovaSub] = useState(false);
  const [isPending, startTransition] = useTransition();

  const responsavel = dados.pessoas.find((p) => p.id === no.responsavel_id);
  const produto = dados.produtos.find((p) => p.id === no.produto_id);
  const fase = dados.fases.find((f) => f.id === no.fase_id);
  const projeto = dados.projetos.find((p) => p.id === no.projeto_id);
  const hoje = new Date().toISOString().slice(0, 10);
  const feita = no.status === "feito";
  const atrasada = !feita && !!no.prazo && no.prazo < hoje;
  const hojeVence = !feita && no.prazo === hoje;
  const bloqueada = !feita && no.aguardando.length > 0;

  if (editando) {
    return (
      <div className="rounded-lg border border-primary-fill bg-surface p-3">
        <FormEdicao tarefa={no} dados={dados} dependeDe={dependeDe.get(no.id) ?? []} aoFechar={() => setEditando(false)} />
      </div>
    );
  }

  return (
    <div
      className={`group flex flex-col gap-1.5 rounded-lg border p-3 ${
        feita ? "border-border-soft bg-bg opacity-60" : bloqueada ? "border-warning bg-warning-soft/40" : no.status === "fazendo" ? "border-primary-fill bg-surface" : "border-border-soft bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[12.5px] font-medium leading-snug ${feita ? "line-through" : ""}`}>{no.titulo}</span>
        <span className="flex shrink-0 items-center gap-1.5 opacity-0 group-hover:opacity-100">
          <button type="button" onClick={() => setEditando(true)} className="text-[10.5px] font-medium text-primary-deep">
            editar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const aviso = no.filhas.length > 0 ? `Excluir essa tarefa e suas ${no.filhas.length} subtarefa(s)?` : "Excluir essa tarefa?";
              if (!confirm(aviso)) return;
              startTransition(async () => {
                await excluirTarefa(no.id);
              });
            }}
            className="text-[11px] text-danger"
          >
            ×
          </button>
        </span>
      </div>

      {(mostrarProjeto && projeto) || (mostrarFase && fase) || no.etiquetas.length > 0 || produto || no.area ? (
        <div className="flex flex-wrap gap-1">
          {mostrarProjeto && projeto && <span className="rounded-full bg-wine-soft px-1.5 py-0.5 text-[10px] text-wine">{projeto.nome}</span>}
          {mostrarFase && fase && <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] text-primary-deep">{fase.nome}</span>}
          {no.etiquetas.map((e) => (
            <span key={e} className="rounded-full bg-cream px-1.5 py-0.5 text-[10px] text-wine">
              #{e}
            </span>
          ))}
          {no.area && <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-muted">{no.area}</span>}
          {produto && <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-muted">{produto.nome}</span>}
        </div>
      ) : null}

      {no.descricao && <p className="line-clamp-2 whitespace-pre-line text-[11px] text-text-muted">{no.descricao}</p>}

      {bloqueada && (
        <p className="text-[10.5px] text-cream-deep" title={no.aguardando.map((a) => a.titulo).join(", ")}>
          ⏳ aguarda {no.aguardando.length === 1 ? no.aguardando[0].titulo : `${no.aguardando.length} tarefas`}
        </p>
      )}

      {no.filhas.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-border-soft pt-1.5">
          {no.progresso !== null && (
            <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-text-faint">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-bg">
                <span className="block h-full rounded-full bg-primary-fill" style={{ width: `${Math.round(no.progresso * 100)}%` }} />
              </span>
              {Math.round(no.progresso * 100)}%
            </div>
          )}
          {no.filhas.map((f) => (
            <SubLinha key={f.id} no={f} nivel={0} dados={dados} dependeDe={dependeDe} />
          ))}
        </div>
      )}

      {novaSub && <NovaTarefaCard dados={dados} projetoInicial={no.projeto_id} faseInicial={no.fase_id} parentId={no.id} aoConcluir={() => setNovaSub(false)} />}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className={`min-w-0 truncate text-[10.5px] ${atrasada ? "font-semibold text-danger" : hojeVence ? "font-semibold text-primary-deep" : "text-text-faint"}`}>
          {responsavel && <span className="mr-1.5">{responsavel.nome.split(" ")[0]}</span>}
          {no.data_inicio && `${fmt(no.data_inicio)} → `}
          {no.prazo ? (atrasada ? `atrasada ${fmt(no.prazo)}` : hojeVence ? "vence hoje" : fmt(no.prazo)) : ""}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {!novaSub && (
            <button type="button" onClick={() => setNovaSub(true)} title="Adicionar subtarefa" className="text-[10.5px] text-text-muted hover:text-primary-deep">
              + sub
            </button>
          )}
          <select
            value={no.status}
            disabled={isPending}
            onChange={(e) => {
              const novoStatus = e.target.value;
              startTransition(async () => {
                await mudarStatusTarefa(no.id, novoStatus);
              });
            }}
            className="input input-compacto w-[88px] text-[10.5px]"
          >
            {STATUS_ORDEM.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </span>
      </div>
    </div>
  );
}
