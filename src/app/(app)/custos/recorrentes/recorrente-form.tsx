"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { criarRecorrente, type RecorrenteFormState } from "./actions";
import { grupoDeConta, GRUPO_LABELS } from "@/lib/grupo-dre";

type PlanoContas = { id: string; codigo: string; conta: string; tipo: string };
type Produto = { id: string; nome: string };

const initialState: RecorrenteFormState = { error: null };

const OUTROS_GRUPO_LABEL: Record<string, string> = {
  financeiro: "Financeiro (juros, tarifas, câmbio)",
  ativo: "Ativos e investimentos permanentes",
};

function grupoAmploDe(c: PlanoContas): string {
  return grupoDeConta(c.codigo, c.tipo) ?? c.tipo;
}

function labelGrupo(grupo: string): string {
  if (grupo === "cogs" || grupo === "sm" || grupo === "pd" || grupo === "ga") return GRUPO_LABELS[grupo];
  return OUTROS_GRUPO_LABEL[grupo] ?? grupo;
}

const ORDEM_GRUPOS_AMPLO = ["cogs", "sm", "pd", "ga", "financeiro", "ativo"];

export function RecorrenteForm({
  planoContas,
  produtos,
  pagadores,
}: {
  planoContas: PlanoContas[];
  produtos: Produto[];
  pagadores: string[];
}) {
  const [state, formAction, pending] = useActionState(criarRecorrente, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [grupo, setGrupo] = useState("");

  const grupos = useMemo(() => {
    const presentes = new Set(planoContas.map(grupoAmploDe));
    return ORDEM_GRUPOS_AMPLO.filter((g) => presentes.has(g));
  }, [planoContas]);

  const contasDoGrupo = useMemo(
    () => planoContas.filter((c) => grupoAmploDe(c) === grupo).sort((a, b) => a.conta.localeCompare(b.conta)),
    [planoContas, grupo],
  );

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-[14.5px] font-semibold">Nova despesa recorrente</h2>
      <p className="mb-5 text-[11.5px] text-text-muted">
        Configure uma vez — todo mês o sistema lança essa despesa automaticamente e só falta anexar a NF/recibo.
      </p>
      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
          setGrupo("");
        }}
        className="flex flex-col gap-3.5"
      >
        <Field label="1. Que tipo de gasto é esse?">
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)} required className="input">
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

        <Field label="Descrição">
          <input name="descricao" type="text" required className="input" placeholder="Ex: Assinatura AWS" />
        </Field>

        <Field label="Pagador (opcional)">
          <select name="pagador" className="input">
            <option value="">Quem paga?</option>
            {pagadores.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="Empresa">Empresa (conta/cartão PJ)</option>
          </select>
        </Field>

        <Field label="Valor mensal">
          <input name="valor" type="number" step="0.01" min="0" required placeholder="0,00" className="input" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia do mês do lançamento">
            <input name="dia_do_mes" type="number" min="1" max="28" defaultValue={5} required className="input" />
          </Field>
          <Field label="Começa em">
            <input name="data_inicio" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="input" />
          </Field>
        </div>

        {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>}
        {state.success && <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">Despesa recorrente criada.</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Criar recorrência"}
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
