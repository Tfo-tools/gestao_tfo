"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarTarefa, type TarefaFormState } from "./actions";
import { sugerirTarefaIA, type SugestaoTarefaIA } from "./ia-actions";
import type { DadosFormulario } from "./tarefa-card";

const inicial: TarefaFormState = { error: null };

/**
 * "Criar com IA": a sócia escreve, em texto livre, o que precisa fazer e por quê. A IA estrutura em
 * campos (título, responsável, prazo, projeto, etiquetas) que ela confere e ajusta antes de criar.
 * Rápido pra quem entende o negócio, com estrutura garantida — e nada é criado sem o aceite.
 */
export function CriarComIA({
  dados,
  projetoInicial,
  aoConcluir,
}: {
  dados: DadosFormulario;
  projetoInicial: string | null;
  aoConcluir: () => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [sug, setSug] = useState<SugestaoTarefaIA | null>(null);
  const [pensando, pensar] = useTransition();
  const [state, formAction, salvando] = useActionState(criarTarefa, inicial);

  useEffect(() => {
    if (state.success) {
      router.refresh();
      aoConcluir();
    }
  }, [state.success, router, aoConcluir]);

  function sugerir() {
    setErroIA(null);
    pensar(async () => {
      const r = await sugerirTarefaIA(texto);
      if (r.error || !r.sugestao) {
        setErroIA(r.error || "Não consegui estruturar — tente de novo.");
        return;
      }
      setSug({ ...r.sugestao, projeto_id: r.sugestao.projeto_id ?? projetoInicial ?? null });
    });
  }

  return (
    <div className="w-full rounded-xl border border-wine/30 bg-wine-soft/30 p-3.5">
      {!sug ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-wine-deep">✨ Criar com IA</div>
          <p className="text-[11.5px] text-text-muted">Escreva o que precisa fazer e, se puder, por quê. A IA sugere título, responsável, prazo e projeto — você confere antes de criar.</p>
          <textarea
            autoFocus
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sugerir(); }}
            placeholder="Ex.: preciso fechar 2 marcas novas até meados de dezembro pra ter base de case antes da devolutiva da ACE"
            className="input"
          />
          {erroIA && <p className="text-[11.5px] text-danger">{erroIA}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={sugerir}
              disabled={pensando || texto.trim().length < 4}
              className="rounded-md bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pensando ? "Estruturando…" : "✨ Sugerir campos"}
            </button>
            <button type="button" onClick={aoConcluir} className="px-1 text-[11.5px] text-text-faint hover:text-danger">cancelar</button>
          </div>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-semibold text-wine-deep">✨ A IA sugeriu — confira e ajuste</span>
            <button type="button" onClick={() => { setSug(null); }} className="text-[11px] text-text-faint underline hover:text-wine-deep">↺ reescrever</button>
          </div>

          <label className="flex flex-col gap-1 text-[10.5px] font-medium uppercase tracking-wide text-text-muted">
            Título
            <input name="titulo" defaultValue={sug.titulo} required className="input" />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[10.5px] font-medium uppercase tracking-wide text-text-muted">
              Responsável
              <select name="responsavel_id" defaultValue={sug.responsavel_id ?? ""} className="input">
                <option value="">— quem? —</option>
                {dados.pessoas.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10.5px] font-medium uppercase tracking-wide text-text-muted">
              Prazo
              <input type="date" name="prazo" defaultValue={sug.prazo ?? ""} className="input" />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-[10.5px] font-medium uppercase tracking-wide text-text-muted">
            Projeto
            <select name="projeto_id" defaultValue={sug.projeto_id ?? ""} className="input">
              <option value="">— sem projeto —</option>
              {dados.projetos.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[10.5px] font-medium uppercase tracking-wide text-text-muted">
            Por quê / contexto
            <textarea name="descricao" rows={2} defaultValue={sug.descricao ?? ""} className="input" />
          </label>

          <label className="flex flex-col gap-1 text-[10.5px] font-medium uppercase tracking-wide text-text-muted">
            Etiquetas
            <input name="etiquetas" defaultValue={sug.etiquetas.join(", ")} placeholder="separadas por vírgula" className="input" />
          </label>

          {state.error && <p className="text-[11.5px] text-danger">{state.error}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={salvando} className="rounded-md bg-wine-deep px-3.5 py-1.5 text-[11.5px] font-medium text-white hover:opacity-90 disabled:opacity-50">
              {salvando ? "Criando…" : "Criar tarefa"}
            </button>
            <button type="button" onClick={aoConcluir} className="px-1 text-[11.5px] text-text-faint hover:text-danger">cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
