"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { criarProjetoRapido, type LinhaProjetoRapido, type ProjetoRapidoState } from "./actions";
import type { FaseProdutoOpcao, Pessoa } from "./tipos";

const vazia = (): LinhaProjetoRapido => ({ titulo: "", responsavel_id: null, prazo: null, depende_de_linha: null });
const rotulo = "mb-0.5 block text-[10px] text-text-faint";
const celula = "input input-compacto w-full";

/**
 * "+ Projeto" no estilo quadro do monday: nome do projeto e uma grade pra escrever as tarefas em
 * sequência — título, responsável, prazo e "depende de" (outra linha da grade). Enter no título
 * pula pra próxima linha (cria uma nova no fim). Ao criar, abre o projeto na lista; o detalhe
 * (descrição, subtarefas, participantes) é feito depois, tarefa a tarefa, no "editar".
 */
export function NovoProjetoRapido({ pessoas, fasesProduto, aoFechar }: { pessoas: Pessoa[]; fasesProduto: FaseProdutoOpcao[]; aoFechar: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ProjetoRapidoState, FormData>(criarProjetoRapido, { error: null });
  const [linhas, setLinhas] = useState<LinhaProjetoRapido[]>([vazia(), vazia(), vazia()]);
  const titulos = useRef<(HTMLInputElement | null)[]>([]);
  const focarDepois = useRef<number | null>(null);

  useEffect(() => {
    if (state.success && state.projetoId) {
      router.push(`/tarefas?projeto=${state.projetoId}`);
      aoFechar();
    }
  }, [state, router, aoFechar]);

  useEffect(() => {
    if (focarDepois.current != null) {
      titulos.current[focarDepois.current]?.focus();
      focarDepois.current = null;
    }
  }, [linhas.length]);

  const mudar = (i: number, campo: keyof LinhaProjetoRapido, valor: string) =>
    setLinhas((ls) =>
      ls.map((l, k) => {
        if (k !== i) return l;
        if (campo === "depende_de_linha") return { ...l, depende_de_linha: valor === "" ? null : Number(valor) };
        if (campo === "titulo") return { ...l, titulo: valor };
        return { ...l, [campo]: valor || null };
      }),
    );
  const adicionar = () => {
    focarDepois.current = linhas.length;
    setLinhas((ls) => [...ls, vazia()]);
  };
  const remover = (i: number) =>
    setLinhas((ls) =>
      ls
        .filter((_, k) => k !== i)
        // Quem dependia da linha tirada perde a dependência; quem dependia de linhas abaixo reindexa.
        .map((l) => ({ ...l, depende_de_linha: l.depende_de_linha == null || l.depende_de_linha === i ? null : l.depende_de_linha > i ? l.depende_de_linha - 1 : l.depende_de_linha })),
    );
  const preenchidas = linhas.filter((l) => l.titulo.trim()).length;

  return (
    <div className="basis-full rounded-lg border border-primary-fill bg-surface p-3">
      <form action={formAction} className="flex flex-col gap-2.5">
        <input type="hidden" name="linhas" value={JSON.stringify(linhas)} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <div>
            <label className={rotulo}>Novo projeto</label>
            <input name="nome" placeholder="Ex: Comunicação Q4" required autoFocus className={celula} />
          </div>
          <div>
            <label className={rotulo}>Objetivo (opcional)</label>
            <input name="objetivo" placeholder="Ex: atingir as metas de conversão da fase de validação" className={celula} />
          </div>
          {fasesProduto.length > 0 && (
            <div>
              <label className={rotulo}>Serve à fase de produto</label>
              <select name="produto_fase_id" className="input input-compacto w-full sm:w-[180px]">
                <option value="">—</option>
                {fasesProduto.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[11.5px]">
            <thead>
              <tr className="text-left text-[10px] text-text-faint">
                <th className="w-6 pb-1 pr-1 font-medium">#</th>
                <th className="pb-1 pr-2 font-medium">Tarefa</th>
                <th className="w-[130px] pb-1 pr-2 font-medium">Responsável</th>
                <th className="w-[130px] pb-1 pr-2 font-medium">Prazo</th>
                <th className="w-[180px] pb-1 pr-2 font-medium">Depende de</th>
                <th className="w-6 pb-1" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className="align-middle">
                  <td className="py-0.5 pr-1 text-[10px] text-text-faint">{i + 1}</td>
                  <td className="py-0.5 pr-2">
                    <input
                      ref={(el) => {
                        titulos.current[i] = el;
                      }}
                      value={l.titulo}
                      onChange={(e) => mudar(i, "titulo", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        if (i === linhas.length - 1) adicionar();
                        else titulos.current[i + 1]?.focus();
                      }}
                      placeholder={i === 0 ? "O que precisa ser feito? (Enter pula pra próxima linha)" : "próxima tarefa…"}
                      className={celula}
                    />
                  </td>
                  <td className="py-0.5 pr-2">
                    <select value={l.responsavel_id ?? ""} onChange={(e) => mudar(i, "responsavel_id", e.target.value)} className={celula}>
                      <option value="">quem?</option>
                      {pessoas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome.split(" ")[0]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-0.5 pr-2">
                    <input type="date" value={l.prazo ?? ""} onChange={(e) => mudar(i, "prazo", e.target.value)} className={celula} />
                  </td>
                  <td className="py-0.5 pr-2">
                    <select value={l.depende_de_linha ?? ""} onChange={(e) => mudar(i, "depende_de_linha", e.target.value)} className={celula} title="Só começa depois que esta linha ficar feita">
                      <option value="">—</option>
                      {linhas.map((o, k) =>
                        k === i || !o.titulo.trim() ? null : (
                          <option key={k} value={k}>
                            {k + 1}. {o.titulo.length > 28 ? o.titulo.slice(0, 26) + "…" : o.titulo}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                  <td className="py-0.5 text-right">
                    {linhas.length > 1 && (
                      <button type="button" onClick={() => remover(i)} title="Tirar linha" className="text-[12px] text-text-faint hover:text-danger">
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={adicionar} className="self-start text-[10.5px] text-text-muted underline">
          + linha
        </button>
        <p className="text-[10px] text-text-faint">Linha sem título é ignorada. Descrição, subtarefas e quem participa você detalha depois, em “editar” na tarefa.</p>

        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className="rounded-md bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60">
            {pending ? "…" : preenchidas > 0 ? `Criar projeto com ${preenchidas} tarefa${preenchidas === 1 ? "" : "s"}` : "Criar projeto"}
          </button>
          <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 text-[11.5px] text-text-muted">
            Fechar
          </button>
        </div>
        {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
      </form>
    </div>
  );
}
