"use client";

import { useState } from "react";
import type { FaseProjeto, Pessoa, Produto, Projeto, Tarefa } from "./tipos";

/**
 * Campos compartilhados entre "nova tarefa" e "editar tarefa". Linha 1 = o essencial (título,
 * responsável, prazo); o resto fica atrás de "mais opções" pra não virar um formulário gigante.
 * Fase só lista as do projeto escolhido; "depende de" só lista tarefas do mesmo projeto.
 */
export function CamposTarefa({
  tarefa,
  pessoas,
  produtos,
  projetos,
  fases,
  candidatasDependencia,
  dependeDe = [],
  projetoInicial,
  fixarProjeto = false,
  abrirTudo = false,
}: {
  tarefa?: Tarefa;
  pessoas: Pessoa[];
  produtos: Produto[];
  projetos: Projeto[];
  fases: FaseProjeto[];
  /** Tarefas que podem ser marcadas como pré-requisito (mesmo projeto, exceto ela mesma). */
  candidatasDependencia: Pick<Tarefa, "id" | "titulo" | "projeto_id" | "status">[];
  dependeDe?: string[];
  projetoInicial?: string | null;
  /** Subtarefa: o projeto vem da mãe e não muda aqui. */
  fixarProjeto?: boolean;
  abrirTudo?: boolean;
}) {
  const [projetoId, setProjetoId] = useState(tarefa?.projeto_id ?? projetoInicial ?? "");
  const [mais, setMais] = useState(abrirTudo);

  const fasesDoProjeto = fases.filter((f) => f.projeto_id === projetoId);
  const candidatas = candidatasDependencia.filter((c) => c.id !== tarefa?.id && (c.projeto_id ?? "") === (projetoId || ""));

  return (
    <>
      <div className="min-w-[200px] flex-1">
        <label className="mb-1 block text-[10.5px] text-text-faint">{tarefa ? "Título" : "Nova tarefa"}</label>
        <input name="titulo" type="text" defaultValue={tarefa?.titulo ?? ""} placeholder="Ex: Enviar proposta pro edital X" required className="input w-full" />
      </div>
      <div>
        <label className="mb-1 block text-[10.5px] text-text-faint">Responsável</label>
        <select name="responsavel_id" defaultValue={tarefa?.responsavel_id ?? ""} className="input w-[130px]">
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
        <input name="prazo" type="date" defaultValue={tarefa?.prazo ?? ""} className="input w-[140px]" />
      </div>
      {fixarProjeto ? (
        <input type="hidden" name="projeto_id" value={projetoId} />
      ) : (
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Projeto</label>
          <select name="projeto_id" value={projetoId} onChange={(e) => setProjetoId(e.target.value)} className="input w-[150px]">
            <option value="">Sem projeto</option>
            {projetos
              .filter((p) => p.status === "ativo" || p.id === tarefa?.projeto_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </select>
        </div>
      )}
      {projetoId && fasesDoProjeto.length > 0 && (
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Fase</label>
          <select name="fase_id" defaultValue={tarefa?.fase_id ?? ""} className="input w-[140px]">
            <option value="">—</option>
            {fasesDoProjeto.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      {!mais && (
        <button type="button" onClick={() => setMais(true)} className="self-end pb-2 text-[11px] text-text-muted underline">
          mais opções
        </button>
      )}

      {mais && (
        <div className="flex w-full flex-wrap items-end gap-2 border-t border-border-soft pt-2">
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Início</label>
            <input name="data_inicio" type="date" defaultValue={tarefa?.data_inicio ?? ""} className="input w-[140px]" />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Etiquetas (vírgula)</label>
            <input name="etiquetas" type="text" defaultValue={tarefa?.etiquetas?.join(", ") ?? ""} placeholder="centelha, jurídico" className="input w-[180px]" />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Tema / área</label>
            <input name="area" type="text" defaultValue={tarefa?.area ?? ""} placeholder="opcional" className="input w-[120px]" />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Produto</label>
            <select name="produto_id" defaultValue={tarefa?.produto_id ?? ""} className="input w-[130px]">
              <option value="">—</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full">
            <label className="mb-1 block text-[10.5px] text-text-faint">Descrição</label>
            <textarea name="descricao" rows={2} defaultValue={tarefa?.descricao ?? ""} className="input w-full" />
          </div>
          {candidatas.length > 0 && (
            <div className="w-full">
              <label className="mb-1 block text-[10.5px] text-text-faint">Depende de (só começa depois que estas ficarem feitas)</label>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {candidatas.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-[11.5px]">
                    <input type="checkbox" name="depende_de" value={c.id} defaultChecked={dependeDe.includes(c.id)} />
                    <span className={c.status === "feito" ? "text-text-faint line-through" : ""}>{c.titulo}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
