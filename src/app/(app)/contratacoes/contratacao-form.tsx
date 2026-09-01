"use client";

import { useActionState, useRef, useState } from "react";
import { criarContratacao, type ActionState } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";

type Cenario = { id: string; nome: string };
type Produto = { id: string; nome: string };
type Regime = { id: string; nome: string };

const initialState: ActionState = { error: null };

export function ContratacaoForm({
  cenarios,
  produtos,
  regimes,
  cenarioPadrao,
  produtoPadrao,
}: {
  cenarios: Cenario[];
  produtos: Produto[];
  regimes: Regime[];
  cenarioPadrao?: string;
  produtoPadrao?: string;
}) {
  const [tipo, setTipo] = useState<"clt" | "pj">("clt");
  const [state, formAction, pending] = useActionState(criarContratacao, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 font-heading text-sm font-semibold">Nova contratação</h2>
      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-3.5"
      >
        <Field label="Cenário">
          <select name="cenario_id" required defaultValue={cenarioPadrao ?? ""} className="input">
            <option value="" disabled>
              Selecione…
            </option>
            {cenarios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Produto (opcional — deixe vazio pra custo geral)">
          <select name="produto_id" defaultValue={produtoPadrao ?? ""} className="input">
            <option value="">Geral (não vinculado a um produto)</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cargo">
            <select name="cargo" required defaultValue="" className="input">
              <option value="" disabled>
                Selecione…
              </option>
              <option value="sdr">SDR</option>
              <option value="vendedor">Vendedor / AE</option>
              <option value="coordenador">Coordenador</option>
            </select>
          </Field>
          <Field label="Nome / empresa (opcional)">
            <input name="nome_referencia" type="text" className="input" placeholder="Ex: João, ou Agência XPTO" />
          </Field>
        </div>

        <div className="flex gap-2 rounded-lg bg-bg p-1">
          <button
            type="button"
            onClick={() => setTipo("clt")}
            className={`flex-1 rounded-md py-2 text-[12.5px] font-medium ${
              tipo === "clt" ? "bg-surface shadow-sm" : "text-text-muted"
            }`}
            title="CLT: contratação por carteira assinada, com todos os encargos trabalhistas (férias, 13º, FGTS etc.)"
          >
            CLT
          </button>
          <button
            type="button"
            onClick={() => setTipo("pj")}
            className={`flex-1 rounded-md py-2 text-[12.5px] font-medium ${
              tipo === "pj" ? "bg-surface shadow-sm" : "text-text-muted"
            }`}
            title="PJ: contratação de uma pessoa jurídica (empresa ou MEI) que presta o serviço via nota fiscal, sem vínculo empregatício"
          >
            PJ (prestador)
          </button>
        </div>
        <input type="hidden" name="tipo_contratacao" value={tipo} />

        {tipo === "clt" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salário bruto CTPS" tooltip="CTPS = Carteira de Trabalho e Previdência Social. É o salário bruto registrado formalmente, antes de descontos — é sobre ele que incidem os encargos trabalhistas.">
              <input name="salario_bruto" type="number" step="0.01" className="input" placeholder="0,00" />
            </Field>
            <Field
              label="Regime tributário"
              tooltip="Define o percentual de encargos (impostos e obrigações) aplicado sobre o salário — varia conforme o regime da empresa (Simples Nacional, Lucro Presumido/Real, com ou sem desoneração da folha)."
            >
              <select name="regime_id" className="input" defaultValue="">
                <option value="" disabled>
                  Selecione…
                </option>
                {regimes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <div className="rounded-lg bg-bg p-3.5">
            <p className="mb-3 text-[11px] text-text-muted">
              Empresa ou pessoa PJ que presta o serviço — pode ser 1 pessoa ou um pacote com equipe própria
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor mensal cobrado (R$)">
                <input name="valor_mensal" type="number" step="0.01" className="input" placeholder="0,00" />
              </Field>
              <Field label="Quantidade de pessoas no pacote">
                <input name="quantidade_pessoas" type="number" min="1" defaultValue={1} className="input" />
              </Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[11.5px]">
              <input type="checkbox" name="inclui_coordenador" className="h-4 w-4 rounded border-border" />
              O pacote já inclui coordenação/gestão da equipe
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Início">
            <input name="data_inicio" type="date" className="input" />
          </Field>
          <Field label="Fim (opcional — em andamento se vazio)">
            <input name="data_fim" type="date" className="input" />
          </Field>
        </div>

        <Field label="Observações">
          <input name="observacoes" type="text" className="input" />
        </Field>

        {state.error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
        )}
        {state.success && (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">Contratação salva.</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar contratação"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center text-[11.5px] font-medium text-text-muted">
        {label}
        {tooltip && <InfoTooltip texto={tooltip} />}
      </label>
      {children}
    </div>
  );
}
