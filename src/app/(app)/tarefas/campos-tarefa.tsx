"use client";

import { useState } from "react";
import { BuscaDependencias } from "./busca-dependencias";
import type { CandidataDependencia, FaseProjeto, Pessoa, Produto, Projeto, Tarefa } from "./tipos";

const rotulo = "mb-0.5 block text-[10px] text-text-faint";

/**
 * Campo de data que se digita direto (dd/mm/aaaa), sem o "pulo" entre dia/mês/ano do campo nativo
 * no Mac. Guarda o ISO (aaaa-mm-dd) num input escondido com o mesmo `name` — o formulário continua
 * recebendo o valor igual a antes. ISO só é preenchido quando a data digitada é real.
 */
function CampoData({ name, defaultValue, className }: { name: string; defaultValue?: string | null; className?: string }) {
  const isoParaBR = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
  const [texto, setTexto] = useState(isoParaBR(defaultValue ?? ""));

  function aoDigitar(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 8);
    if (d.length > 4) setTexto(`${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`);
    else if (d.length > 2) setTexto(`${d.slice(0, 2)}/${d.slice(2)}`);
    else setTexto(d);
  }

  const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  let iso = "";
  if (m) {
    const [, dd, mm, aaaa] = m;
    const dt = new Date(`${aaaa}-${mm}-${dd}T00:00:00Z`);
    if (!Number.isNaN(dt.getTime()) && dt.getUTCDate() === Number(dd) && dt.getUTCMonth() + 1 === Number(mm)) iso = `${aaaa}-${mm}-${dd}`;
  }

  return (
    <>
      <input type="hidden" name={name} value={iso} />
      <input type="text" inputMode="numeric" placeholder="dd/mm/aaaa" value={texto} onChange={(e) => aoDigitar(e.target.value)} maxLength={10} className={className} />
    </>
  );
}

/**
 * Campos compartilhados entre "nova tarefa" e "editar" — em grade de 2 colunas pra caber numa
 * caixinha. Ordem (decisão de 16/10/2026): essencial em cima (título, responsável, prazo, projeto,
 * fase), descrição e subtarefas sempre à vista, o resto atrás de "mais opções" e, no fim, "depende
 * de" como busca (tarefa ou subtarefa, por palavra do título) em vez de lista.
 */
export function CamposTarefa({
  tarefa,
  pessoas,
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
  /** Produto deixou de ser campo da tarefa (decisão de 16/10/2026: vai na etiqueta); fica só pra compatibilidade. */
  produtos?: Produto[];
  projetos: Projeto[];
  fases: FaseProjeto[];
  candidatasDependencia: CandidataDependencia[];
  dependeDe?: string[];
  projetoInicial?: string | null;
  faseInicial?: string | null;
  /** Subtarefa: o projeto vem da mãe e não muda aqui. */
  fixarProjeto?: boolean;
  abrirTudo?: boolean;
  /** Só na criação da tarefa-mãe: já escrever as subtarefas, uma por linha. */
  comSubtarefas?: boolean;
  /** Subtarefa é item de checklist da tarefa: título, responsável e prazo opcional (quando o
   * cliente pede data pra uma etapa) — sem projeto, etiqueta ou dependência. */
  modoSubtarefa?: boolean;
}) {
  const [projetoId, setProjetoId] = useState(tarefa?.projeto_id ?? projetoInicial ?? "");
  const [mais, setMais] = useState(abrirTudo);

  const fasesDoProjeto = fases.filter((f) => f.projeto_id === projetoId);

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
        {/* Prazo opcional na atividade: quando o cliente pede uma data só pra aquela etapa. */}
        <CampoData name="prazo" defaultValue={tarefa?.prazo ?? null} className="input input-compacto w-[130px] shrink-0" />
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
        <CampoData name="prazo" defaultValue={tarefa?.prazo ?? null} className="input input-compacto w-full" />
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

      <div className="col-span-2">
        <label className={rotulo}>Descrição (o que você quer dizer com a tarefa, se precisar explicar)</label>
        <textarea name="descricao" rows={2} defaultValue={tarefa?.descricao ?? ""} placeholder="opcional" className="input input-compacto w-full" />
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

      {!mais && (
        <button type="button" onClick={() => setMais(true)} className="col-span-2 text-left text-[10.5px] text-text-muted underline">
          mais opções (início, etiquetas, tema)
        </button>
      )}

      {mais && (
        <>
          <div>
            <label className={rotulo}>Início</label>
            <CampoData name="data_inicio" defaultValue={tarefa?.data_inicio ?? null} className="input input-compacto w-full" />
          </div>
          <div>
            <label className={rotulo}>Etiquetas (vírgula)</label>
            <input name="etiquetas" type="text" defaultValue={tarefa?.etiquetas?.join(", ") ?? ""} placeholder="centelha, jurídico" className="input input-compacto w-full" />
          </div>
          <div>
            <label className={rotulo}>Tema / área</label>
            <input name="area" type="text" defaultValue={tarefa?.area ?? ""} placeholder="opcional" className="input input-compacto w-full" />
          </div>
        </>
      )}

      <div className="col-span-2">
        <label className={rotulo}>Depende de (só libera depois que estas ficarem feitas)</label>
        <BuscaDependencias candidatas={candidatasDependencia} iniciais={dependeDe} excluirId={tarefa?.id} projetoAtual={projetoId === "__novo" ? null : projetoId || null} />
      </div>
    </div>
  );
}
