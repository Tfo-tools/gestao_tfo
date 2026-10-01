"use client";

import { useState, useTransition } from "react";
import type { AcaoSugerida, PlanoImportado } from "@/lib/ia";
import { criarTarefasDeNota, importarPlano, sugerirAcoesDeNota, sugerirPlanoDeTexto } from "./nota-actions";

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
  const [plano, setPlano] = useState<PlanoImportado | null>(null);
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [resumoPlano, setResumoPlano] = useState<string | null>(null);

  function sugerirPlano() {
    setErro(null);
    setCriadas(null);
    setResumoPlano(null);
    setAcoes(null);
    startSugestao(async () => {
      const r = await sugerirPlanoDeTexto(texto);
      if (r.error || !r.plano) return setErro(r.error ?? "Não deu certo.");
      setPlano(r.plano);
      setExcluidas(new Set());
    });
  }

  function confirmarPlano() {
    if (!plano) return;
    const filtrado: PlanoImportado = {
      projetos: plano.projetos
        .map((p, pi) => ({ ...p, tarefas: p.tarefas.filter((_, ti) => !excluidas.has(`${pi}:${ti}`)) }))
        .filter((p) => p.tarefas.length > 0),
    };
    setErro(null);
    startCriacao(async () => {
      const r = await importarPlano(filtrado);
      if (r.error) return setErro(r.error);
      setResumoPlano(`${r.projetos} projeto(s) novo(s), ${r.tarefas} tarefa(s), ${r.atividades} atividade(s) e ${r.dependencias} dependência(s) criadas.`);
      setPlano(null);
      setTexto("");
    });
  }

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
            placeholder="Cole aqui a mensagem (aviso de programa, edital, recado) — ou um plano inteiro com projetos, tarefas e subtarefas e use “Importar como plano”."
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
            <button
              type="button"
              disabled={!iaConfigurada || sugerindo || texto.trim().length < 20}
              onClick={sugerirPlano}
              title="Para texto com projetos, tarefas numeradas e 'Subtarefas:' — cria projeto → tarefa → atividade, com responsáveis, prazos e dependências"
              className="rounded-lg border border-wine px-3 py-1.5 text-[11px] font-medium text-wine disabled:opacity-50"
            >
              {sugerindo ? "…" : "Importar como plano (IA)"}
            </button>
            {!iaConfigurada && <span className="text-[10.5px] text-text-faint">IA não configurada (GEMINI_API_KEY na Vercel).</span>}
            <span className="text-[10.5px] text-text-faint">Programa vira etiqueta da tarefa — dá pra ver tudo dele em “Ver por: etiqueta”.</span>
          </div>
          {erro && <p className="text-[10.5px] text-danger">{erro}</p>}
          {criadas !== null && (
            <p className="text-[11.5px] text-success">
              {criadas} tarefa{criadas === 1 ? "" : "s"} criada{criadas === 1 ? "" : "s"}.
            </p>
          )}

          {resumoPlano && <p className="text-[11.5px] text-success">{resumoPlano} Veja em “Projeto”.</p>}

          {plano && (
            <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-bg p-3">
              <p className="text-[11px] font-medium text-text-muted">
                Prévia — desmarque o que não deve entrar. Atividades ficam dentro da tarefa; dependências ligam pelos códigos.
              </p>
              {plano.projetos.map((p, pi) => (
                <div key={pi} className="rounded-lg border border-border-soft bg-surface px-3 py-2">
                  <p className="text-[12.5px] font-semibold">
                    {p.nome}
                    <span className="ml-2 font-normal text-text-faint">
                      {p.tarefas.length} tarefa{p.tarefas.length === 1 ? "" : "s"}
                      {p.prazo ? ` · até ${p.prazo.split("-").reverse().join("/")}` : ""}
                    </span>
                  </p>
                  {p.descricao && <p className="text-[11px] text-text-muted">{p.descricao}</p>}
                  <div className="mt-1.5 flex flex-col gap-1">
                    {p.tarefas.map((t, ti) => {
                      const chave = `${pi}:${ti}`;
                      const fora = excluidas.has(chave);
                      return (
                        <div key={chave} className={`rounded border border-border-soft px-2 py-1 ${fora ? "opacity-40" : ""}`}>
                          <label className="flex items-start gap-2 text-[12px]">
                            <input
                              type="checkbox"
                              checked={!fora}
                              onChange={(e) =>
                                setExcluidas((atual) => {
                                  const n = new Set(atual);
                                  if (e.target.checked) n.delete(chave);
                                  else n.add(chave);
                                  return n;
                                })
                              }
                              className="mt-0.5 h-3.5 w-3.5 rounded border-border"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">
                                {t.codigo ? `${t.codigo} ` : ""}
                                {t.titulo}
                              </span>
                              <span className="block text-[10.5px] text-text-faint">
                                {t.responsaveis.length > 0 ? t.responsaveis.join(" + ") : "sem responsável"}
                                {t.inicio ? ` · ${t.inicio.split("-").reverse().join("/")}` : ""}
                                {t.prazo ? ` → ${t.prazo.split("-").reverse().join("/")}` : " · sem prazo"}
                                {t.depende_de.length > 0 ? ` · depende de ${t.depende_de.join(", ")}` : ""}
                              </span>
                              {t.subtarefas.length > 0 && (
                                <span className="mt-0.5 block text-[10.5px] text-text-muted">
                                  {t.subtarefas.map((st, si) => (
                                    <span key={si} className="block truncate">
                                      ↳ {st.titulo}
                                      {st.responsavel ? ` (${st.responsavel})` : ""}
                                      {st.prazo ? ` · ${st.prazo.split("-").reverse().join("/")}` : ""}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <button type="button" disabled={criando} onClick={confirmarPlano} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">
                  {criando ? "Criando…" : `Criar ${plano.projetos.reduce((s, p, pi) => s + p.tarefas.filter((_, ti) => !excluidas.has(`${pi}:${ti}`)).length, 0)} tarefa(s) em ${plano.projetos.length} projeto(s)`}
                </button>
                <button type="button" onClick={() => setPlano(null)} className="text-[11.5px] text-text-muted">
                  Cancelar
                </button>
              </div>
            </div>
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
