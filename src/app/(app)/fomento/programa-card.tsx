"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  alternarVinculoCenario,
  atualizarStatusPrograma,
  criarParcela,
  excluirParcela,
  excluirPrograma,
  type ActionState,
} from "./actions";

type Parcela = {
  id: string;
  numero_parcela: number;
  valor: number;
  percentual: number | null;
  data_prevista: string | null;
  status: string;
};

type Programa = {
  id: string;
  nome: string;
  tipo: string;
  valor_total: number;
  valor_subvencao: number | null;
  valor_contrapartida: number | null;
  status: string;
  observacoes: string | null;
};

type Cenario = { id: string; nome: string };

const initialState: ActionState = { error: null };
const TIPO_LABEL: Record<string, string> = { fomento: "FOMENTO", investimento: "INVESTIMENTO", mutuo: "MÚTUO", emprestimo: "EMPRÉSTIMO" };
const STATUS_LABEL: Record<string, string> = {
  em_negociacao: "Em negociação",
  termo_assinado: "Termo assinado",
  aprovado: "Aprovado",
  encerrado: "Encerrado",
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(iso: string | null) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";
}

export function ProgramaCard({
  programa,
  parcelas,
  cenarios,
  cenariosVinculados,
}: {
  programa: Programa;
  parcelas: Parcela[];
  cenarios: Cenario[];
  cenariosVinculados: string[];
}) {
  const [state, formAction, pending] = useActionState(criarParcela, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const vinculadosSet = new Set(cenariosVinculados);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary-deep">
              {TIPO_LABEL[programa.tipo] ?? programa.tipo.toUpperCase()}
            </span>
            <span className="font-heading text-[14.5px] font-semibold">{programa.nome}</span>
          </div>
          {programa.observacoes && <p className="text-[11.5px] text-text-muted">{programa.observacoes}</p>}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={programa.status}
            onChange={(e) => startTransition(() => atualizarStatusPrograma(programa.id, e.target.value))}
            className="rounded-lg border border-border px-2 py-1.5 text-[11px]"
          >
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => excluirPrograma(programa.id))}
            className="text-[11px] text-danger"
          >
            Remover
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <MiniStat label="Valor total" valor={formatBRL(Number(programa.valor_total))} />
        <MiniStat label="Subvenção" valor={formatBRL(Number(programa.valor_subvencao ?? 0))} />
        <MiniStat label="Contrapartida" valor={formatBRL(Number(programa.valor_contrapartida ?? 0))} />
      </div>

      <div className="mb-4">
        <div className="mb-2 text-[11.5px] font-semibold text-text-muted">Cronograma de parcelas</div>
        {parcelas.length > 0 && (
          <div className="mb-2 flex flex-col gap-1.5">
            {parcelas.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md bg-bg px-3 py-2">
                <span className="text-[12px]">
                  <span className="font-semibold">{p.numero_parcela}ª</span>
                  {p.percentual && <span className="text-text-faint"> — {p.percentual}%</span>}
                  <span className="ml-2 text-text-faint">{formatDate(p.data_prevista)}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-semibold">{formatBRL(Number(p.valor))}</span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => startTransition(() => excluirParcela(p.id))}
                    className="text-[11px] text-danger"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <form
          ref={formRef}
          action={async (fd) => {
            await formAction(fd);
            formRef.current?.reset();
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="programa_id" value={programa.id} />
          <input name="numero_parcela" type="number" min="1" placeholder="Nº" className="input w-[60px]" required />
          <input name="valor" type="number" step="0.01" placeholder="Valor (R$)" className="input w-[110px]" required />
          <input name="percentual" type="number" step="0.01" placeholder="%" className="input w-[70px]" />
          <input name="data_prevista" type="date" className="input w-[140px]" />
          <input name="condicao" type="text" placeholder="Condição (opcional)" className="input min-w-[140px] flex-1" />
          <button type="submit" disabled={pending} className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60">
            {pending ? "…" : "+ Parcela"}
          </button>
        </form>
        {state.error && <p className="mt-1 text-[11px] text-danger">{state.error}</p>}
      </div>

      <div>
        <div className="mb-2 text-[11.5px] font-semibold text-text-muted">Vinculado aos cenários</div>
        <div className="flex flex-wrap gap-2">
          {cenarios.map((c) => {
            const ativo = vinculadosSet.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => alternarVinculoCenario(programa.id, c.id, !ativo))}
                className={`rounded-full border px-3 py-1.5 text-[11.5px] font-medium ${
                  ativo ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border text-text-muted"
                }`}
              >
                {ativo && "✓ "}
                {c.nome}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg bg-bg px-3 py-2.5">
      <div className="text-[10px] text-text-faint">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] font-semibold">{valor}</div>
    </div>
  );
}
