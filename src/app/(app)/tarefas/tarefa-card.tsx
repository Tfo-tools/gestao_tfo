"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useAcaoEdicao } from "@/lib/use-acao-edicao";
import { atualizarTarefa, criarTarefa, mudarStatusTarefa, excluirTarefa, tornarAtividadeDe, type TarefaFormState } from "./actions";
import { CamposTarefa } from "./campos-tarefa";
import { useCardAberto } from "./cards-contexto";
import { achatar, STATUS_LABEL, STATUS_ORDEM, type AnexoTarefa, type FaseProjeto, type Pessoa, type Produto, type Projeto, type Tarefa, type TarefaNo } from "./tipos";
import { AnexosTarefa } from "./anexos-tarefa";

export type DadosFormulario = {
  pessoas: Pessoa[];
  produtos: Produto[];
  projetos: Projeto[];
  fases: FaseProjeto[];
  candidatasDependencia: Pick<Tarefa, "id" | "titulo" | "projeto_id" | "status">[];
  /** Arquivos por tarefa (anexos_tarefa), pra caixinha mostrar sem buscar de novo. */
  anexos: Map<string, AnexoTarefa[]>;
};

const initialState: TarefaFormState = { error: null };

function fmt(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const botaoPrimario = "rounded-md bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60";
const botaoSecundario = "rounded-md border border-border px-3 py-1.5 text-[11.5px] text-text-muted";

/** Formulário de edição (tarefa ou subtarefa) — mesmo bloco de campos, dentro da caixinha. */
function FormEdicao({ tarefa, dados, dependeDe, aoFechar }: { tarefa: TarefaNo; dados: DadosFormulario; dependeDe: string[]; aoFechar: () => void }) {
  const [state, formAction, pending] = useAcaoEdicao(atualizarTarefa, initialState, aoFechar);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={tarefa.id} />
      <input type="hidden" name="parent_id" value={tarefa.parent_id ?? ""} />
      <CamposTarefa
        tarefa={tarefa}
        pessoas={dados.pessoas}
        produtos={dados.produtos}
        projetos={dados.projetos}
        fases={dados.fases}
        candidatasDependencia={dados.candidatasDependencia}
        dependeDe={dependeDe}
        fixarProjeto={!!tarefa.parent_id}
        abrirTudo
        modoSubtarefa={!!tarefa.parent_id}
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={botaoPrimario}>
          {pending ? "…" : "Salvar"}
        </button>
        <button type="button" onClick={aoFechar} className={botaoSecundario}>
          Cancelar
        </button>
      </div>
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

/**
 * Caixinha tracejada "+ Nova tarefa". Fechada, ocupa uma linha; aberta, vira o formulário
 * compacto. Com `parentId` é a subtarefa inline (só título + responsável + prazo importam).
 */
export function NovaTarefaCard({
  dados,
  projetoInicial,
  faseInicial,
  parentId,
  rotulo = "+ Nova tarefa",
  aoConcluir,
  compacto = false,
}: {
  dados: DadosFormulario;
  projetoInicial?: string | null;
  faseInicial?: string | null;
  parentId?: string;
  rotulo?: string;
  aoConcluir?: () => void;
  /** Ícone pequeno (+) no canto da tela, em vez do botão largo na lista. */
  compacto?: boolean;
}) {
  const [aberto, setAberto] = useState(!!parentId);
  const [state, formAction, pending] = useActionState(criarTarefa, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const fechar = () => {
    setAberto(false);
    aoConcluir?.();
  };

  if (!aberto) {
    if (compacto) {
      return (
        <button
          type="button"
          onClick={() => setAberto(true)}
          title="Nova tarefa"
          aria-label="Nova tarefa"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wine-deep text-[18px] leading-none text-white hover:opacity-90"
        >
          +
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex h-full min-h-[44px] w-full items-center justify-center self-stretch rounded-lg border border-dashed border-border text-[12px] text-text-muted hover:border-primary-fill hover:text-primary-deep"
      >
        {rotulo}
      </button>
    );
  }

  return (
    <div className={`rounded-lg border border-primary-fill bg-surface p-3 ${compacto ? "basis-full" : ""}`}>
      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
          // Subtarefa: o formulário fica aberto pra escrever a próxima em seguida (uma atividade por
          // "Adicionar"); fecha só no botão. Antes fechava a cada uma — parecia que só 1 tinha entrado.
          formRef.current?.querySelector<HTMLInputElement>("input[name=titulo]")?.focus();
        }}
        className="flex flex-col gap-2"
      >
        {parentId && <input type="hidden" name="parent_id" value={parentId} />}
        <CamposTarefa
          pessoas={dados.pessoas}
          produtos={dados.produtos}
          projetos={dados.projetos}
          fases={dados.fases}
          candidatasDependencia={dados.candidatasDependencia}
          projetoInicial={projetoInicial}
          faseInicial={faseInicial}
          fixarProjeto={!!parentId}
          comSubtarefas={!parentId}
          // Subtarefa é item de checklist: só título + quem faz. Sem a lista "depende de" (que é
          // entre tarefas e listava todas as do projeto embaixo do campo).
          modoSubtarefa={!!parentId}
        />
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className={botaoPrimario}>
            {pending ? "…" : parentId ? "Adicionar atividade" : "Adicionar"}
          </button>
          <button type="button" onClick={fechar} className={botaoSecundario}>
            Fechar
          </button>
        </div>
        {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
      </form>
    </div>
  );
}

/** Item do checklist da tarefa: caixa de feito, título e, no máximo, um responsável. Sem prazo e
 * sem projeto — isso é da tarefa. Também não cria outro nível: a lista é plana de propósito. */
function SubLinha({ no, nivel, dados, dependeDe }: { no: TarefaNo; nivel: number; dados: DadosFormulario; dependeDe: Map<string, string[]> }) {
  const [editando, setEditando] = useState(false);
  const [isPending, startTransition] = useTransition();
  const feita = no.status === "feito";
  const resp = dados.pessoas.find((p) => p.id === no.responsavel_id);

  if (editando) {
    return (
      <div className="rounded-md border border-primary-fill bg-primary-soft/20 p-2" style={{ marginLeft: `${nivel * 14}px` }}>
        <FormEdicao tarefa={no} dados={dados} dependeDe={dependeDe.get(no.id) ?? []} aoFechar={() => setEditando(false)} />
      </div>
    );
  }

  return (
    <>
      <div className="group flex items-center gap-1.5 text-[11.5px]" style={{ marginLeft: `${nivel * 14}px` }}>
        <input
          type="checkbox"
          checked={feita}
          disabled={isPending}
          onChange={(e) => {
            const novo = e.target.checked ? "feito" : "a_fazer";
            startTransition(async () => {
              await mudarStatusTarefa(no.id, novo);
            });
          }}
          className="accent-wine"
        />
        <span className={`min-w-0 flex-1 truncate ${feita ? "text-text-faint line-through" : no.aguardando.length > 0 ? "text-text-muted" : ""}`} title={no.titulo}>
          {no.titulo}
          {no.aguardando.length > 0 && !feita && <span title={`Aguarda: ${no.aguardando.map((a) => a.titulo).join(", ")}`}> ⏳</span>}
        </span>
        {resp && <span className="shrink-0 text-[10px] text-text-faint">{resp.nome.split(" ")[0]}</span>}
        <span className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
          <button type="button" onClick={() => setEditando(true)} className="text-[10.5px] text-primary-deep">
            editar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!confirm("Excluir essa subtarefa?")) return;
              startTransition(async () => {
                await excluirTarefa(no.id);
              });
            }}
            className="text-[10.5px] text-danger"
          >
            ×
          </button>
        </span>
      </div>
      {no.filhas.map((f) => (
        <SubLinha key={f.id} no={f} nivel={nivel + 1} dados={dados} dependeDe={dependeDe} />
      ))}
    </>
  );
}

/**
 * A caixinha da tarefa. Aberta mostra tudo; recolhida só título + prazo + quem. Clicar no
 * título alterna; "recolher tudo / abrir tudo" (cards-contexto) muda todos de uma vez.
 */
export function TarefaCard({
  no,
  dados,
  dependeDe,
  mostrarFase = true,
  mostrarProjeto = false,
  emQuadro = false,
  destaque = false,
}: {
  no: TarefaNo;
  dados: DadosFormulario;
  dependeDe: Map<string, string[]>;
  mostrarFase?: boolean;
  mostrarProjeto?: boolean;
  /** Coluna estreita do Quadro: título inteiro em cima, projeto/quem/prazo embaixo (em vez de tudo numa linha). */
  emQuadro?: boolean;
  /** Chegou por link direto (?tarefa=id): nasce aberta, destacada e rola até ela. */
  destaque?: boolean;
}) {
  const [aberto, alternarAberto] = useCardAberto(destaque);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (destaque) raiz.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [destaque]);
  // Link da tarefa: no celular abre a folha de compartilhar (WhatsApp etc.); no computador copia.
  const compartilhar = async () => {
    const url = `${window.location.origin}/tarefas?tarefa=${no.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: no.titulo, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2000);
    } catch {
      /* cancelou a folha de compartilhar ou sem permissão de área de transferência */
    }
  };
  const [editando, setEditando] = useState(false);
  const [novaSub, setNovaSub] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const [erroLinha, setErroLinha] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const responsavel = dados.pessoas.find((p) => p.id === no.responsavel_id);
  const participantes = dados.pessoas.filter((p) => no.participantes.includes(p.id) && p.id !== no.responsavel_id);
  const produtosDaTarefa = dados.produtos.filter((p) => no.produtos.includes(p.id));
  const fase = dados.fases.find((f) => f.id === no.fase_id);
  const projeto = dados.projetos.find((p) => p.id === no.projeto_id);
  const hoje = new Date().toISOString().slice(0, 10);
  const feita = no.status === "feito";
  const atrasada = !feita && !!no.prazo && no.prazo < hoje;
  const hojeVence = !feita && no.prazo === hoje;
  const bloqueada = !feita && no.aguardando.length > 0;
  const primeiro = (nome: string) => nome.split(" ")[0];
  const quem = [responsavel && primeiro(responsavel.nome), ...participantes.map((p) => primeiro(p.nome))].filter(Boolean).join(" + ");

  if (editando) {
    return (
      <div className="rounded-lg border border-primary-fill bg-surface p-3">
        <FormEdicao tarefa={no} dados={dados} dependeDe={dependeDe.get(no.id) ?? []} aoFechar={() => setEditando(false)} />
      </div>
    );
  }

  const corPrazo = atrasada ? "font-semibold text-danger" : hojeVence ? "font-semibold text-primary-deep" : "text-text-faint";
  const diasAtraso = atrasada && no.prazo ? Math.round((new Date(hoje + "T00:00:00").getTime() - new Date(no.prazo + "T00:00:00").getTime()) / 86400000) : 0;
  const textoPrazo = no.prazo ? (atrasada ? `${diasAtraso} dia${diasAtraso === 1 ? "" : "s"} atrás` : hojeVence ? "hoje" : fmt(no.prazo)) : "";

  const libera = feita ? [] : no.libera;
  const todasFilhas = achatar(no.filhas).map((f) => f.no);
  const contagemFilhas = todasFilhas.length > 0 ? `${todasFilhas.filter((f) => f.status === "feito").length}/${todasFilhas.length}` : null;

  return (
    <div
      ref={raiz}
      data-tarefa={no.id}
      data-aguarda={no.aguardando.map((a) => a.id).join(",")}
      data-libera={libera.map((l) => l.id).join(",")}
      className={`card-tarefa flex flex-col rounded-lg border ${
        feita ? "border-border-soft bg-bg opacity-60" : bloqueada ? "border-warning bg-warning-soft/40" : no.status === "fazendo" ? "border-primary-fill bg-surface" : "border-border-soft bg-surface"
      } ${atrasada ? "border-l-[3px] border-l-danger" : ""} ${destaque ? "ring-2 ring-primary-fill ring-offset-2 ring-offset-bg" : ""}`}
    >
      {/* Cabeçalho: UMA linha — caixa de feito, título, projeto, quem, prazo. Clicar no título abre
          o detalhe (só desta tarefa). Atrasada ganha a faixa vermelha na borda esquerda. */}
      <div className="flex w-full items-center gap-2 px-2.5 py-1.5">
        <input
          type="checkbox"
          checked={feita}
          disabled={isPending}
          title={feita ? "Reabrir" : "Marcar como feita"}
          onChange={(e) => {
            const novo = e.target.checked ? "feito" : "a_fazer";
            startTransition(async () => {
              await mudarStatusTarefa(no.id, novo);
            });
          }}
          className="accent-wine"
        />
        <button type="button" onClick={alternarAberto} className={`flex min-w-0 flex-1 text-left ${emQuadro ? "flex-col items-stretch gap-0.5" : "items-center gap-2"}`}>
          <span className={`min-w-0 text-[12.5px] font-medium leading-snug ${emQuadro ? "line-clamp-2" : "flex-1 truncate"} ${feita ? "line-through" : ""}`} title={no.titulo}>
            {no.titulo}
            {bloqueada && <span title={`Aguarda: ${no.aguardando.map((a) => a.titulo).join(", ")}`}> ⏳</span>}
            {libera.length > 0 && <span title={`Libera: ${libera.map((l) => l.titulo).join(", ")}`}> 🔓</span>}
            {contagemFilhas && <span className="font-normal text-text-faint"> · {contagemFilhas}</span>}
          </span>
          {emQuadro ? (
            (projeto && mostrarProjeto) || quem || textoPrazo ? (
              <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-text-faint">
                {mostrarProjeto && projeto && <span className="min-w-0 truncate rounded-full bg-wine-soft px-1.5 py-0.5 text-[10px] text-wine">{projeto.nome}</span>}
                {quem && <span className="shrink-0">{quem}</span>}
                {textoPrazo && <span className={`ml-auto shrink-0 ${corPrazo}`}>{textoPrazo}</span>}
              </span>
            ) : null
          ) : (
            <>
              {mostrarProjeto && projeto && <span className="hidden shrink-0 rounded-full bg-wine-soft px-1.5 py-0.5 text-[10px] text-wine sm:inline">{projeto.nome}</span>}
              {quem && <span className="hidden shrink-0 text-[10.5px] text-text-faint sm:inline">{quem}</span>}
              {textoPrazo && <span className={`w-[76px] shrink-0 text-right text-[10.5px] ${corPrazo}`}>{textoPrazo}</span>}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={compartilhar}
          title={linkCopiado ? "Link copiado" : "Enviar o link desta tarefa"}
          aria-label="Enviar o link desta tarefa"
          className={`shrink-0 rounded px-1 text-[12px] hover:bg-bg ${linkCopiado ? "text-success" : "text-text-faint hover:text-primary-deep"}`}
        >
          {linkCopiado ? "✓" : "🔗"}
        </button>
        {/* Ações rápidas, sem abrir o detalhe: a IA cria tarefa redundante ou que é só etapa de
            outra — daqui dá pra excluir ou rebaixar a atividade em dois cliques. */}
        {!feita && no.filhas.length === 0 && !no.parent_id && (
          <button
            type="button"
            disabled={isPending}
            title="Virar atividade de outra tarefa"
            aria-label="Virar atividade de outra tarefa"
            onClick={() => {
              setErroLinha(null);
              setMovendo((v) => !v);
            }}
            className="shrink-0 rounded px-1 text-[12px] text-text-faint hover:bg-bg hover:text-primary-deep"
          >
            ↳
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          title="Excluir tarefa"
          aria-label="Excluir tarefa"
          onClick={() => {
            const aviso = no.filhas.length > 0 ? `Excluir “${no.titulo}” e suas ${no.filhas.length} atividade(s)?` : `Excluir “${no.titulo}”?`;
            if (!confirm(aviso)) return;
            setErroLinha(null);
            startTransition(async () => {
              const r = await excluirTarefa(no.id);
              if (r.error) setErroLinha(r.error);
            });
          }}
          className="shrink-0 rounded px-1 text-[13px] leading-none text-text-faint hover:bg-danger-soft hover:text-danger"
        >
          ×
        </button>
      </div>
      {movendo && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border-soft bg-bg px-3 py-1.5 text-[11.5px]">
          <span className="text-text-muted">Virar atividade de:</span>
          <select
            defaultValue=""
            disabled={isPending}
            onChange={(e) => {
              const maeId = e.target.value;
              if (!maeId) return;
              startTransition(async () => {
                const r = await tornarAtividadeDe(no.id, maeId);
                if (r.error) setErroLinha(r.error);
                else setMovendo(false);
              });
            }}
            className="input input-compacto min-w-[220px] flex-1"
          >
            <option value="">escolha a tarefa principal…</option>
            {[...dados.candidatasDependencia]
              .filter((c) => c.id !== no.id && c.status !== "feito")
              .sort((a, b) => Number((b.projeto_id ?? "") === (no.projeto_id ?? "")) - Number((a.projeto_id ?? "") === (no.projeto_id ?? "")) || a.titulo.localeCompare(b.titulo))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.projeto_id ?? "") === (no.projeto_id ?? "") ? "" : "(outro projeto) "}
                  {c.titulo}
                </option>
              ))}
          </select>
          <button type="button" onClick={() => setMovendo(false)} className="text-text-muted">
            cancelar
          </button>
        </div>
      )}
      {erroLinha && <p className="px-3 pb-1 text-[10.5px] text-danger">{erroLinha}</p>}

      {aberto && (
        <div className="flex flex-col gap-1.5 border-t border-border-soft px-3 pb-2.5 pt-2">
          {((mostrarProjeto && projeto) || (mostrarFase && fase) || no.etiquetas.length > 0 || produtosDaTarefa.length > 0 || no.area) && (
            <div className="flex flex-wrap gap-1">
              {mostrarProjeto && projeto && <span className="rounded-full bg-wine-soft px-1.5 py-0.5 text-[10px] text-wine">{projeto.nome}</span>}
              {mostrarFase && fase && <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] text-primary-deep">{fase.nome}</span>}
              {no.etiquetas.map((e) => (
                <span key={e} className="rounded-full bg-cream px-1.5 py-0.5 text-[10px] text-wine">
                  #{e}
                </span>
              ))}
              {no.area && <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-muted">{no.area}</span>}
              {produtosDaTarefa.map((p) => (
                <span key={p.id} className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-muted">
                  {p.nome}
                </span>
              ))}
            </div>
          )}

          {(responsavel || participantes.length > 0) && (
            <p className="text-[10.5px] text-text-muted">
              {responsavel && (
                <>
                  <span className="font-medium">{responsavel.nome}</span> (responsável)
                </>
              )}
              {participantes.length > 0 && (
                <>
                  {responsavel && " · "}com {participantes.map((p) => p.nome).join(", ")}
                </>
              )}
            </p>
          )}

          {no.descricao && <p className="whitespace-pre-line text-[11px] text-text-muted">{no.descricao}</p>}
          <AnexosTarefa tarefaId={no.id} anexos={dados.anexos.get(no.id) ?? []} />

          {(no.data_inicio || no.prazo) && (
            <p className={`text-[10.5px] ${corPrazo}`}>
              {no.data_inicio && `${fmt(no.data_inicio)} → `}
              {textoPrazo}
            </p>
          )}


          {no.filhas.length > 0 && (
            <div className="flex flex-col gap-0.5 rounded-md border border-border-soft bg-bg/60 px-2 py-1.5">
              {no.filhas.map((f) => (
                <SubLinha key={f.id} no={f} nivel={0} dados={dados} dependeDe={dependeDe} />
              ))}
            </div>
          )}

          {novaSub && <NovaTarefaCard dados={dados} projetoInicial={no.projeto_id} faseInicial={no.fase_id} parentId={no.id} aoConcluir={() => setNovaSub(false)} />}

          {/* Dependência é entre TAREFAS (uma espera a outra) — nada a ver com subtarefa. Só aparece
              quando existe de fato. */}
          {(bloqueada || libera.length > 0) && (
            <div className="flex flex-col gap-0.5 border-t border-dashed border-border-soft pt-1.5">
              {bloqueada && (
                <p className="text-[10.5px] text-cream-deep" title={no.aguardando.map((a) => a.titulo).join(", ")}>
                  ⏳ só começa depois de: {no.aguardando.map((a) => a.titulo).join(", ")}
                </p>
              )}
              {libera.length > 0 && (
                <p className="text-[10.5px] text-primary-deep" title={libera.map((l) => l.titulo).join(", ")}>
                  🔓 ao concluir, libera: {libera.map((l) => l.titulo).join(", ")}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setEditando(true)} className="text-[10.5px] font-medium text-primary-deep">
                editar
              </button>
              {!novaSub && (
                <button type="button" onClick={() => setNovaSub(true)} title="Adicionar item ao checklist desta tarefa" className="text-[10.5px] text-text-muted hover:text-primary-deep">
                  + subtarefa
                </button>
              )}
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const aviso = no.filhas.length > 0 ? `Excluir essa tarefa e suas ${no.filhas.length} subtarefa(s)?` : "Excluir essa tarefa?";
                  if (!confirm(aviso)) return;
                  startTransition(async () => {
                    await excluirTarefa(no.id);
                  });
                }}
                className="text-[11px] text-danger"
              >
                ×
              </button>
            </span>
            <select
              value={no.status}
              disabled={isPending}
              onChange={(e) => {
                const novoStatus = e.target.value;
                startTransition(async () => {
                  await mudarStatusTarefa(no.id, novoStatus);
                });
              }}
              className="input input-compacto w-[88px] text-[10.5px]"
            >
              {STATUS_ORDEM.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
