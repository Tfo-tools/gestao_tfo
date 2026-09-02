"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  criarCustoFixo,
  criarCustoVariavel,
  excluirCustoFixo,
  excluirCustoVariavel,
  copiarCustosFaseAnterior,
  type ActionState,
} from "../actions";
import { EquipeAlocada } from "../../produtos/[id]/equipe-alocada";
import type { FaseValue } from "@/lib/fases";

type PlanoContas = { id: string; codigo: string; conta: string };
type CustoFixo = { id: string; item: string; quantidade: number; valor_unitario: number; plano_contas: { codigo: string; conta: string } | null };
type CustoVariavel = {
  id: string;
  item: string;
  tipo_calculo: string;
  valor_base: number | null;
  percentual: number | null;
  valor_por_unidade: number | null;
  plano_contas: { codigo: string; conta: string } | null;
};
type Alocacao = {
  id: string;
  cargo: string;
  categoria: string;
  quantidade_funcionarios: number;
  horas_mes: number;
  custo_hora: number;
};

const initialState: ActionState = { error: null };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TIPO_CALCULO_LABEL: Record<string, string> = {
  valor_fixo: "valor fixo",
  valor_por_cliente: "por cliente/mês",
  unico_por_cliente: "único por cliente novo",
  percentual_receita: "% da receita",
};

export function FaseCustosCard({
  produtoId,
  cenarioId,
  fase,
  label,
  ordem,
  custosFixos,
  custosVariaveis,
  alocacoes,
  planoContas,
  defaultOpen = false,
}: {
  produtoId: string;
  cenarioId: string;
  fase: string;
  label: string;
  ordem: number;
  custosFixos: CustoFixo[];
  custosVariaveis: CustoVariavel[];
  alocacoes: Alocacao[];
  planoContas: PlanoContas[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copiaState, setCopiaState] = useState<{ error: string | null; success?: boolean } | null>(null);
  const [copiaPending, startCopia] = useTransition();
  const totalEquipe = alocacoes.reduce((acc, a) => acc + a.quantidade_funcionarios * a.horas_mes * a.custo_hora, 0);
  const totalFixo = custosFixos.reduce((acc, c) => acc + c.quantidade * c.valor_unitario, 0) + totalEquipe;

  function handleCopiar() {
    setCopiaState(null);
    startCopia(async () => {
      const result = await copiarCustosFaseAnterior(produtoId, cenarioId, fase as FaseValue);
      setCopiaState(result);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4.5 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`h-2 w-2 rounded-full ${totalFixo > 0 ? "bg-primary-fill" : "bg-border"}`} />
          <span className="text-[13px] font-semibold">
            {ordem}. {label}
          </span>
          {totalFixo > 0 && <span className="text-[11.5px] text-text-faint">{formatBRL(totalFixo)}/mês (equipe + fixos)</span>}
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-text-faint">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    );
  }

  return (
    <div className="rounded-lg border-[1.5px] border-primary-fill bg-surface px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-primary-fill" />
          <span className="font-heading text-sm font-semibold">
            {ordem}. {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {ordem > 1 && (
            <button
              type="button"
              disabled={copiaPending}
              onClick={handleCopiar}
              className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-primary-deep disabled:opacity-60"
            >
              {copiaPending ? "Copiando…" : "Copiar custos da fase anterior"}
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)} className="text-text-faint">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="m18 15-6-6-6 6" />
            </svg>
          </button>
        </div>
      </div>

      {copiaState?.error && <p className="mb-3 text-[11px] text-danger">{copiaState.error}</p>}
      {copiaState?.success && <p className="mb-3 text-[11px] text-success">Custos copiados — ajuste o que precisar mudar nesta fase.</p>}

      <div className="flex flex-col gap-4">
        <EquipeAlocada produtoId={produtoId} cenarioId={cenarioId} fase={fase} alocacoes={alocacoes} />
        <CustosFixosSection
          produtoId={produtoId}
          cenarioId={cenarioId}
          fase={fase}
          custos={custosFixos}
          planoContas={planoContas}
        />
        <CustosVariaveisSection
          produtoId={produtoId}
          cenarioId={cenarioId}
          fase={fase}
          custos={custosVariaveis}
          planoContas={planoContas}
        />
      </div>
    </div>
  );
}

function CustosFixosSection({
  produtoId,
  cenarioId,
  fase,
  custos,
  planoContas,
}: {
  produtoId: string;
  cenarioId: string;
  fase: string;
  custos: CustoFixo[];
  planoContas: PlanoContas[];
}) {
  const [state, formAction, pending] = useActionState(criarCustoFixo, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const total = custos.reduce((acc, c) => acc + c.quantidade * c.valor_unitario, 0);

  return (
    <div className="rounded-lg bg-bg px-4 py-3.5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11.5px] font-semibold text-text-muted">
          Estrutura &amp; ferramentas (custo fixo mensal)
        </div>
        {total > 0 && <span className="font-mono text-[12px] font-semibold text-primary-deep">{formatBRL(total)}/mês</span>}
      </div>

      {custos.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5">
          {custos.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-border-soft bg-surface px-2.5 py-2">
              <div className="text-[12px]">
                <span className="font-medium">{c.item}</span>
                {c.plano_contas && (
                  <span className="ml-1.5 text-text-faint">
                    · {c.plano_contas.codigo} {c.plano_contas.conta}
                  </span>
                )}
                <span className="ml-2 text-text-faint">{c.quantidade}× {formatBRL(c.valor_unitario)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-semibold">{formatBRL(c.quantidade * c.valor_unitario)}</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => excluirCustoFixo(c.id, produtoId))}
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
        <input type="hidden" name="produto_id" value={produtoId} />
        <input type="hidden" name="cenario_id" value={cenarioId} />
        <input type="hidden" name="fase" value={fase} />
        <input name="item" type="text" placeholder="Ex: Coworking, GitHub" className="input min-w-[130px] flex-1" required />
        <select name="plano_contas_id" className="input w-[170px]" defaultValue="">
          <option value="">Categoria (opcional)</option>
          {planoContas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} {p.conta}
            </option>
          ))}
        </select>
        <input name="quantidade" type="number" step="0.5" min="0" defaultValue={1} className="input w-[70px]" />
        <input name="valor_unitario" type="number" step="0.01" min="0" placeholder="R$ unit." className="input w-[95px]" required />
        <button type="submit" disabled={pending} className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60">
          {pending ? "…" : "+ Adicionar"}
        </button>
      </form>
      {state.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}

function CustosVariaveisSection({
  produtoId,
  cenarioId,
  fase,
  custos,
  planoContas,
}: {
  produtoId: string;
  cenarioId: string;
  fase: string;
  custos: CustoVariavel[];
  planoContas: PlanoContas[];
}) {
  const [state, formAction, pending] = useActionState(criarCustoVariavel, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [tipoCalculo, setTipoCalculo] = useState("valor_fixo");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-lg bg-bg px-4 py-3.5">
      <div className="mb-3 text-[11.5px] font-semibold text-text-muted">
        Custos variáveis (escalam com clientes ou receita)
      </div>

      {custos.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5">
          {custos.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-border-soft bg-surface px-2.5 py-2">
              <div className="text-[12px]">
                <span className="font-medium">{c.item}</span>
                {c.plano_contas && (
                  <span className="ml-1.5 text-text-faint">
                    · {c.plano_contas.codigo} {c.plano_contas.conta}
                  </span>
                )}
                <span className="ml-2 text-text-faint">
                  {TIPO_CALCULO_LABEL[c.tipo_calculo] ?? c.tipo_calculo}:{" "}
                  {c.tipo_calculo === "percentual_receita" && c.percentual != null
                    ? `${(c.percentual * 100).toFixed(1)}%`
                    : c.tipo_calculo === "valor_por_cliente"
                      ? `${formatBRL(c.valor_base ?? 0)} + ${formatBRL(c.valor_por_unidade ?? 0)}/cliente/mês`
                      : c.tipo_calculo === "unico_por_cliente"
                        ? `${formatBRL(c.valor_por_unidade ?? 0)}/cliente novo, uma vez`
                        : formatBRL(c.valor_base ?? 0)}
                </span>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => excluirCustoVariavel(c.id, produtoId))}
                className="text-[11px] text-danger"
              >
                ×
              </button>
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
        className="flex flex-col gap-2"
      >
        <input type="hidden" name="produto_id" value={produtoId} />
        <input type="hidden" name="cenario_id" value={cenarioId} />
        <input type="hidden" name="fase" value={fase} />
        <div className="flex flex-wrap items-end gap-2">
          <input name="item" type="text" placeholder="Ex: Infra cloud, Gateway" className="input min-w-[130px] flex-1" required />
          <select name="plano_contas_id" className="input w-[170px]" defaultValue="">
            <option value="">Categoria (opcional)</option>
            {planoContas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} {p.conta}
              </option>
            ))}
          </select>
          <select
            name="tipo_calculo"
            className="input w-[130px]"
            value={tipoCalculo}
            onChange={(e) => setTipoCalculo(e.target.value)}
          >
            <option value="valor_fixo">Valor fixo</option>
            <option value="valor_por_cliente">Por cliente (recorrente/mês)</option>
            <option value="unico_por_cliente">Único por cliente novo</option>
            <option value="percentual_receita">% da receita</option>
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {tipoCalculo === "percentual_receita" ? (
            <input name="percentual" type="number" step="0.01" placeholder="% da receita" className="input w-[130px]" required />
          ) : tipoCalculo === "valor_por_cliente" ? (
            <>
              <input name="valor_base" type="number" step="0.01" placeholder="Base fixa (R$)" className="input w-[130px]" />
              <input name="valor_por_unidade" type="number" step="0.01" placeholder="R$ / cliente / mês" className="input w-[130px]" required />
            </>
          ) : tipoCalculo === "unico_por_cliente" ? (
            <input name="valor_por_unidade" type="number" step="0.01" placeholder="R$ / cliente novo" className="input w-[130px]" required />
          ) : (
            <input name="valor_base" type="number" step="0.01" placeholder="Valor mensal (R$)" className="input w-[130px]" required />
          )}
          <button type="submit" disabled={pending} className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60">
            {pending ? "…" : "+ Adicionar"}
          </button>
        </div>
      </form>
      {state.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}
