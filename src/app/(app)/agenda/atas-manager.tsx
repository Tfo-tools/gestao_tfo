"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { salvarAta, excluirAta, sugerirAcoesDaAta, criarTarefasDaAta, type ActionState } from "./atas-actions";
import type { AcaoSugerida } from "@/lib/anthropic";

export type Ata = {
  id: string;
  titulo: string;
  data_reuniao: string;
  participantes: string | null;
  conteudo: string;
  reuniao_id: string | null;
  google_event_id: string | null;
};
type Pessoa = { id: string; nome: string };

const initialState: ActionState = { error: null };

/** Campo de ata embutido dentro de cada reunião/compromisso (não é mais uma lista separada) — no
 * máximo uma ata por reunião. `chave` identifica de qual reunião é: uma marcada pelo app
 * (reuniao_id) ou um compromisso do Google (google_event_id). */
export function AtaInline({
  chave,
  ataExistente,
  tituloSugerido,
  dataSugerida,
  pessoas,
  iaConfigurada,
}: {
  chave: { reuniao_id: string } | { google_event_id: string };
  ataExistente: Ata | null;
  tituloSugerido: string;
  dataSugerida: string;
  pessoas: Pessoa[];
  iaConfigurada: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [aberto, setAberto] = useState(false);

  if (!ataExistente && !editando) {
    return (
      <button
        type="button"
        onClick={() => {
          setEditando(true);
          setAberto(true);
        }}
        className="text-[11px] font-medium text-primary-deep"
      >
        + Ata
      </button>
    );
  }

  if (editando) {
    return (
      <AtaForm
        chave={chave}
        ataExistente={ataExistente}
        tituloSugerido={tituloSugerido}
        dataSugerida={dataSugerida}
        onDone={() => setEditando(false)}
      />
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setAberto((v) => !v)} className="text-[11px] font-medium text-primary-deep">
        {aberto ? "Ata ▲" : "Ata ▾"}
      </button>
      {aberto && ataExistente && (
        <AtaConteudo ata={ataExistente} pessoas={pessoas} iaConfigurada={iaConfigurada} onEditar={() => setEditando(true)} />
      )}
    </div>
  );
}

function AtaForm({
  chave,
  ataExistente,
  tituloSugerido,
  dataSugerida,
  onDone,
}: {
  chave: { reuniao_id: string } | { google_event_id: string };
  ataExistente: Ata | null;
  tituloSugerido: string;
  dataSugerida: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(salvarAta, initialState);

  if (state.success) onDone();

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 rounded-lg border border-border-soft bg-bg p-3">
      <input type="hidden" name="titulo" value={ataExistente?.titulo ?? tituloSugerido} />
      <input type="hidden" name="data_reuniao" value={ataExistente?.data_reuniao ?? dataSugerida} />
      {"reuniao_id" in chave && <input type="hidden" name="reuniao_id" value={chave.reuniao_id} />}
      {"google_event_id" in chave && <input type="hidden" name="google_event_id" value={chave.google_event_id} />}

      <div>
        <label className="mb-1 block text-[10px] text-text-faint">Participantes (opcional)</label>
        <input name="participantes" type="text" defaultValue={ataExistente?.participantes ?? ""} placeholder="Nomes separados por vírgula" className="input w-full" />
      </div>
      <div>
        <label className="mb-1 block text-[10px] text-text-faint">Ata (cole ou digite)</label>
        <textarea
          name="conteudo"
          rows={6}
          required
          defaultValue={ataExistente?.conteudo ?? ""}
          placeholder="O que foi discutido, decidido e combinado…"
          className="input w-full"
        />
      </div>
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">
          {pending ? "…" : "Salvar ata"}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-border px-3.5 py-2 text-[12px] text-text-muted">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function AtaConteudo({
  ata,
  pessoas,
  iaConfigurada,
  onEditar,
}: {
  ata: Ata;
  pessoas: Pessoa[];
  iaConfigurada: boolean;
  onEditar: () => void;
}) {
  const [extraindo, startExtracao] = useTransition();
  const [erroExtracao, setErroExtracao] = useState<string | null>(null);
  const [acoes, setAcoes] = useState<(AcaoSugerida & { selecionada: boolean })[] | null>(null);
  const [excluindo, startExclusao] = useTransition();
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [criandoTarefas, startCriacao] = useTransition();
  const [erroCriacao, setErroCriacao] = useState<string | null>(null);
  const [criadas, setCriadas] = useState<number | null>(null);

  function extrairAcoes() {
    setErroExtracao(null);
    setCriadas(null);
    startExtracao(async () => {
      const resultado = await sugerirAcoesDaAta(ata.id);
      if (resultado.error) {
        setErroExtracao(resultado.error);
        return;
      }
      setAcoes(resultado.acoes.map((a) => ({ ...a, selecionada: true })));
    });
  }

  function atualizarAcao(idx: number, patch: Partial<AcaoSugerida & { selecionada: boolean }>) {
    setAcoes((atual) => atual?.map((a, i) => (i === idx ? { ...a, ...patch } : a)) ?? null);
  }

  function confirmarTarefas() {
    if (!acoes) return;
    const selecionadas = acoes.filter((a) => a.selecionada);
    setErroCriacao(null);
    startCriacao(async () => {
      const resultado = await criarTarefasDaAta(
        ata.id,
        selecionadas.map((a) => {
          const pessoa = pessoas.find((p) => p.nome.toLowerCase() === (a.responsavel_sugerido ?? "").toLowerCase());
          return { titulo: a.titulo, responsavel_id: pessoa?.id ?? null, prazo: a.prazo_sugerido };
        }),
      );
      if (resultado.error) {
        setErroCriacao(resultado.error);
        return;
      }
      setCriadas(resultado.criadas);
      setAcoes(null);
    });
  }

  return (
    <div className="mt-2 rounded-lg border border-border-soft bg-bg p-3">
      {ata.participantes && <p className="mb-1.5 text-[11px] text-text-muted">Participantes: {ata.participantes}</p>}
      <p className="mb-2.5 whitespace-pre-wrap text-[12px] text-text">{ata.conteudo}</p>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={!iaConfigurada || extraindo}
          onClick={extrairAcoes}
          className="rounded-lg border border-primary-fill px-3 py-1.5 text-[11px] font-medium text-primary-deep disabled:opacity-50"
        >
          {extraindo ? "Lendo a ata…" : "Extrair ações (IA)"}
        </button>
        <button type="button" onClick={onEditar} className="text-[11px] font-medium text-text-muted">
          Editar
        </button>
        <button
          type="button"
          disabled={excluindo}
          onClick={() => {
            if (!confirm("Remover essa ata?")) return;
            setErroExclusao(null);
            startExclusao(async () => {
              const resultado = await excluirAta(ata.id);
              if (resultado.error) setErroExclusao(resultado.error);
            });
          }}
          className="text-[11px] font-medium text-danger disabled:opacity-50"
        >
          {excluindo ? "…" : "Remover"}
        </button>
      </div>
      {erroExtracao && <p className="mt-1.5 text-[10.5px] text-danger">{erroExtracao}</p>}
      {erroExclusao && <p className="mt-1.5 text-[10.5px] text-danger">{erroExclusao}</p>}
      {criadas !== null && (
        <p className="mt-2 text-[11.5px] text-success">
          {criadas} tarefa{criadas === 1 ? "" : "s"} criada{criadas === 1 ? "" : "s"} — confira em Tarefas.
        </p>
      )}

      {acoes && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border-soft bg-surface p-3">
          {acoes.length === 0 ? (
            <p className="text-[11.5px] text-text-muted">Não encontrei nenhuma ação combinada nessa ata.</p>
          ) : (
            <>
              <p className="text-[11px] font-medium text-text-muted">Revise antes de confirmar:</p>
              {acoes.map((acao, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-bg px-3 py-2">
                  <input
                    type="checkbox"
                    checked={acao.selecionada}
                    onChange={(e) => atualizarAcao(idx, { selecionada: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  <input
                    type="text"
                    value={acao.titulo}
                    onChange={(e) => atualizarAcao(idx, { titulo: e.target.value })}
                    className="input min-w-[180px] flex-1"
                  />
                  <select
                    value={pessoas.find((p) => p.nome.toLowerCase() === (acao.responsavel_sugerido ?? "").toLowerCase())?.id ?? ""}
                    onChange={(e) => {
                      const nome = pessoas.find((p) => p.id === e.target.value)?.nome ?? null;
                      atualizarAcao(idx, { responsavel_sugerido: nome });
                    }}
                    className="input w-[120px]"
                  >
                    <option value="">Sem responsável</option>
                    {pessoas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={acao.prazo_sugerido ?? ""}
                    onChange={(e) => atualizarAcao(idx, { prazo_sugerido: e.target.value || null })}
                    className="input w-[135px]"
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={criandoTarefas}
                  onClick={confirmarTarefas}
                  className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60"
                >
                  {criandoTarefas ? "…" : `Criar ${acoes.filter((a) => a.selecionada).length} tarefa(s)`}
                </button>
                <button type="button" onClick={() => setAcoes(null)} className="text-[11.5px] text-text-muted">
                  Cancelar
                </button>
              </div>
              {erroCriacao && <p className="text-[10.5px] text-danger">{erroCriacao}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
