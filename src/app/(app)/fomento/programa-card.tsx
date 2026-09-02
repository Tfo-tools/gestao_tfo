"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  alternarVinculoCenario,
  atualizarStatusPrograma,
  atualizarValuationPrograma,
  criarParcela,
  criarReavaliacao,
  excluirParcela,
  excluirPrograma,
  excluirReavaliacao,
  type ActionState,
} from "./actions";
import { calcularRetornoPrograma } from "@/lib/retorno-investidor";
import { InfoTooltip } from "@/components/info-tooltip";

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
  valuation_pre_money: number | null;
  valuation_post_money: number | null;
  data_aporte: string | null;
};

type Reavaliacao = {
  id: string;
  data_referencia: string;
  novo_valuation: number;
  fator_diluicao: number;
  tipo_evento: string;
  observacoes: string | null;
};

type Cenario = { id: string; nome: string };

const TIPO_EVENTO_LABEL: Record<string, string> = {
  nova_rodada: "Nova rodada",
  reavaliacao: "Reavaliação",
  exit_parcial: "Exit parcial",
  exit_total: "Exit total",
};

function formatPct(v: number) {
  return `${v.toFixed(1)}%`;
}

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
  reavaliacoes,
}: {
  programa: Programa;
  parcelas: Parcela[];
  cenarios: Cenario[];
  cenariosVinculados: string[];
  reavaliacoes: Reavaliacao[];
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

      {programa.tipo !== "fomento" && (
        <ValuationSection programa={programa} reavaliacoes={reavaliacoes} isPending={isPending} startTransition={startTransition} />
      )}

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

function ValuationSection({
  programa,
  reavaliacoes,
  isPending,
  startTransition,
}: {
  programa: Programa;
  reavaliacoes: Reavaliacao[];
  isPending: boolean;
  startTransition: (fn: () => void | Promise<void>) => void;
}) {
  const [valuationState, valuationAction, valuationPending] = useActionState(atualizarValuationPrograma, initialState);
  const [reavalState, reavalAction, reavalPending] = useActionState(criarReavaliacao, initialState);
  const reavalFormRef = useRef<HTMLFormElement>(null);

  const retorno = calcularRetornoPrograma({
    valor_investido: Number(programa.valor_total),
    valuation_post_money: programa.valuation_post_money != null ? Number(programa.valuation_post_money) : null,
    data_aporte: programa.data_aporte,
    reavaliacoes: reavaliacoes.map((r) => ({
      data_referencia: r.data_referencia,
      novo_valuation: Number(r.novo_valuation),
      fator_diluicao: Number(r.fator_diluicao),
    })),
  });

  return (
    <div className="mb-4 rounded-lg border border-border-soft bg-bg p-3.5">
      <div className="mb-2 flex items-center text-[11.5px] font-semibold text-text-muted">
        Valuation e retorno do investidor
        <InfoTooltip texto="ROI/MOIC/TIR calculados pela diluição de equity (valor investido ÷ valuation pós-money, ajustado pelas reavaliações), não pelo caixa da empresa — é a métrica que o investidor de fato enxerga." />
      </div>

      {!programa.valuation_post_money ? (
        <form action={valuationAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="programa_id" value={programa.id} />
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Valuation pré-money (R$)</label>
            <input name="valuation_pre_money" type="number" step="0.01" min="0" required className="input w-[160px]" />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Data do aporte</label>
            <input name="data_aporte" type="date" defaultValue={programa.data_aporte ?? ""} className="input w-[150px]" />
          </div>
          <button
            type="submit"
            disabled={valuationPending}
            className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
          >
            {valuationPending ? "…" : "Salvar valuation"}
          </button>
          {valuationState.error && <p className="w-full text-[11px] text-danger">{valuationState.error}</p>}
        </form>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 text-[11px] text-text-muted">
            <span>Pré-money: {formatBRL(Number(programa.valuation_pre_money))}</span>
            <span>Pós-money: {formatBRL(Number(programa.valuation_post_money))}</span>
            <span>Aporte em: {formatDate(programa.data_aporte)}</span>
          </div>

          {!retorno.temValuation ? (
            <p className="mb-3 text-[11.5px] text-text-faint">Sem dados suficientes pra calcular retorno ainda.</p>
          ) : (
            <div className="mb-3 grid grid-cols-3 gap-2">
              <MiniStat label="Equity atual" valor={retorno.equityAtualPct != null ? formatPct(retorno.equityAtualPct) : "—"} />
              <MiniStat label="MOIC" valor={retorno.moic != null ? `${retorno.moic.toFixed(2)}x` : "—"} />
              <MiniStat label="ROI" valor={retorno.roiPct != null ? formatPct(retorno.roiPct) : "—"} />
              <MiniStat
                label="Valor da participação"
                valor={retorno.valorParticipacao != null ? formatBRL(retorno.valorParticipacao) : "—"}
              />
              <MiniStat label="TIR (a.a.)" valor={retorno.tirPct != null ? formatPct(retorno.tirPct) : "—"} />
              <MiniStat
                label="Última atualização"
                valor={retorno.ultimaReavaliacao ? formatDate(retorno.ultimaReavaliacao) : "sem reavaliação"}
              />
            </div>
          )}

          {reavaliacoes.length > 0 && (
            <div className="mb-2 flex flex-col gap-1.5">
              {reavaliacoes.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border border-border-soft bg-surface px-3 py-2">
                  <span className="text-[11.5px]">
                    <span className="font-semibold">{TIPO_EVENTO_LABEL[r.tipo_evento] ?? r.tipo_evento}</span>
                    <span className="ml-2 text-text-faint">{formatDate(r.data_referencia)}</span>
                    {r.observacoes && <span className="ml-2 text-text-faint">— {r.observacoes}</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11.5px]">
                      {formatBRL(Number(r.novo_valuation))} · diluição {(Number(r.fator_diluicao) * 100).toFixed(1)}%
                    </span>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => startTransition(() => excluirReavaliacao(r.id))}
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
            ref={reavalFormRef}
            action={async (fd) => {
              await reavalAction(fd);
              reavalFormRef.current?.reset();
            }}
            className="flex flex-wrap items-end gap-2 border-t border-border-soft pt-2.5"
          >
            <input type="hidden" name="programa_id" value={programa.id} />
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Data</label>
              <input name="data_referencia" type="date" required className="input w-[135px]" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Novo valuation (R$)</label>
              <input name="novo_valuation" type="number" step="0.01" min="0" required className="input w-[150px]" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Diluição (%)</label>
              <input name="fator_diluicao" type="number" step="0.1" min="0" max="100" defaultValue={0} className="input w-[90px]" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Tipo</label>
              <select name="tipo_evento" className="input w-[130px]">
                {Object.entries(TIPO_EVENTO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <input name="observacoes" placeholder="Obs. (opcional)" className="input min-w-[120px] flex-1" />
            <button
              type="submit"
              disabled={reavalPending}
              className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
            >
              {reavalPending ? "…" : "+ Reavaliação"}
            </button>
            {reavalState.error && <p className="w-full text-[11px] text-danger">{reavalState.error}</p>}
          </form>
        </>
      )}
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
