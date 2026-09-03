"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { criarLancamento, type DespesaFormState } from "./actions";
import { grupoAmploDe, labelGrupoAmplo, ORDEM_GRUPOS_AMPLO } from "@/lib/categoria-lancamento";

type PlanoContas = { id: string; codigo: string; conta: string; tipo: string };
type Produto = { id: string; nome: string };

const initialState: DespesaFormState = { error: null };

export function DespesaForm({
  planoContas,
  produtos,
  pagadores,
  usoPorConta,
}: {
  planoContas: PlanoContas[];
  produtos: Produto[];
  pagadores: string[];
  usoPorConta: Record<string, number>;
}) {
  const [state, formAction, pending] = useActionState(criarLancamento, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [grupo, setGrupo] = useState("");
  const [recorrente, setRecorrente] = useState(false);
  const [ultimoFoiRecorrente, setUltimoFoiRecorrente] = useState(false);

  const grupos = useMemo(() => {
    const presentes = new Set(planoContas.map(grupoAmploDe));
    return ORDEM_GRUPOS_AMPLO.filter((g) => presentes.has(g));
  }, [planoContas]);

  const contasDoGrupo = useMemo(() => {
    return planoContas
      .filter((c) => grupoAmploDe(c) === grupo)
      .sort((a, b) => (usoPorConta[b.id] ?? 0) - (usoPorConta[a.id] ?? 0) || a.conta.localeCompare(b.conta));
  }, [planoContas, grupo, usoPorConta]);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-5 font-heading text-[14.5px] font-semibold">Novo lançamento</h2>
      <form
        ref={formRef}
        action={async (formData) => {
          setUltimoFoiRecorrente(recorrente);
          await formAction(formData);
          formRef.current?.reset();
          setGrupo("");
          setRecorrente(false);
        }}
        className="flex flex-col gap-3.5"
      >
        <label className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2.5 text-[12.5px]">
          <input
            name="recorrente"
            type="checkbox"
            checked={recorrente}
            onChange={(e) => setRecorrente(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Isso se repete todo mês?
        </label>

        {recorrente ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Começa em">
              <input name="data_inicio" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="input" />
            </Field>
            <Field label="Dia do vencimento">
              <input name="dia_do_mes" type="number" min="1" max="31" defaultValue={5} required className="input" />
            </Field>
            <Field label="Até quando (opcional)">
              <input name="data_fim" type="date" className="input" />
            </Field>
          </div>
        ) : (
          <Field label="Data do gasto">
            <input
              name="data_gasto"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="input"
            />
          </Field>
        )}
        {recorrente && (
          <p className="-mt-2 text-[10.5px] text-text-faint">
            Se o mês não tiver esse dia (ex: dia 30 em fevereiro), o lançamento cai no dia 1º do mês seguinte.
          </p>
        )}

        <Field label="1. Que tipo de gasto é esse?">
          <select
            value={grupo}
            onChange={(e) => setGrupo(e.target.value)}
            required
            className="input"
          >
            <option value="">Selecione…</option>
            {grupos.map((g) => (
              <option key={g} value={g}>
                {labelGrupoAmplo(g)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="2. Qual conta exatamente?">
          <select name="plano_contas_id" required disabled={!grupo} className="input disabled:opacity-50">
            <option value="">{grupo ? "Selecione…" : "Escolha o tipo de gasto primeiro"}</option>
            {contasDoGrupo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.conta}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Produto(s) vinculado(s) (opcional)">
          <div className="flex flex-wrap gap-2">
            {produtos.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] has-[:checked]:border-primary-fill has-[:checked]:bg-primary-soft has-[:checked]:text-primary-deep"
              >
                <input type="checkbox" name="produtos" value={p.id} className="h-3.5 w-3.5 rounded border-border" />
                {p.nome}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[10.5px] text-text-faint">Marque mais de um quando o custo é compartilhado — ex: evento de lançamento de duas marcas.</p>
        </Field>

        <Field label="Pagador">
          <select name="pagador" required={!recorrente} className="input">
            <option value="">{recorrente ? "Quem costuma pagar? (pode mudar por mês depois)" : "Quem pagou?"}</option>
            {pagadores.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="Empresa">Empresa (conta/cartão PJ)</option>
          </select>
        </Field>

        <Field label={recorrente ? "Valor mensal" : "Valor total"}>
          <input
            name="valor_total"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="0,00"
            className="input"
          />
        </Field>

        <Field label={recorrente ? "Descrição" : "Descrição (opcional)"}>
          <input name="descricao" type="text" required={recorrente} className="input" placeholder="Ex: campanha Meta Ads agosto" />
        </Field>

        {recorrente ? (
          <p className="rounded-lg bg-bg px-3 py-2.5 text-[11.5px] text-text-muted">
            O comprovante de cada mês é anexado depois, em Recorrentes → Pendentes de comprovante — assim que a NF/recibo daquele mês
            sair.
          </p>
        ) : (
          <>
            <Field label="Fatura / Nota Fiscal (opcional)">
              <input
                name="fatura"
                type="file"
                accept="image/*,application/pdf"
                className="w-full rounded-lg border border-dashed border-border bg-bg px-3 py-3 text-[12.5px]"
              />
            </Field>

            <Field label="Comprovante de pagamento (opcional)">
              <input
                name="comprovante_pagamento"
                type="file"
                accept="image/*,application/pdf"
                className="w-full rounded-lg border border-dashed border-border bg-bg px-3 py-3 text-[12.5px]"
              />
              <p className="mt-1 text-[10.5px] text-text-faint">
                Boleto costuma precisar dos dois — o boleto em si (fatura) e o comprovante depois de pago. Se ainda não pagou, deixe
                esse em branco e volte aqui pra anexar depois, editando o lançamento. No celular, dá pra tirar a foto na hora.
              </p>
            </Field>

            <label className="flex items-center gap-2 pt-1 text-[12px]">
              <input name="comprovado" type="checkbox" className="h-4 w-4 rounded border-border" />
              Marcar como comprovado (auditado internamente)
            </label>
          </>
        )}

        {state.error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
        )}
        {state.success && (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
            {ultimoFoiRecorrente ? "Recorrência criada — os lançamentos mensais aparecem em Custos → Recorrentes." : "Despesa lançada."}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : recorrente ? "Criar recorrência" : "Lançar despesa"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  );
}
