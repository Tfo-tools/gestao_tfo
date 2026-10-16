"use client";

import { useState } from "react";
import type { CandidataDependencia } from "./tipos";

const normalizar = (t: string | null | undefined) => (t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * "Depende de" como busca, não como lista: escolhe se procura tarefa ou subtarefa, escreve uma
 * palavra do título e seleciona. As escolhidas viram fichas (com ×) e vão no formulário como
 * `depende_de`. Procura em qualquer projeto — o projeto da tarefa aparece primeiro, os outros
 * levam o nome do projeto ao lado. Subtarefa aparece como "Mãe › atividade".
 */
export function BuscaDependencias({
  candidatas,
  iniciais = [],
  excluirId,
  projetoAtual,
}: {
  candidatas: CandidataDependencia[];
  iniciais?: string[];
  /** A própria tarefa (na edição) não pode depender dela mesma. */
  excluirId?: string;
  projetoAtual: string | null;
}) {
  const [tipo, setTipo] = useState<"tarefa" | "subtarefa">("tarefa");
  const [termo, setTermo] = useState("");
  const [selecionadas, setSelecionadas] = useState<string[]>(iniciais);

  const termos = normalizar(termo).split(/\s+/).filter(Boolean);
  const porId = new Map(candidatas.map((c) => [c.id, c]));
  const mesmoProjeto = (c: CandidataDependencia) => (c.projeto_id ?? "") === (projetoAtual ?? "");
  const rotulo = (c: CandidataDependencia) => (c.mae_titulo ? `${c.mae_titulo} › ${c.titulo}` : c.titulo);

  const resultados =
    termos.length === 0
      ? []
      : candidatas
          .filter((c) => c.id !== excluirId && !selecionadas.includes(c.id) && (tipo === "subtarefa" ? !!c.parent_id : !c.parent_id))
          .filter((c) => termos.every((t) => normalizar(c.titulo).includes(t) || normalizar(c.mae_titulo).includes(t)))
          .sort(
            (a, b) =>
              Number(mesmoProjeto(b)) - Number(mesmoProjeto(a)) ||
              Number(a.status === "feito") - Number(b.status === "feito") ||
              a.titulo.localeCompare(b.titulo),
          )
          .slice(0, 8);

  return (
    <div className="flex flex-col gap-1">
      {selecionadas.map((id) => (
        <input key={id} type="hidden" name="depende_de" value={id} />
      ))}
      {selecionadas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selecionadas.map((id) => {
            const c = porId.get(id);
            return (
              <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10.5px] text-text">
                <span className="truncate" title={c ? rotulo(c) : id}>
                  ⏳ {c ? rotulo(c) : "tarefa"}
                </span>
                <button type="button" onClick={() => setSelecionadas((s) => s.filter((x) => x !== id))} title="Tirar dependência" className="text-text-faint hover:text-danger">
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as "tarefa" | "subtarefa")} className="input input-compacto w-[104px] shrink-0" title="Procurar tarefa ou subtarefa">
          <option value="tarefa">tarefa</option>
          <option value="subtarefa">subtarefa</option>
        </select>
        <input
          type="text"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            // Enter escolhe o primeiro resultado em vez de enviar o formulário inteiro.
            if (e.key === "Enter") {
              e.preventDefault();
              if (resultados[0]) {
                setSelecionadas((s) => [...s, resultados[0].id]);
                setTermo("");
              }
            }
            if (e.key === "Escape") setTermo("");
          }}
          placeholder="escreva uma palavra do título e escolha…"
          className="input input-compacto min-w-0 flex-1"
        />
      </div>
      {termos.length > 0 && (
        <div className="flex max-h-36 flex-col overflow-y-auto rounded-md border border-border-soft bg-surface">
          {resultados.length === 0 ? (
            <p className="px-2 py-1.5 text-[10.5px] text-text-faint">Nenhuma {tipo} com “{termo.trim()}”.</p>
          ) : (
            resultados.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelecionadas((s) => [...s, c.id]);
                  setTermo("");
                }}
                className="flex items-center gap-1.5 px-2 py-1 text-left text-[11px] hover:bg-bg"
              >
                <span className={`min-w-0 flex-1 truncate ${c.status === "feito" ? "text-text-faint line-through" : ""}`}>{rotulo(c)}</span>
                {!mesmoProjeto(c) && <span className="shrink-0 rounded-full bg-wine-soft px-1.5 py-0.5 text-[9.5px] text-wine">{c.projeto_nome ?? "sem projeto"}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
