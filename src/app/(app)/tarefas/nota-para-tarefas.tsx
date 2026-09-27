"use client";

import { useState, useTransition } from "react";
import type { AcaoSugerida } from "@/lib/anthropic";
import { criarTarefasDeNota, sugerirAcoesDeNota } from "./nota-actions";

type Pessoa = { id: string; nome: string };
type Programa = { id: string; nome: string };

/** Painel "Tarefas a partir de uma mensagem": cola o aviso (WhatsApp de programa, trecho de edital,
 * recado), a IA sugere as ações, a sócia revisa item a item e confirma. Aqui a revisão é
 * obrigatória — só a ata de reunião (Fathom) cria tarefa sem clique. */
export function NotaParaTarefas({ pessoas, programas, iaConfigurada }: { pessoas: Pessoa[]; programas: Programa[]; iaConfigurada: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [programaId, setProgramaId] = useState("");
  const [sugerindo, startSugestao] = useTransition();
  const [criando, startCriacao] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [acoes, setAcoes] = useState<(AcaoSugerida & { selecionada: boolean })[] | null>(null);
  const [criadas, setCriadas] = useState<number | null>(null);

  function sugerir() {
    setErro(null);
    setCriadas(null);
    startSugestao(async () => {
      const r = await sugerirAcoesDeNota(texto, programaId || null);
      if (r.error) return setErro(r.error);
      setAcoes(r.acoes.map((a) => ({ ...a, selecionada: true })));
    });
  }

  function atualizar(idx: number, patch: Partial<AcaoSugerida & { selecionada: boolean }>) {
    setAcoes((atual) => atual?.map((a, i) => (i === idx ? { ...a, ...patch } : a)) ?? null);
  }

  function confirmar() {
    if (!acoes) return;
    const selecionadas = acoes.filter((a) => a.selecionada);
    setErro(null);
    startCriacao(async () => {
      const r = await criarTarefasDeNota(
        selecionadas.map((a) => {
          const pessoa = pessoas.find((p) => p.nome.toLowerCase() === (a.responsavel_sugerido ?? "").toLowerCase());
          return { titulo: a.titulo, responsavel_id: pessoa?.id ?? null, prazo: a.prazo_sugerido };
        }),
        programaId || null,
        texto,
      );
      if (r.error) return setErro(r.error);
      setCriadas(r.criadas);
      setAcoes(null);
      setTexto("");
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-[12.5px] font-semibold">Tarefas a partir de uma mensagem</span>
        <span className="text-[11px] text-text-muted">{aberto ? "recolher ▲" : "colar aviso de programa, edital, recado ▾"}</span>
      </button>

      {aberto && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            placeholder="Cole aqui a mensagem (ex.: aviso do Founders Club pedindo o relatório até 30/09)…"
            className="input w-full"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select value={programaId} onChange={(e) => setProgramaId(e.target.value)} className="input w-[260px]">
              <option value="">Sem programa vinculado</option>
              {programas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!iaConfigurada || sugerindo || texto.trim().length < 10}
              onClick={sugerir}
              className="rounded-lg border border-primary-fill px-3 py-1.5 text-[11px] font-medium text-primary-deep disabled:opacity-50"
            >
              {sugerindo ? "Lendo a mensagem…" : "Sugerir tarefas (IA)"}
            </button>
            {!iaConfigurada && <span className="text-[10.5px] text-text-faint">IA não configurada (ANTHROPIC_API_KEY).</span>}
            <span className="text-[10.5px] text-text-faint">Programa vira etiqueta da tarefa — dá pra ver tudo dele em “Ver por: etiqueta”.</span>
          </div>
          {erro && <p className="text-[10.5px] text-danger">{erro}</p>}
          {criadas !== null && (
            <p className="text-[11.5px] text-success">
              {criadas} tarefa{criadas === 1 ? "" : "s"} criada{criadas === 1 ? "" : "s"}.
            </p>
          )}

          {acoes && (
            <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-bg p-3">
              {acoes.length === 0 ? (
                <p className="text-[11.5px] text-text-muted">Não encontrei nenhuma ação nessa mensagem.</p>
              ) : (
                <>
                  <p className="text-[11px] font-medium text-text-muted">Revise antes de confirmar — prazo em branco quando a mensagem não diz a data:</p>
                  {acoes.map((acao, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-surface px-3 py-2">
                      <input type="checkbox" checked={acao.selecionada} onChange={(e) => atualizar(idx, { selecionada: e.target.checked })} className="h-3.5 w-3.5 rounded border-border" />
                      <input type="text" value={acao.titulo} onChange={(e) => atualizar(idx, { titulo: e.target.value })} className="input min-w-[180px] flex-1" />
                      <select
                        value={pessoas.find((p) => p.nome.toLowerCase() === (acao.responsavel_sugerido ?? "").toLowerCase())?.id ?? ""}
                        onChange={(e) => atualizar(idx, { responsavel_sugerido: pessoas.find((p) => p.id === e.target.value)?.nome ?? null })}
                        className="input w-[130px]"
                      >
                        <option value="">Sem responsável</option>
                        {pessoas.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome}
                          </option>
                        ))}
                      </select>
                      <input type="date" value={acao.prazo_sugerido ?? ""} onChange={(e) => atualizar(idx, { prazo_sugerido: e.target.value || null })} className="input w-[135px]" />
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={criando} onClick={confirmar} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">
                      {criando ? "…" : `Criar ${acoes.filter((a) => a.selecionada).length} tarefa(s)`}
                    </button>
                    <button type="button" onClick={() => setAcoes(null)} className="text-[11.5px] text-text-muted">
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
