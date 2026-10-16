"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { criarProjetoRapido, salvarGradeProjeto, type LinhaProjetoRapido, type ProjetoRapidoState } from "./actions";
import type { FaseProdutoOpcao, Pessoa, Projeto } from "./tipos";

/** O que a grade precisa de cada tarefa já existente (só as principais, não as atividades). */
export type TarefaParaGrade = { id: string; titulo: string; responsavel_id: string | null; prazo: string | null; projeto_id: string | null; parent_id: string | null; status: string; ordem: number };

const vazia = (): LinhaProjetoRapido => ({ id: null, titulo: "", responsavel_id: null, prazo: null, depende_de_linha: null });
const rotulo = "mb-0.5 block text-[10px] text-text-faint";
const celula = "input input-compacto w-full";

/** Linhas de um projeto existente: tarefas abertas, na ordem da lista, com "depende de" apontando pra linha certa. */
function linhasDoProjeto(projetoId: string, tarefas: TarefaParaGrade[], dependeDe: Map<string, string[]>): LinhaProjetoRapido[] {
  const abertas = tarefas
    .filter((t) => t.projeto_id === projetoId && !t.parent_id && t.status !== "feito")
    .sort((a, b) => (a.prazo ?? "9999-12-31").localeCompare(b.prazo ?? "9999-12-31") || a.ordem - b.ordem || a.titulo.localeCompare(b.titulo));
  const indice = new Map(abertas.map((t, i) => [t.id, i]));
  return abertas.map((t) => {
    const naGrade = (dependeDe.get(t.id) ?? []).map((d) => indice.get(d)).find((i) => i != null);
    return { id: t.id, titulo: t.titulo, responsavel_id: t.responsavel_id, prazo: t.prazo, depende_de_linha: naGrade ?? null };
  });
}

/**
 * "+ Projeto" no estilo quadro do monday. Em cima, escolhe entre criar um projeto novo ou abrir um
 * que já existe; embaixo, a grade de tarefas — título, responsável, prazo e "depende de" (outra
 * linha). Enter no título pula pra próxima linha. Projeto existente: as tarefas abertas entram na
 * grade pra editar em lote e dá pra acrescentar linhas; o detalhe (descrição, subtarefas,
 * participantes) continua no "editar" de cada tarefa.
 */
export function NovoProjetoRapido({
  pessoas,
  projetos,
  tarefas,
  dependeDe,
  fasesProduto,
  projetoInicial = null,
  aoFechar,
}: {
  pessoas: Pessoa[];
  projetos: Projeto[];
  tarefas: TarefaParaGrade[];
  dependeDe: Map<string, string[]>;
  fasesProduto: FaseProdutoOpcao[];
  projetoInicial?: string | null;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const acao = (prev: ProjetoRapidoState, fd: FormData) => (String(fd.get("projeto_id") || "") ? salvarGradeProjeto(prev, fd) : criarProjetoRapido(prev, fd));
  const [state, formAction, pending] = useActionState<ProjetoRapidoState, FormData>(acao, { error: null });
  const [projetoId, setProjetoId] = useState<string>(projetoInicial ?? "");
  const projeto = projetos.find((p) => p.id === projetoId) ?? null;
  const [linhas, setLinhas] = useState<LinhaProjetoRapido[]>(() => (projetoInicial ? linhasDoProjeto(projetoInicial, tarefas, dependeDe) : [vazia(), vazia(), vazia()]));
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

  const trocarProjeto = (id: string) => {
    setProjetoId(id);
    const novas = id ? linhasDoProjeto(id, tarefas, dependeDe) : [vazia(), vazia(), vazia()];
    setLinhas(novas.length > 0 ? novas : [vazia()]);
  };

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
  const novasLinhas = linhas.filter((l) => !l.id && l.titulo.trim()).length;

  return (
    <div className="basis-full rounded-lg border border-primary-fill bg-surface p-3">
      <form action={formAction} className="flex flex-col gap-2.5">
        <input type="hidden" name="linhas" value={JSON.stringify(linhas)} />
        <input type="hidden" name="projeto_id" value={projetoId} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_2fr_auto]">
          <div>
            <label className={rotulo}>Projeto</label>
            <select value={projetoId} onChange={(e) => trocarProjeto(e.target.value)} className="input input-compacto w-full sm:w-[200px]">
              <option value="">+ Novo projeto</option>
              {projetos
                .filter((p) => p.status === "ativo")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className={rotulo}>{projeto ? "Nome" : "Nome do projeto novo"}</label>
            <input key={projetoId} name="nome" defaultValue={projeto?.nome ?? ""} placeholder="Ex: Comunicação Q4" required autoFocus={!projeto} className={celula} />
          </div>
          <div>
            <label className={rotulo}>Objetivo (opcional)</label>
            <input key={`obj-${projetoId}`} name="objetivo" defaultValue={projeto?.objetivo ?? ""} placeholder="Ex: atingir as metas de conversão da fase de validação" className={celula} />
          </div>
          {!projeto && fasesProduto.length > 0 && (
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
                <tr key={l.id ?? `nova-${i}`} className="align-middle">
                  <td className="py-0.5 pr-1 text-[10px] text-text-faint" title={l.id ? "tarefa já existente" : "linha nova"}>
                    {i + 1}
                    {!l.id && projeto ? "*" : ""}
                  </td>
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
                    {/* Tarefa existente não sai por aqui (pra não apagar sem querer): usa o × do card. */}
                    {!l.id && linhas.length > 1 && (
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
        <p className="text-[10px] text-text-faint">
          {projeto
            ? "Edita título, responsável, prazo e “depende de” das tarefas abertas; * = linha nova. Pra excluir uma tarefa, use o × dela na lista. Linha sem título é ignorada."
            : "Linha sem título é ignorada. Descrição, subtarefas e quem participa você detalha depois, em “editar” na tarefa."}
        </p>

        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className="rounded-md bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60">
            {pending
              ? "…"
              : projeto
                ? `Salvar grade${novasLinhas > 0 ? ` (+${novasLinhas} nova${novasLinhas === 1 ? "" : "s"})` : ""}`
                : preenchidas > 0
                  ? `Criar projeto com ${preenchidas} tarefa${preenchidas === 1 ? "" : "s"}`
                  : "Criar projeto"}
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
