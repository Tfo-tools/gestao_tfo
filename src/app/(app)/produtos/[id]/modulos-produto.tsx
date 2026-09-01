"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { criarModulo, excluirModulo, type ActionState } from "../actions";
import { FASES } from "@/lib/fases";
import { InfoTooltip } from "@/components/info-tooltip";

type Modulo = {
  id: string;
  nome: string;
  preco: number;
  fase_lancamento: string | null;
  meses_apos_lancamento: number | null;
  adesao_inicial_pct: number;
  crescimento_adesao_mensal_pct: number;
};

const initialState: ActionState = { error: null };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const FASE_LABEL: Record<string, string> = Object.fromEntries(FASES.map((f) => [f.value, f.label]));

function descreverGatilho(m: Modulo): string {
  if (m.meses_apos_lancamento != null) {
    const anos = m.meses_apos_lancamento / 12;
    const texto = Number.isInteger(anos) ? `${anos} ano${anos !== 1 ? "s" : ""}` : `${m.meses_apos_lancamento} meses`;
    return `${texto} após o lançamento`;
  }
  return `na fase ${FASE_LABEL[m.fase_lancamento ?? ""] ?? m.fase_lancamento}`;
}

export function ModulosProduto({ produtoId, modulos }: { produtoId: string; modulos: Modulo[] }) {
  const [state, formAction, pending] = useActionState(criarModulo, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [gatilho, setGatilho] = useState<"fase" | "tempo">("tempo");

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 flex items-center font-heading text-[13px] font-semibold">
        Módulos add-on
        <InfoTooltip texto="Para produtos com combo de módulos (ex: Fashion Mind): cada módulo tem preço próprio e aumenta o valor pago pelo cliente a partir do momento em que entra. Pode ser lançado numa fase específica do ciclo de vida, ou N meses após o lançamento comercial do produto (ex: melhorias programadas para 1 e 2 anos depois do MVP). A adesão começa num % inicial da base de clientes e cresce todo mês até saturar em 100% — para um módulo que já entra valendo para todos, use 100% de adesão inicial e 0% de crescimento." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Receita adicional além do plano — ex: melhorias do MVP, integração com apps, acompanhamento de plano, campanhas, fluxo de pagamentos
      </p>

      <div className="mb-4 flex flex-col gap-2">
        {modulos.length === 0 && (
          <p className="text-[12px] text-text-faint">Nenhum módulo cadastrado ainda.</p>
        )}
        {modulos.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border border-border-soft px-3 py-2.5">
            <div>
              <div className="text-[12.5px] font-semibold">{m.nome}</div>
              <div className="text-[10.5px] text-text-faint">
                entra {descreverGatilho(m)} · adesão inicial {(m.adesao_inicial_pct * 100).toFixed(1)}% · +
                {(m.crescimento_adesao_mensal_pct * 100).toFixed(1)}%/mês
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[13px] font-semibold">+{formatBRL(Number(m.preco))}</span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => excluirModulo(m.id, produtoId))}
                className="text-[11px] text-danger"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-2.5 border-t border-border-soft pt-4"
      >
        <input type="hidden" name="produto_id" value={produtoId} />
        <input name="nome" placeholder="Nome do módulo (ex: Melhoria 1 — planejamento de campanhas)" className="input" required />
        <input name="preco" type="number" step="0.01" placeholder="Quanto aumenta o preço (R$/mês)" className="input" required />

        <div className="flex gap-2 rounded-lg bg-bg p-1">
          <button
            type="button"
            onClick={() => setGatilho("tempo")}
            className={`flex-1 rounded-md py-1.5 text-[11.5px] font-medium ${
              gatilho === "tempo" ? "bg-surface shadow-sm" : "text-text-muted"
            }`}
          >
            Por tempo desde o lançamento
          </button>
          <button
            type="button"
            onClick={() => setGatilho("fase")}
            className={`flex-1 rounded-md py-1.5 text-[11.5px] font-medium ${
              gatilho === "fase" ? "bg-surface shadow-sm" : "text-text-muted"
            }`}
          >
            Por fase do ciclo de vida
          </button>
        </div>
        <input type="hidden" name="gatilho" value={gatilho} />

        {gatilho === "tempo" ? (
          <div>
            <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
              Meses após o lançamento comercial
              <InfoTooltip texto="Quantos meses depois da data de lançamento estimada do produto esse módulo passa a valer. Ex: 12 = 1 ano depois do MVP, 24 = 2 anos depois." />
            </label>
            <input
              name="meses_apos_lancamento"
              type="number"
              step="1"
              min="0"
              placeholder="Ex: 12 (= 1 ano depois do lançamento)"
              className="input"
            />
          </div>
        ) : (
          <select name="fase_lancamento" className="input" defaultValue="">
            <option value="" disabled>
              Fase de lançamento…
            </option>
            {FASES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
              Adesão inicial (%)
              <InfoTooltip texto="No mês em que o módulo entra, qual % da base de clientes já paga por ele. Use 100% para uma melhoria que passa a valer para todo mundo (aumento de preço direto)." />
            </label>
            <input name="adesao_inicial_pct" type="number" step="0.01" placeholder="Ex: 100" defaultValue={100} className="input" />
          </div>
          <div>
            <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
              Crescimento mensal da adesão (%)
              <InfoTooltip texto="A cada mês seguinte, quanto a adesão cresce sobre o percentual atual. Deixe 0% se o módulo já nasce valendo para toda a base (caso comum das melhorias de plano único)." />
            </label>
            <input name="crescimento_adesao_mensal_pct" type="number" step="0.01" placeholder="Ex: 0" defaultValue={0} className="input" />
          </div>
        </div>

        {state.error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
        >
          {pending ? "Adicionando…" : "+ Adicionar módulo"}
        </button>
      </form>
    </div>
  );
}
