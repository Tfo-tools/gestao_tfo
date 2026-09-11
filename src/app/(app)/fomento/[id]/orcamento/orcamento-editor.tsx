"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { criarRubrica, excluirRubrica, criarLinhaPrevista, excluirLinhaPrevista, type ActionState } from "./actions";

type Rubrica = { id: string; nome: string; fonte: string };
type PlanoContas = { id: string; codigo: string; conta: string };
type Linha = {
  id: string;
  rubrica_id: string | null;
  plano_contas_id: string | null;
  atividade: string;
  data_inicio: string;
  data_fim: string;
  tipo_custo: string;
  valor: number;
  observacoes: string | null;
};

const FONTE_LABEL: Record<string, string> = { subvencao: "Subvenção", contrapartida: "Contrapartida" };
const initialState: ActionState = { error: null };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatMes(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}
function formatPeriodo(inicio: string, fim: string) {
  return inicio === fim ? formatMes(inicio) : `${formatMes(inicio)} – ${formatMes(fim)}`;
}

export function OrcamentoEditor({
  programaId,
  rubricas,
  linhas,
  planoContas,
}: {
  programaId: string;
  rubricas: Rubrica[];
  linhas: Linha[];
  planoContas: PlanoContas[];
}) {
  const [aba, setAba] = useState<"atividade" | "rubrica">("atividade");
  const rubricaById = new Map(rubricas.map((r) => [r.id, r]));

  const totalGeral = linhas.reduce((s, l) => s + Number(l.valor), 0);

  const porAtividade = new Map<string, Linha[]>();
  for (const l of linhas) {
    const atual = porAtividade.get(l.atividade) ?? [];
    atual.push(l);
    porAtividade.set(l.atividade, atual);
  }

  const porRubrica = new Map<string, Linha[]>();
  for (const l of linhas) {
    const chave = l.rubrica_id ? (rubricaById.get(l.rubrica_id)?.nome ?? "Sem rubrica") : "Sem rubrica";
    const atual = porRubrica.get(chave) ?? [];
    atual.push(l);
    porRubrica.set(chave, atual);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Rubricas */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-1 font-heading text-[13px] font-semibold">Rubricas do edital</h2>
        <p className="mb-3 text-[11px] text-text-muted">Categorias que o programa usa — só etiquetas, não precisam bater com seu plano de contas</p>
        <RubricasLista programaId={programaId} rubricas={rubricas} />
      </div>

      {/* Nova linha prevista */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-1 font-heading text-[13px] font-semibold">Orçamento previsto</h2>
        <p className="mb-3 text-[11px] text-text-muted">Total lançado: <span className="font-mono font-semibold text-text">{formatBRL(totalGeral)}</span></p>
        <NovaLinhaForm programaId={programaId} rubricas={rubricas} planoContas={planoContas} />
      </div>

      {/* Visões */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex gap-1 rounded-lg bg-bg p-1" style={{ maxWidth: 320 }}>
          <button
            type="button"
            onClick={() => setAba("atividade")}
            className={`flex-1 rounded-md py-1.5 text-[11.5px] font-medium ${aba === "atividade" ? "bg-surface shadow-sm" : "text-text-muted"}`}
          >
            Por atividade
          </button>
          <button
            type="button"
            onClick={() => setAba("rubrica")}
            className={`flex-1 rounded-md py-1.5 text-[11.5px] font-medium ${aba === "rubrica" ? "bg-surface shadow-sm" : "text-text-muted"}`}
          >
            Por rubrica
          </button>
        </div>

        {linhas.length === 0 ? (
          <p className="text-[12px] text-text-faint">Nenhuma linha lançada ainda.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {[...(aba === "atividade" ? porAtividade : porRubrica).entries()].map(([grupo, itens]) => (
              <div key={grupo} className="rounded-lg border border-border-soft">
                <div className="flex items-center justify-between border-b border-border-soft bg-bg px-3.5 py-2">
                  <span className="text-[12px] font-semibold">{grupo}</span>
                  <span className="font-mono text-[12px] font-semibold">
                    {formatBRL(itens.reduce((s, l) => s + Number(l.valor), 0))}
                  </span>
                </div>
                <div className="flex flex-col">
                  {itens.map((l) => (
                    <LinhaRow key={l.id} linha={l} rubrica={l.rubrica_id ? rubricaById.get(l.rubrica_id) : undefined} programaId={programaId} mostrarAtividade={aba === "rubrica"} mostrarRubrica={aba === "atividade"} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RubricasLista({ programaId, rubricas }: { programaId: string; rubricas: Rubrica[] }) {
  const [state, formAction, pending] = useActionState(criarRubrica, initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {rubricas.length === 0 && <p className="text-[11.5px] text-text-faint">Nenhuma rubrica cadastrada ainda.</p>}
        {rubricas.map((r) => (
          <span key={r.id} className="flex items-center gap-1.5 rounded-full border border-border-soft bg-bg px-3 py-1.5 text-[11.5px]">
            {r.nome}
            <span className="rounded bg-surface px-1.5 py-0.5 text-[9.5px] text-text-faint">{FONTE_LABEL[r.fonte] ?? r.fonte}</span>
            <button type="button" disabled={isPending} onClick={() => startTransition(() => excluirRubrica(r.id, programaId))} className="text-danger">
              ×
            </button>
          </span>
        ))}
      </div>
      <form
        ref={formRef}
        action={async (fd) => {
          fd.set("programa_id", programaId);
          await formAction(fd);
          formRef.current?.reset();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-[10.5px] text-text-faint">Nome da rubrica</label>
          <input name="nome" type="text" placeholder="Ex: STPJ Data Engineer" required className="input" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Fonte</label>
          <select name="fonte" defaultValue="subvencao" className="input w-[150px]">
            <option value="subvencao">Subvenção</option>
            <option value="contrapartida">Contrapartida</option>
          </select>
        </div>
        <button type="submit" disabled={pending} className="rounded-lg border border-border px-3.5 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60">
          {pending ? "…" : "+ Rubrica"}
        </button>
      </form>
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}

function NovaLinhaForm({ programaId, rubricas, planoContas }: { programaId: string; rubricas: Rubrica[]; planoContas: PlanoContas[] }) {
  const [state, formAction, pending] = useActionState(criarLinhaPrevista, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        fd.set("programa_id", programaId);
        await formAction(fd);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[10.5px] text-text-faint">Atividade</label>
          <input name="atividade" type="text" placeholder="Ex: E1.1 Infraestrutura e Segurança" required className="input" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Início</label>
          <input name="data_inicio" type="month" required className="input w-[135px]" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Fim</label>
          <input name="data_fim" type="month" required className="input w-[135px]" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Rubrica</label>
          <select name="rubrica_id" defaultValue="" className="input w-[190px]">
            <option value="">Sem rubrica</option>
            {rubricas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-[10.5px] text-text-faint">Conta do plano de contas</label>
          <select name="plano_contas_id" defaultValue="" required className="input">
            <option value="" disabled>
              Selecione…
            </option>
            {planoContas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.conta}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Valor (R$)</label>
          <input name="valor" type="number" step="0.01" min="0" required className="input w-[140px]" />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-[10.5px] text-text-faint">Detalhamento (opcional)</label>
          <input name="observacoes" type="text" placeholder="Ex: 80h de desenvolvimento backend" className="input" />
        </div>
        <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-4 py-2 text-[12px] font-medium text-white disabled:opacity-60">
          {pending ? "…" : "+ Adicionar linha"}
        </button>
      </div>
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

function LinhaRow({
  linha,
  rubrica,
  programaId,
  mostrarAtividade,
  mostrarRubrica,
}: {
  linha: Linha;
  rubrica?: Rubrica;
  programaId: string;
  mostrarAtividade: boolean;
  mostrarRubrica: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between border-t border-border-soft px-3.5 py-2.5 first:border-t-0">
      <div className="text-[12px]">
        <span className="font-medium">{linha.tipo_custo}</span>
        <span className="ml-1.5 text-text-faint">
          · {formatPeriodo(linha.data_inicio, linha.data_fim)}
          {mostrarAtividade && ` · ${linha.atividade}`}
          {mostrarRubrica && rubrica && ` · ${rubrica.nome}`}
        </span>
        {linha.observacoes && <span className="ml-1.5 text-text-faint">· {linha.observacoes}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-semibold">{formatBRL(Number(linha.valor))}</span>
        <button type="button" disabled={isPending} onClick={() => startTransition(() => excluirLinhaPrevista(linha.id, programaId))} className="text-[11px] text-danger">
          ×
        </button>
      </div>
    </div>
  );
}
