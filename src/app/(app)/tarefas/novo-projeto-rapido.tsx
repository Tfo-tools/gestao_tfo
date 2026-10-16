"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { criarProjetoRapido, excluirTarefa, salvarGradeProjeto, type LinhaProjetoRapido, type ProjetoRapidoState } from "./actions";
import { TarefaModal } from "./tarefa-modal";
import type { DadosFormulario } from "./tarefa-card";
import { CHAVE_COLUNAS_GRADE, COLUNAS_GRADE, COLUNAS_PADRAO, ROTULO_COLUNA, type ColunaGrade } from "./grade-colunas";
import { STATUS_LABEL, STATUS_ORDEM, type FaseProjeto, type Pessoa, type Projeto, type TarefaNo } from "./tipos";

/** O que a grade precisa de cada tarefa já existente (só as principais, não as atividades). */
export type TarefaParaGrade = {
  id: string;
  titulo: string;
  responsavel_id: string | null;
  prazo: string | null;
  data_inicio: string | null;
  fase_id: string | null;
  status: string;
  etiquetas: string[];
  area: string | null;
  descricao: string | null;
  projeto_id: string | null;
  parent_id: string | null;
  ordem: number;
};

const vazia = (): LinhaProjetoRapido => ({ id: null, titulo: "", responsavel_id: null, prazo: null, depende_de_linha: null, data_inicio: null, fase_id: null, status: "a_fazer", etiquetas: "", area: "", descricao: "", projeto_id: null });
const rotulo = "mb-0.5 block text-[10px] text-text-faint";
const celula = "input input-compacto w-full";
const LARGURA: Record<ColunaGrade, string> = { responsavel: "w-[120px]", prazo: "w-[130px]", depende: "w-[170px]", inicio: "w-[130px]", fase: "w-[130px]", status: "w-[100px]", etiquetas: "w-[150px]", area: "w-[130px]", descricao: "w-[220px]", projeto: "w-[160px]" };

/** Linhas de um projeto existente: tarefas abertas, na ordem da lista, com "depende de" apontando pra linha certa. */
function linhasDoProjeto(projetoId: string, tarefas: TarefaParaGrade[], dependeDe: Map<string, string[]>): LinhaProjetoRapido[] {
  const abertas = tarefas
    .filter((t) => t.projeto_id === projetoId && !t.parent_id && t.status !== "feito")
    .sort((a, b) => (a.prazo ?? "9999-12-31").localeCompare(b.prazo ?? "9999-12-31") || a.ordem - b.ordem || a.titulo.localeCompare(b.titulo));
  const indice = new Map(abertas.map((t, i) => [t.id, i]));
  return abertas.map((t) => {
    const naGrade = (dependeDe.get(t.id) ?? []).map((d) => indice.get(d)).find((i) => i != null);
    return {
      id: t.id,
      titulo: t.titulo,
      responsavel_id: t.responsavel_id,
      prazo: t.prazo,
      depende_de_linha: naGrade ?? null,
      data_inicio: t.data_inicio,
      fase_id: t.fase_id,
      status: t.status,
      etiquetas: t.etiquetas.join(", "),
      area: t.area ?? "",
      descricao: t.descricao ?? "",
      projeto_id: t.projeto_id,
    };
  });
}

function lerColunasGuardadas(): ColunaGrade[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_COLUNAS_GRADE) ?? "null");
    if (Array.isArray(salvo)) return salvo.filter((c): c is ColunaGrade => COLUNAS_GRADE.includes(c));
  } catch {
    /* sem localStorage ou valor inválido: usa o padrão */
  }
  return COLUNAS_PADRAO;
}

/**
 * "+ Projeto / grade" no estilo quadro do monday. Em cima, escolhe entre criar um projeto novo ou
 * abrir um que já existe; depois, quais colunas quer ver (a escolha fica no navegador); embaixo,
 * a grade. Enter no título pula pra próxima linha. Só as colunas ligadas são gravadas.
 */
export function NovoProjetoRapido({
  pessoas,
  projetos,
  fases,
  tarefas,
  dependeDe,
  nos,
  dados,
  projetoInicial = null,
  aoFechar,
}: {
  pessoas: Pessoa[];
  projetos: Projeto[];
  fases: FaseProjeto[];
  tarefas: TarefaParaGrade[];
  dependeDe: Map<string, string[]>;
  /** Árvore completa por id, pro ⤢ abrir a tarefa inteira no pop-up. */
  nos: Record<string, TarefaNo>;
  dados: DadosFormulario;
  projetoInicial?: string | null;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const acao = (prev: ProjetoRapidoState, fd: FormData) => (String(fd.get("projeto_id") || "") ? salvarGradeProjeto(prev, fd) : criarProjetoRapido(prev, fd));
  const [state, formAction, pending] = useActionState<ProjetoRapidoState, FormData>(acao, { error: null });
  const [projetoId, setProjetoId] = useState<string>(projetoInicial ?? "");
  const projeto = projetos.find((p) => p.id === projetoId) ?? null;
  const [linhas, setLinhas] = useState<LinhaProjetoRapido[]>(() => (projetoInicial ? linhasDoProjeto(projetoInicial, tarefas, dependeDe) : [vazia(), vazia(), vazia()]));
  const [colunas, setColunas] = useState<ColunaGrade[]>(COLUNAS_PADRAO);
  const [escolhendoColunas, setEscolhendoColunas] = useState(false);
  const [popup, setPopup] = useState<string | null>(null);
  const [erroLinha, setErroLinha] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const titulos = useRef<(HTMLInputElement | null)[]>([]);
  const focarDepois = useRef<number | null>(null);

  // Preferência de colunas vem do navegador depois de montar (no servidor não existe localStorage).
  useEffect(() => {
    const guardadas = lerColunasGuardadas();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do localStorage ao montar
    setColunas(guardadas);
  }, []);

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

  const alternarColuna = (c: ColunaGrade) => {
    const novas = colunas.includes(c) ? colunas.filter((x) => x !== c) : COLUNAS_GRADE.filter((x) => x === c || colunas.includes(x));
    setColunas(novas);
    try {
      localStorage.setItem(CHAVE_COLUNAS_GRADE, JSON.stringify(novas));
    } catch {
      /* navegador sem armazenamento: a escolha vale só nesta abertura */
    }
  };
  // Fase só existe em projeto já criado; sem projeto a coluna fica indisponível.
  const fasesDoProjeto = projeto ? fases.filter((f) => f.projeto_id === projeto.id) : [];
  const visiveis = colunas.filter((c) => (c !== "fase" || fasesDoProjeto.length > 0) && (c !== "projeto" || !!projeto));

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
        if (campo === "titulo" || campo === "etiquetas" || campo === "area" || campo === "descricao" || campo === "status") return { ...l, [campo]: valor };
        if (campo === "projeto_id") return { ...l, projeto_id: valor || projetoId || null };
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
  // Tarefa existente sai da grade E do app (com a trava de anexo do servidor).
  const excluirExistente = (l: LinhaProjetoRapido, i: number) => {
    if (!l.id) return remover(i);
    const no = nos[l.id];
    const aviso = no && no.filhas.length > 0 ? `Excluir “${l.titulo}” e suas ${no.filhas.length} subtarefa(s)?` : `Excluir “${l.titulo}”?`;
    if (!confirm(aviso)) return;
    setErroLinha(null);
    setExcluindo(l.id);
    excluirTarefa(l.id).then((r) => {
      setExcluindo(null);
      if (r.error) setErroLinha(r.error);
      else remover(i);
    });
  };
  const preenchidas = linhas.filter((l) => l.titulo.trim()).length;
  const novasLinhas = linhas.filter((l) => !l.id && l.titulo.trim()).length;

  const celulaDe = (c: ColunaGrade, l: LinhaProjetoRapido, i: number) => {
    switch (c) {
      case "responsavel":
        return (
          <select value={l.responsavel_id ?? ""} onChange={(e) => mudar(i, "responsavel_id", e.target.value)} className={celula}>
            <option value="">quem?</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome.split(" ")[0]}
              </option>
            ))}
          </select>
        );
      case "prazo":
        return <input type="date" value={l.prazo ?? ""} onChange={(e) => mudar(i, "prazo", e.target.value)} className={celula} />;
      case "inicio":
        return <input type="date" value={l.data_inicio ?? ""} onChange={(e) => mudar(i, "data_inicio", e.target.value)} className={celula} />;
      case "depende":
        return (
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
        );
      case "fase":
        return (
          <select value={l.fase_id ?? ""} onChange={(e) => mudar(i, "fase_id", e.target.value)} className={celula}>
            <option value="">—</option>
            {fasesDoProjeto.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        );
      case "status":
        return (
          <select value={l.status ?? "a_fazer"} onChange={(e) => mudar(i, "status", e.target.value)} className={celula}>
            {STATUS_ORDEM.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        );
      case "etiquetas":
        return <input value={l.etiquetas ?? ""} onChange={(e) => mudar(i, "etiquetas", e.target.value)} placeholder="a, b" className={celula} />;
      case "area":
        return <input value={l.area ?? ""} onChange={(e) => mudar(i, "area", e.target.value)} placeholder="opcional" className={celula} />;
      case "descricao":
        return <input value={l.descricao ?? ""} onChange={(e) => mudar(i, "descricao", e.target.value)} placeholder="o que você quer dizer com a tarefa" className={celula} />;
      case "projeto":
        return l.id ? (
          <select value={l.projeto_id ?? projetoId} onChange={(e) => mudar(i, "projeto_id", e.target.value)} className={`${celula} ${l.projeto_id && l.projeto_id !== projetoId ? "border-warning" : ""}`} title="Mover a tarefa (e suas subtarefas) pra outro projeto">
            {projetos
              .filter((p) => p.status === "ativo" || p.id === l.projeto_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </select>
        ) : (
          <span className="text-[10px] text-text-faint">este projeto</span>
        );
    }
  };

  return (
    <div className="basis-full rounded-lg border border-primary-fill bg-surface p-3">
      <form action={formAction} className="flex flex-col gap-2.5">
        <input type="hidden" name="linhas" value={JSON.stringify(linhas)} />
        <input type="hidden" name="colunas" value={JSON.stringify(visiveis)} />
        <input type="hidden" name="projeto_id" value={projetoId} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_2fr]">
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
        </div>

        {/* Escolha de colunas: o que você quer preencher ou editar rápido. Fica guardado no navegador. */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
          <span className="text-text-faint">Colunas:</span>
          {visiveis.map((c) => (
            <span key={c} className="rounded-full bg-wine-soft px-2 py-0.5 text-wine">
              {ROTULO_COLUNA[c]}
            </span>
          ))}
          <button type="button" onClick={() => setEscolhendoColunas((v) => !v)} className="text-text-muted underline">
            {escolhendoColunas ? "pronto" : "escolher colunas"}
          </button>
        </div>
        {escolhendoColunas && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-border-soft bg-bg px-2.5 py-1.5 text-[11px]">
            {COLUNAS_GRADE.map((c) => {
              const indisponivel = c === "fase" && fasesDoProjeto.length === 0;
              return (
                <label key={c} className={`flex items-center gap-1 ${indisponivel ? "opacity-50" : ""}`} title={indisponivel ? "Fase só em projeto já criado e com fases" : undefined}>
                  <input type="checkbox" checked={colunas.includes(c)} disabled={indisponivel} onChange={() => alternarColuna(c)} />
                  {ROTULO_COLUNA[c]}
                </label>
              );
            })}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[11.5px]">
            <thead>
              <tr className="text-left text-[10px] text-text-faint">
                <th className="w-6 pb-1 pr-1 font-medium">#</th>
                <th className="pb-1 pr-2 font-medium">Tarefa</th>
                {visiveis.map((c) => (
                  <th key={c} className={`${LARGURA[c]} pb-1 pr-2 font-medium`}>
                    {ROTULO_COLUNA[c]}
                  </th>
                ))}
                <th className="w-12 pb-1" />
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
                  {visiveis.map((c) => (
                    <td key={c} className="py-0.5 pr-2">
                      {celulaDe(c, l, i)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap py-0.5 text-right">
                    {l.id && nos[l.id] && (
                      <button type="button" onClick={() => setPopup(l.id!)} title="Abrir a tarefa completa em uma janela" className="mr-1 text-[12px] text-text-faint hover:text-primary-deep">
                        ⤢
                      </button>
                    )}
                    {(l.id || linhas.length > 1) && (
                      <button
                        type="button"
                        disabled={excluindo === l.id}
                        onClick={() => excluirExistente(l, i)}
                        title={l.id ? "Excluir a tarefa (bloqueado se tiver anexo)" : "Tirar linha"}
                        className="text-[12px] text-text-faint hover:text-danger disabled:opacity-50"
                      >
                        {excluindo === l.id ? "…" : "×"}
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
            ? "Só as colunas ligadas são gravadas; o resto da tarefa fica como está. * = linha nova. ⤢ abre a tarefa completa; × exclui na hora (tarefa com anexo não é excluída). Linha sem título é ignorada."
            : "Linha sem título é ignorada. Subtarefas e quem participa você detalha depois, em “editar” na tarefa."}
        </p>
        {erroLinha && <p className="text-[11px] text-danger">{erroLinha}</p>}

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
      {popup && nos[popup] && <TarefaModal no={nos[popup]} dados={dados} dependeDe={dependeDe} aoFechar={() => setPopup(null)} />}
    </div>
  );
}
