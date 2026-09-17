"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useAcaoEdicao } from "@/lib/use-acao-edicao";
import { atualizarProjeto, criarFaseProjeto, criarProjeto, excluirFaseProjeto, excluirProjeto, type TarefaFormState } from "./actions";
import type { FaseProdutoOpcao, FaseProjeto, Projeto } from "./tipos";

const initialState: TarefaFormState = { error: null };

function fmt(iso: string | null) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";
}

/**
 * Cadastro de projetos e das fases de cada um. Fica recolhido por padrão — o dia a dia é a lista
 * de tarefas; aqui só se mexe ao abrir um projeto novo ou desenhar as fases dele.
 */
export function ProjetosPanel({
  projetos,
  fases,
  fasesProduto,
  contagem,
  abertoInicial = false,
}: {
  projetos: Projeto[];
  fases: FaseProjeto[];
  fasesProduto: FaseProdutoOpcao[];
  /** projeto_id → { total, feitas } */
  contagem: Record<string, { total: number; feitas: number }>;
  abertoInicial?: boolean;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [state, formAction, pending] = useActionState(criarProjeto, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="font-heading text-[13px] font-semibold">
          Projetos e fases <span className="ml-1 font-normal text-text-faint">({projetos.filter((p) => p.status === "ativo").length} ativos)</span>
        </span>
        <span className="text-[11px] text-text-muted">{aberto ? "recolher" : "abrir"}</span>
      </button>

      {aberto && (
        <div className="flex flex-col gap-3 border-t border-border-soft px-4 py-3">
          {projetos.length === 0 && <p className="text-[12px] text-text-faint">Nenhum projeto ainda. Crie o primeiro abaixo — as tarefas passam a poder ser ligadas a ele.</p>}
          {projetos.map((p) => (
            <ProjetoItem key={p.id} projeto={p} fases={fases.filter((f) => f.projeto_id === p.id)} fasesProduto={fasesProduto} contagem={contagem[p.id]} />
          ))}

          <form
            ref={formRef}
            action={async (fd) => {
              await formAction(fd);
              formRef.current?.reset();
            }}
            className="flex flex-wrap items-end gap-2 border-t border-border-soft pt-3"
          >
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-[10.5px] text-text-faint">Novo projeto</label>
              <input name="nome" placeholder="Ex: Comunicação Q4" required className="input w-full" />
            </div>
            <div className="min-w-[200px] flex-[2]">
              <label className="mb-1 block text-[10.5px] text-text-faint">Objetivo</label>
              <input name="objetivo" placeholder="Ex: atingir as metas de conversão da fase de validação" className="input w-full" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Serve à fase de produto</label>
              <select name="produto_fase_id" className="input w-[190px]">
                <option value="">—</option>
                {fasesProduto.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60">
              {pending ? "…" : "+ Projeto"}
            </button>
            {state.error && <p className="w-full text-[11px] text-danger">{state.error}</p>}
          </form>
        </div>
      )}
    </div>
  );
}

function ProjetoItem({
  projeto,
  fases,
  fasesProduto,
  contagem,
}: {
  projeto: Projeto;
  fases: FaseProjeto[];
  fasesProduto: FaseProdutoOpcao[];
  contagem?: { total: number; feitas: number };
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useAcaoEdicao(atualizarProjeto, initialState, () => setEditando(false));
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const faseFormRef = useRef<HTMLFormElement>(null);
  const faseProduto = fasesProduto.find((f) => f.id === projeto.produto_fase_id);

  if (editando) {
    return (
      <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-primary-fill bg-primary-soft/20 p-3">
        <input type="hidden" name="id" value={projeto.id} />
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-[10.5px] text-text-faint">Nome</label>
          <input name="nome" defaultValue={projeto.nome} required className="input w-full" />
        </div>
        <div className="min-w-[200px] flex-[2]">
          <label className="mb-1 block text-[10.5px] text-text-faint">Objetivo</label>
          <input name="objetivo" defaultValue={projeto.objetivo ?? ""} className="input w-full" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Fase de produto</label>
          <select name="produto_fase_id" defaultValue={projeto.produto_fase_id ?? ""} className="input w-[190px]">
            <option value="">—</option>
            {fasesProduto.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Status</label>
          <select name="status" defaultValue={projeto.status} className="input w-[120px]">
            <option value="ativo">Ativo</option>
            <option value="concluido">Concluído</option>
            <option value="arquivado">Arquivado</option>
          </select>
        </div>
        <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60">
          {pending ? "…" : "Salvar"}
        </button>
        <button type="button" onClick={() => setEditando(false)} className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
          Cancelar
        </button>
        {state.error && <p className="w-full text-[11px] text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className={`rounded-lg border border-border-soft p-3 ${projeto.status !== "ativo" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold">{projeto.nome}</span>
            {projeto.status !== "ativo" && <span className="rounded-full bg-bg px-2 py-0.5 text-[10.5px] text-text-muted">{projeto.status === "concluido" ? "Concluído" : "Arquivado"}</span>}
            {contagem && contagem.total > 0 && (
              <span className="text-[10.5px] text-text-muted">
                {contagem.feitas}/{contagem.total} tarefas feitas
              </span>
            )}
            {faseProduto && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] text-primary-deep">→ {faseProduto.label}</span>}
          </div>
          {projeto.objetivo && <p className="mt-0.5 text-[11.5px] text-text-muted">{projeto.objetivo}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setEditando(true)} className="text-[11.5px] font-medium text-primary-deep">
            Editar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!confirm(`Excluir o projeto "${projeto.nome}"?`)) return;
              startTransition(async () => {
                const r = await excluirProjeto(projeto.id);
                setErro(r.error);
              });
            }}
            className="text-[11.5px] text-danger"
          >
            ×
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {fases.map((f, i) => (
          <span key={f.id} className="flex items-center gap-1 rounded-full border border-border-soft bg-bg px-2 py-0.5 text-[10.5px]">
            <span className="text-text-faint">{i + 1}.</span>
            <span>{f.nome}</span>
            {(f.data_inicio || f.data_fim) && (
              <span className="text-text-faint">
                {fmt(f.data_inicio)}
                {f.data_inicio && f.data_fim ? "–" : ""}
                {fmt(f.data_fim)}
              </span>
            )}
            <button
              type="button"
              disabled={isPending}
              title="Remover fase (as tarefas ficam sem fase)"
              onClick={() => {
                if (!confirm(`Remover a fase "${f.nome}"? As tarefas dela continuam no projeto, sem fase.`)) return;
                startTransition(async () => {
                  const r = await excluirFaseProjeto(f.id);
                  setErro(r.error);
                });
              }}
              className="ml-0.5 text-text-faint hover:text-danger"
            >
              ×
            </button>
          </span>
        ))}
        <form
          ref={faseFormRef}
          action={(fd) =>
            startTransition(async () => {
              const r = await criarFaseProjeto(fd);
              setErro(r.error);
              if (!r.error) faseFormRef.current?.reset();
            })
          }
          className="flex items-center gap-1"
        >
          <input type="hidden" name="projeto_id" value={projeto.id} />
          <input name="nome" placeholder="+ fase" required className="input input-compacto w-[120px]" />
          <input name="data_inicio" type="date" title="Início" className="input input-compacto w-[125px]" />
          <input name="data_fim" type="date" title="Fim" className="input input-compacto w-[125px]" />
          <button type="submit" disabled={isPending} className="rounded-md border border-border px-2 py-1 text-[11px] text-primary-deep">
            ok
          </button>
        </form>
      </div>
      {erro && <p className="mt-1 text-[11px] text-danger">{erro}</p>}
    </div>
  );
}
