"use client";

import { useState } from "react";
import type { FaseProjeto, Pessoa, Produto, Projeto, Tarefa } from "./tipos";

const rotulo = "mb-0.5 block text-[10px] text-text-faint";

/**
 * Campos compartilhados entre "nova tarefa" e "editar" — em grade de 2 colunas pra caber numa
 * caixinha. Essencial em cima (título, responsável, prazo, projeto, fase); o resto atrás de
 * "mais opções". Fase só lista as do projeto escolhido; "depende de" só tarefas do mesmo projeto.
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
  faseInicial,
  fixarProjeto = false,
  abrirTudo = false,
  comSubtarefas = false,
  modoSubtarefa = false,
}: {
  tarefa?: Tarefa;
  pessoas: Pessoa[];
  produtos: Produto[];
  projetos: Projeto[];
  fases: FaseProjeto[];
  candidatasDependencia: Pick<Tarefa, "id" | "titulo" | "projeto_id" | "status">[];
  dependeDe?: string[];
  projetoInicial?: string | null;
  faseInicial?: string | null;
  /** Subtarefa: o projeto vem da mãe e não muda aqui. */
  fixarProjeto?: boolean;
  abrirTudo?: boolean;
  /** Só na criação da tarefa-mãe: já escrever as subtarefas, uma por linha. */
  comSubtarefas?: boolean;
  /** Subtarefa é item de checklist da tarefa: só título e, no máximo, responsável — sem prazo,
   * projeto, etiqueta ou dependência. Quem tem prazo e projeto é a tarefa. */
  modoSubtarefa?: boolean;
}) {
  const [projetoId, setProjetoId] = useState(tarefa?.projeto_id ?? projetoInicial ?? "");
  const [mais, setMais] = useState(abrirTudo);

  const fasesDoProjeto = fases.filter((f) => f.projeto_id === projetoId);
  const candidatas = candidatasDependencia.filter((c) => c.id !== tarefa?.id && (c.projeto_id ?? "") === (projetoId || ""));

  if (modoSubtarefa) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          name="titulo"
          type="text"
          defaultValue={tarefa?.titulo ?? ""}
          placeholder="Atividade que compõe a tarefa"
          required
          autoFocus
          className="input input-compacto min-w-0 flex-1"
        />
        <select name="responsavel_id" defaultValue={tarefa?.responsavel_id ?? ""} className="input input-compacto w-[110px] shrink-0" title="Responsável (opcional)">
          <option value="">quem?</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome.split(" ")[0]}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
      <div className="col-span-2">
        <input name="titulo" type="text" defaultValue={tarefa?.titulo ?? ""} placeholder="O que precisa ser feito?" required autoFocus className="input input-compacto w-full" />
      </div>
      <div>
        <label className={rotulo}>Responsável</label>
        <select name="responsavel_id" defaultValue={tarefa?.responsavel_id ?? ""} className="input input-compacto w-full">
          <option value="">—</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={rotulo}>Prazo</label>
        <input name="prazo" type="date" defaultValue={tarefa?.prazo ?? ""} className="input input-compacto w-full" />
      </div>
      {fixarProjeto ? (
        <input type="hidden" name="projeto_id" value={projetoId} />
      ) : (
        <div>
          <label className={rotulo}>Projeto</label>
          <select name="projeto_id" value={projetoId} onChange={(e) => setProjetoId(e.target.value)} className="input input-compacto w-full">
            <option value="">Sem projeto</option>
            {projetos
              .filter((p) => p.status === "ativo" || p.id === tarefa?.projeto_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            <option value="__novo">+ Novo projeto…</option>
          </select>
        </div>
      )}
      {projetoId === "__novo" && (
        <div>
          <label className={rotulo}>Nome do projeto novo</label>
          <input name="novo_projeto" type="text" placeholder="Ex: Registro de marca" required className="input input-compacto w-full" />
        </div>
      )}
      {projetoId && fasesDoProjeto.length > 0 && (
        <div>
          <label className={rotulo}>Fase</label>
          <select name="fase_id" defaultValue={tarefa?.fase_id ?? faseInicial ?? ""} className="input input-compacto w-full">
            <option value="">—</option>
            {fasesDoProjeto.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      {pessoas.length > 1 && (
        <div className="col-span-2">
          <label className={rotulo}>Participa junto</label>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {pessoas.map((p) => (
              <label key={p.id} className="flex items-center gap-1 text-[11px]">
                <input type="checkbox" name="participantes" value={p.id} defaultChecked={tarefa?.participantes?.includes(p.id) ?? false} />
                {p.nome.split(" ")[0]}
              </label>
            ))}
          </div>
        </div>
      )}

      {!mais && (
        <button type="button" onClick={() => setMais(true)} className="col-span-2 text-left text-[10.5px] text-text-muted underline">
          mais opções (início, etiquetas, tema, descrição, depende de)
        </button>
      )}

      {mais && (
        <>
          <div>
            <label className={rotulo}>Início</label>
            <input name="data_inicio" type="date" defaultValue={tarefa?.data_inicio ?? ""} className="input input-compacto w-full" />
          </div>
          <div>
            <label className={rotulo}>Etiquetas (vírgula)</label>
            <input name="etiquetas" type="text" defaultValue={tarefa?.etiquetas?.join(", ") ?? ""} placeholder="centelha, jurídico" className="input input-compacto w-full" />
          </div>
          <div>
            <label className={rotulo}>Tema / área</label>
            <input name="area" type="text" defaultValue={tarefa?.area ?? ""} placeholder="opcional" className="input input-compacto w-full" />
          </div>
          {produtos.length > 0 && (
            <div className="col-span-2">
              <label className={rotulo}>Produtos que a tarefa atende</label>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {produtos.map((p) => (
                  <label key={p.id} className="flex items-center gap-1 text-[11px]">
                    <input type="checkbox" name="produtos" value={p.id} defaultChecked={tarefa?.produtos?.includes(p.id) ?? false} />
                    {p.nome}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="col-span-2">
            <label className={rotulo}>Descrição</label>
            <textarea name="descricao" rows={2} defaultValue={tarefa?.descricao ?? ""} className="input input-compacto w-full" />
          </div>
          {comSubtarefas && (
            <div className="col-span-2">
              <label className={rotulo}>Subtarefas (uma por linha)</label>
              <textarea
                name="subtarefas"
                rows={3}
                placeholder={"Levantar documentos\nPreencher formulário\nEnviar ao contador"}
                className="input input-compacto w-full"
              />
              <p className="mt-0.5 text-[10px] text-text-faint">Herdam projeto, fase e responsável desta tarefa — dá pra ajustar cada uma depois.</p>
            </div>
          )}
          {candidatas.length > 0 && (
            <div className="col-span-2">
              <label className={rotulo}>Depende de (só libera depois que estas ficarem feitas)</label>
              <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto">
                {candidatas.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-[11px]">
                    <input type="checkbox" name="depende_de" value={c.id} defaultChecked={dependeDe.includes(c.id)} />
                    <span className={`truncate ${c.status === "feito" ? "text-text-faint line-through" : ""}`}>{c.titulo}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
