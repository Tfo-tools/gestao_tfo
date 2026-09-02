"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { criarDespesa, type DespesaFormState } from "./actions";
import { grupoDeConta, GRUPO_LABELS } from "@/lib/grupo-dre";

type PlanoContas = { id: string; codigo: string; conta: string; tipo: string };
type Produto = { id: string; nome: string };

const initialState: DespesaFormState = { error: null };

const OUTROS_GRUPO_LABEL: Record<string, string> = {
  financeiro: "Financeiro (juros, tarifas, câmbio)",
  ativo: "Ativos e investimentos permanentes",
  marca: "Lançamento e construção de marca (pré-operação)",
};

// Divisão só pra reduzir a lista no lançamento — o relatório continua contando "marca" (4.2.4)
// dentro de G&A, sem mudar a classificação usada nos indicadores.
function grupoAmploDe(c: PlanoContas): string {
  if (c.codigo.startsWith("4.2.4")) return "marca";
  return grupoDeConta(c.codigo, c.tipo) ?? c.tipo;
}

function labelGrupo(grupo: string): string {
  if (grupo === "cogs") return "COGS — Custo dos Serviços Prestados";
  if (grupo === "sm" || grupo === "pd" || grupo === "ga") return GRUPO_LABELS[grupo];
  return OUTROS_GRUPO_LABEL[grupo] ?? grupo;
}

const ORDEM_GRUPOS_AMPLO = ["cogs", "sm", "pd", "ga", "marca", "financeiro", "ativo"];

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
  const [state, formAction, pending] = useActionState(criarDespesa, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [grupo, setGrupo] = useState("");

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
          await formAction(formData);
          formRef.current?.reset();
          setGrupo("");
        }}
        className="flex flex-col gap-3.5"
      >
        <Field label="Data do gasto">
          <input
            name="data_gasto"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="input"
          />
        </Field>

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
                {labelGrupo(g)}
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

        <Field label="Produto vinculado (opcional)">
          <select name="produto_id" className="input">
            <option value="">Nenhum</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Pagador">
          <select name="pagador" required className="input">
            <option value="">Quem pagou?</option>
            {pagadores.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="Empresa">Empresa (conta/cartão PJ)</option>
          </select>
        </Field>

        <Field label="Valor total">
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

        <Field label="Descrição (opcional)">
          <input name="descricao" type="text" className="input" placeholder="Ex: campanha Meta Ads agosto" />
        </Field>

        <Field label="Comprovante (NF ou recibo)">
          <input
            name="comprovante"
            type="file"
            accept="image/*,application/pdf"
            className="w-full rounded-lg border border-dashed border-border bg-bg px-3 py-3 text-[12.5px]"
          />
          <p className="mt-1 text-[10.5px] text-text-faint">No celular, dá pra tirar a foto na hora ou escolher da galeria/arquivos.</p>
        </Field>

        <label className="flex items-center gap-2 pt-1 text-[12px]">
          <input name="comprovado" type="checkbox" className="h-4 w-4 rounded border-border" />
          Marcar como comprovado (auditado internamente)
        </label>

        {state.error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
        )}
        {state.success && (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
            Despesa lançada.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Lançar despesa"}
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
