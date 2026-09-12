"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  alternarReceitaHistorica,
  excluirReceitaHistorica,
  salvarReceitaHistorica,
  type ActionState,
} from "./receitas-historicas-actions";
import { mesesDaReceita, resumirReceitasHistoricas, type ReceitaHistorica } from "@/lib/receitas-historicas";
import { InfoTooltip } from "@/components/info-tooltip";

const initialState: ActionState = { error: null };

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const mesLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });

export function ReceitasHistoricas({
  cenarioId,
  itens,
  periodo,
}: {
  cenarioId: string;
  itens: ReceitaHistorica[];
  periodo: { inicio: string | null; fim: string | null };
}) {
  const [state, formAction, pending] = useActionState(salvarReceitaHistorica, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [editando, setEditando] = useState<ReceitaHistorica | null>(null);

  const resumo = resumirReceitasHistoricas(itens, periodo);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 flex items-center font-heading text-[13px] font-semibold">
        Tração antes do produto
        <InfoTooltip texto="Receita já realizada antes de existir software — a consultoria, por exemplo. Fica FORA da simulação de propósito: não entra em MRR, ARR, preço médio, CAC, churn nem no EBITDA projetado. Serve como prova de que a metodologia já era vendida e paga. O interruptor liga e desliga a exibição na tela e na planilha do investidor, sem apagar o registro." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Receita realizada fora da projeção — nenhum indicador do plano é afetado
      </p>

      <div className="mb-3 flex flex-col gap-1.5">
        {itens.length === 0 && (
          <p className="text-[12px] text-text-faint">
            Nada registrado ainda. Ex.: consultoria, R$ 4.500/mês, da abertura da empresa até fevereiro.
          </p>
        )}
        {itens.map((i) => {
          const meses = mesesDaReceita(i, periodo.fim);
          const total = Number(i.valor_mensal) * meses;
          return (
            <div
              key={i.id}
              className={`rounded-md border px-2.5 py-2 ${i.mostrar ? "border-border-soft" : "border-dashed border-border-soft opacity-60"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium">{i.descricao}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-semibold text-primary-deep">{brl(total)}</span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => startTransition(() => alternarReceitaHistorica(i.id, !i.mostrar))}
                    className="rounded border border-border px-1.5 py-0.5 text-[10.5px] text-text-muted"
                    title={i.mostrar ? "Desligar: sai da tela e da planilha, sem apagar" : "Ligar: volta a aparecer"}
                  >
                    {i.mostrar ? "Mostrando" : "Oculto"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(i)}
                    className="text-[11px] text-primary-deep"
                    title="Editar valor, datas ou observação"
                  >
                    editar
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      if (confirm(`Excluir "${i.descricao}" de vez? Para só tirar da apresentação, use o interruptor.`)) {
                        startTransition(() => excluirReceitaHistorica(i.id));
                      }
                    }}
                    className="text-[11px] text-danger"
                  >
                    ×
                  </button>
                </div>
              </div>
              <p className="mt-0.5 text-[10.5px] text-text-faint">
                {brl(Number(i.valor_mensal))}/mês · {mesLabel(i.data_inicio)} a{" "}
                {i.data_fim ? mesLabel(i.data_fim) : "em aberto"} · {meses} {meses === 1 ? "mês" : "meses"}
              </p>
              {i.observacoes && <p className="mt-1 text-[10.5px] text-text-faint">{i.observacoes}</p>}
            </div>
          );
        })}
        {resumo.ativos.length > 0 && (
          <div className="border-t border-border-soft pt-2 text-right text-[11px]">
            <span className="font-medium text-text-muted">Total realizado antes do produto: </span>
            <span className="font-mono font-semibold text-primary-deep">{brl(resumo.total)}</span>
            {resumo.totalNoPeriodo > 0 && (
              <span className="text-text-faint"> · {brl(resumo.totalNoPeriodo)} caem dentro do período do plano</span>
            )}
          </div>
        )}
      </div>

      <form
        ref={formRef}
        key={editando?.id ?? "novo"}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
          setEditando(null);
        }}
        className="flex flex-wrap items-end gap-2 border-t border-border-soft pt-3"
      >
        <input type="hidden" name="cenario_id" value={cenarioId} />
        {editando && <input type="hidden" name="id" value={editando.id} />}
        <input
          name="descricao"
          placeholder="O que foi vendido (ex: Consultoria)"
          defaultValue={editando?.descricao ?? ""}
          className="input min-w-[150px] flex-1"
          required
        />
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-text-faint">Valor mensal</span>
          <input
            name="valor_mensal"
            type="number"
            step="0.01"
            min="0"
            placeholder="4500"
            defaultValue={editando ? Number(editando.valor_mensal) : ""}
            className="input w-[100px]"
            required
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-text-faint">Início</span>
          <input
            name="data_inicio"
            type="month"
            defaultValue={editando?.data_inicio.slice(0, 7) ?? ""}
            className="input w-[130px]"
            required
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-text-faint">Fim (pode mudar depois)</span>
          <input name="data_fim" type="month" defaultValue={editando?.data_fim?.slice(0, 7) ?? ""} className="input w-[130px]" />
        </label>
        <input
          name="observacoes"
          placeholder="Obs. (opcional)"
          defaultValue={editando?.observacoes ?? ""}
          className="input min-w-[120px] flex-1"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
        >
          {pending ? "…" : editando ? "Salvar" : "+ Adicionar"}
        </button>
        {editando && (
          <button type="button" onClick={() => setEditando(null)} className="px-1 text-[11px] text-text-muted">
            cancelar
          </button>
        )}
      </form>
      {state.error && <p className="mt-1 text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}
