"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  criarPlano,
  atualizarPlano,
  criarPrecoFase,
  excluirPlano,
  excluirPrecoFase,
  criarBetaProduto,
  atualizarBetaProduto,
  excluirBetaProduto,
  type ActionState,
} from "../actions";
import { FASES, type FaseValue } from "@/lib/fases";
import { InfoTooltip } from "@/components/info-tooltip";

type Plano = {
  id: string;
  nome_plano: string;
  tipo_cobranca: string;
  tipo_venda: string;
  preco: number;
  desconto_pct: number | null;
  is_annual_only: boolean;
  mix_percentual: number | null;
  reajuste_anual_pct: number | null;
};

type PrecoFase = { id: string; plano_id: string; fase: string; preco: number };

type FaseComData = { fase: FaseValue; data_inicio: string | null; data_fim: string | null };

type BetaProduto = {
  id: string;
  quantidade: number;
  data_inicio: string | null;
  data_fim: string | null;
  condicao_especial_pct: number | null;
  condicao_especial_meses: number | null;
};

const initialState: ActionState = { error: null };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const FASE_LABEL: Record<string, string> = Object.fromEntries(FASES.map((f) => [f.value, f.label]));

export function PlanosPrecificacao({
  produtoId,
  cenarioId,
  planos,
  precosFase,
  fases,
  betaTesters,
}: {
  produtoId: string;
  cenarioId: string;
  planos: Plano[];
  precosFase: PrecoFase[];
  fases: FaseComData[];
  betaTesters: BetaProduto[];
}) {
  const [state, formAction, pending] = useActionState(criarPlano, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const somaMix = planos.reduce((acc, p) => acc + Number(p.mix_percentual ?? 0), 0);
  const precosFasePorPlano = new Map<string, PrecoFase[]>();
  for (const pf of precosFase) {
    const atual = precosFasePorPlano.get(pf.plano_id) ?? [];
    atual.push(pf);
    precosFasePorPlano.set(pf.plano_id, atual);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 font-heading text-[13px] font-semibold">Planos de precificação</h2>
      <p className="mb-4 text-[11px] text-text-muted">Não muda por cenário — é uma decisão do produto</p>

      <div className="mb-4 flex flex-col gap-2">
        {planos.length === 0 && (
          <p className="text-[12px] text-text-faint">Nenhum plano cadastrado ainda.</p>
        )}
        {planos.map((p) => (
          <PlanoRow key={p.id} produtoId={produtoId} plano={p} precosFase={precosFasePorPlano.get(p.id) ?? []} />
        ))}
        {planos.length > 0 && (
          <div
            className={`text-right text-[11px] font-medium ${
              somaMix === 100 ? "text-success" : "text-danger"
            }`}
          >
            Mix total: {somaMix}% {somaMix !== 100 && "(precisa somar 100%)"}
          </div>
        )}
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
        <input name="nome_plano" placeholder="Nome do plano (ex: Mensal)" className="input" required />
        <div className="grid grid-cols-2 gap-2">
          <select name="tipo_cobranca" className="input" required defaultValue="">
            <option value="" disabled>
              Cobrança
            </option>
            <option value="mensal">Mensal</option>
            <option value="semestral">Semestral</option>
            <option value="anual">Anual</option>
          </select>
          <select name="tipo_venda" className="input" defaultValue="individual">
            <option value="individual">Individual</option>
            <option value="pacote">Pacote</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="preco" type="number" step="0.01" placeholder="Preço (R$)" className="input" required />
          <input name="desconto_pct" type="number" step="0.01" placeholder="Desconto (%)" className="input" />
        </div>
        <div>
          <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
            Reajuste anual (%)
            <InfoTooltip texto="Percentual de aumento de preço aplicado uma vez por ano, começando 1 ano após a data de lançamento do produto. Use para produtos mais simples, cujo preço não muda por fase — apenas acompanha a inflação/reajuste anual." />
          </label>
          <input
            name="reajuste_anual_pct"
            type="number"
            step="0.01"
            placeholder="Ex: 6 (= 6% ao ano, a partir de 1 ano do lançamento)"
            className="input"
          />
        </div>
        <div>
          <input
            name="mix_percentual"
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="% dos clientes nesse plano (ex: 60)"
            className="input"
          />
          <p className="mt-1 text-[10px] text-text-faint">
            Usado pra calcular a receita média por cliente — a soma de todos os planos deve dar 100%
          </p>
        </div>
        <label className="flex items-center gap-2 text-[11.5px]">
          <input type="checkbox" name="is_annual_only" className="h-4 w-4 rounded border-border" />
          Somente contrato anual (annual-only)
        </label>

        {state.error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
        >
          {pending ? "Adicionando…" : "+ Adicionar plano"}
        </button>
      </form>

      <BetaProdutoSection produtoId={produtoId} cenarioId={cenarioId} fases={fases} itens={betaTesters} />
    </div>
  );
}

function PlanoRow({ produtoId, plano, precosFase }: { produtoId: string; plano: Plano; precosFase: PrecoFase[] }) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(atualizarPlano, initialState);
  const [isPending, startTransition] = useTransition();
  const foiPending = useRef(false);

  useEffect(() => {
    if (foiPending.current && !pending && state.success) setEditando(false);
    foiPending.current = pending;
  }, [pending, state.success]);

  if (editando) {
    return (
      <div className="rounded-lg border border-primary-fill px-3 py-2.5">
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={plano.id} />
          <input type="hidden" name="produto_id" value={produtoId} />
          <input name="nome_plano" defaultValue={plano.nome_plano} className="input" required />
          <div className="grid grid-cols-2 gap-2">
            <select name="tipo_cobranca" defaultValue={plano.tipo_cobranca} className="input" required>
              <option value="mensal">Mensal</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </select>
            <select name="tipo_venda" defaultValue={plano.tipo_venda} className="input">
              <option value="individual">Individual</option>
              <option value="pacote">Pacote</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input name="preco" type="number" step="0.01" defaultValue={plano.preco} placeholder="Preço (R$)" className="input" required />
            <input name="desconto_pct" type="number" step="0.01" defaultValue={plano.desconto_pct ?? ""} placeholder="Desconto (%)" className="input" />
          </div>
          <input
            name="reajuste_anual_pct"
            type="number"
            step="0.01"
            defaultValue={plano.reajuste_anual_pct != null ? (plano.reajuste_anual_pct * 100).toFixed(2) : ""}
            placeholder="Reajuste anual (%)"
            className="input"
          />
          <input
            name="mix_percentual"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={plano.mix_percentual ?? ""}
            placeholder="% dos clientes nesse plano"
            className="input"
          />
          <label className="flex items-center gap-2 text-[11.5px]">
            <input type="checkbox" name="is_annual_only" defaultChecked={plano.is_annual_only} className="h-4 w-4 rounded border-border" />
            Somente contrato anual (annual-only)
          </label>
          {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60"
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={() => setEditando(false)} className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-soft px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12.5px] font-semibold">{plano.nome_plano}</div>
          <div className="text-[10.5px] text-text-faint">
            {plano.tipo_cobranca} · {plano.tipo_venda}
            {plano.is_annual_only ? " · annual-only" : ""}
            {plano.desconto_pct ? ` · -${plano.desconto_pct}%` : ""}
            {plano.reajuste_anual_pct ? ` · reajuste +${(plano.reajuste_anual_pct * 100).toFixed(1)}%/ano` : ""}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {plano.mix_percentual != null && (
            <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-primary-deep">{plano.mix_percentual}%</span>
          )}
          <span className="font-mono text-[13px] font-semibold">{formatBRL(Number(plano.preco))}</span>
          <button type="button" onClick={() => setEditando(true)} className="text-[11px] text-primary-deep">
            Editar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => excluirPlano(plano.id, produtoId))}
            className="text-[11px] text-danger"
          >
            Remover
          </button>
        </div>
      </div>
      <PrecosPorFase produtoId={produtoId} planoId={plano.id} precoBase={Number(plano.preco)} itens={precosFase} />
    </div>
  );
}

function faseNaData(fases: FaseComData[], dataIso: string | null): string | null {
  if (!dataIso) return null;
  const data = new Date(dataIso + "T00:00:00");
  const encontrada = fases.find((f) => {
    if (!f.data_inicio) return false;
    const inicio = new Date(f.data_inicio + "T00:00:00");
    const fim = f.data_fim ? new Date(f.data_fim + "T00:00:00") : null;
    return data >= inicio && (!fim || data <= fim);
  });
  return encontrada ? (FASE_LABEL[encontrada.fase] ?? encontrada.fase) : null;
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";
}

function BetaProdutoSection({
  produtoId,
  cenarioId,
  fases,
  itens,
}: {
  produtoId: string;
  cenarioId: string;
  fases: FaseComData[];
  itens: BetaProduto[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(criarBetaProduto, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-4 rounded-lg bg-bg px-4 py-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center text-[11.5px] font-semibold text-text-muted">
          Beta testers do produto {itens.length > 0 ? `(${itens.length})` : ""}
          <InfoTooltip texto="Testam de graça ANTES do lançamento comercial do produto — não são pagantes ainda, é a fase de validação com clientes reais (diferente da conversa informal com profissionais da área, que nem entra aqui). O sistema mostra automaticamente em qual fase cada teste caiu, pela data. No mês do lançamento, todo mundo converte de uma vez — com desconto por um tempo (se configurado) ou preço cheio direto." />
        </span>
        <span className="text-text-faint">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {itens.length === 0 && <p className="text-[11px] text-text-faint">Nenhum beta cadastrado ainda.</p>}
          {itens.map((b) => {
            const faseNoInicio = faseNaData(fases, b.data_inicio);
            return (
              <BetaRow
                key={b.id}
                produtoId={produtoId}
                cenarioId={cenarioId}
                beta={b}
                faseNoInicio={faseNoInicio}
                isPending={isPending}
                startTransition={startTransition}
              />
            );
          })}

          <form
            ref={formRef}
            action={async (fd) => {
              await formAction(fd);
              formRef.current?.reset();
            }}
            className="flex flex-col gap-2 border-t border-border-soft pt-3"
          >
            <input type="hidden" name="produto_id" value={produtoId} />
            <input type="hidden" name="cenario_id" value={cenarioId} />
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-[10px] text-text-faint">Quantidade</label>
                <input name="quantidade" type="number" min="1" className="input w-[80px]" required />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-text-faint">Início do teste</label>
                <input name="data_inicio" type="date" className="input w-[140px]" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-text-faint">Fim do teste</label>
                <input name="data_fim" type="date" className="input w-[140px]" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-text-faint">Tipo</label>
                <select name="tipo" defaultValue="mvp_inicial" className="input w-[130px]">
                  <option value="mvp_inicial">MVP inicial</option>
                  <option value="melhoria">Melhoria</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 flex items-center text-[10px] text-text-faint">
                  Desconto no lançamento (%)
                  <InfoTooltip texto="Opcional. No mês do lançamento comercial, esses beta testers pagam com esse desconto por um tempo — depois voltam ao preço cheio. Deixe em branco pra cobrar preço cheio assim que lançar." />
                </label>
                <input name="condicao_especial_pct" type="number" step="0.01" placeholder="Ex: 20" className="input w-[130px]" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-text-faint">Duração (meses)</label>
                <input name="condicao_especial_meses" type="number" placeholder="Ex: 6" className="input w-[100px]" />
              </div>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg border border-border px-3 py-2 text-[11px] font-medium text-primary-deep disabled:opacity-60"
              >
                {pending ? "…" : "+ Adicionar"}
              </button>
            </div>
          </form>
          {state.error && <p className="text-[10.5px] text-danger">{state.error}</p>}
        </div>
      )}
    </div>
  );
}

function BetaRow({
  produtoId,
  cenarioId,
  beta,
  faseNoInicio,
  isPending,
  startTransition,
}: {
  produtoId: string;
  cenarioId: string;
  beta: BetaProduto;
  faseNoInicio: string | null;
  isPending: boolean;
  startTransition: (callback: () => void | Promise<void>) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(atualizarBetaProduto, initialState);
  const foiPending = useRef(false);

  useEffect(() => {
    if (foiPending.current && !pending && state.success) setEditando(false);
    foiPending.current = pending;
  }, [pending, state.success]);

  if (editando) {
    return (
      <form action={formAction} className="flex flex-col gap-2 rounded-md border border-primary-fill bg-surface px-2.5 py-2">
        <input type="hidden" name="id" value={beta.id} />
        <input type="hidden" name="produto_id" value={produtoId} />
        <input type="hidden" name="cenario_id" value={cenarioId} />
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[10px] text-text-faint">Quantidade</label>
            <input name="quantidade" type="number" min="1" defaultValue={beta.quantidade} className="input w-[80px]" required />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-text-faint">Início do teste</label>
            <input name="data_inicio" type="date" defaultValue={beta.data_inicio ?? ""} className="input w-[140px]" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-text-faint">Fim do teste</label>
            <input name="data_fim" type="date" defaultValue={beta.data_fim ?? ""} className="input w-[140px]" />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[10px] text-text-faint">Desconto no lançamento (%)</label>
            <input
              name="condicao_especial_pct"
              type="number"
              step="0.01"
              defaultValue={beta.condicao_especial_pct != null ? (beta.condicao_especial_pct * 100).toFixed(2) : ""}
              className="input w-[130px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-text-faint">Duração (meses)</label>
            <input name="condicao_especial_meses" type="number" defaultValue={beta.condicao_especial_meses ?? ""} className="input w-[100px]" />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-wine-deep px-3 py-2 text-[11px] font-medium text-white disabled:opacity-60"
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" onClick={() => setEditando(false)} className="rounded-lg border border-border px-3 py-2 text-[11px] text-text-muted">
            Cancelar
          </button>
        </div>
        {state.error && <p className="text-[10.5px] text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="rounded-md border border-border-soft bg-surface px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px]">
          {beta.quantidade} pessoa(s) · {formatDate(beta.data_inicio)} → {formatDate(beta.data_fim)}
          {faseNoInicio && <span className="ml-1.5 text-text-faint">({faseNoInicio})</span>}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditando(true)} className="text-[11px] text-primary-deep">
            Editar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => excluirBetaProduto(beta.id, produtoId))}
            className="text-[11px] text-danger"
          >
            ×
          </button>
        </div>
      </div>
      {beta.condicao_especial_pct && (
        <div className="mt-0.5 text-[10.5px] text-text-faint">
          {(beta.condicao_especial_pct * 100).toFixed(0)}% off por {beta.condicao_especial_meses} meses a partir do lançamento
        </div>
      )}
    </div>
  );
}

function PrecosPorFase({
  produtoId,
  planoId,
  precoBase,
  itens,
}: {
  produtoId: string;
  planoId: string;
  precoBase: number;
  itens: PrecoFase[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(criarPrecoFase, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-2 border-t border-border-soft pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center text-[10.5px] font-medium text-primary-deep"
      >
        Preço por fase {itens.length > 0 ? `(${itens.length})` : ""} {open ? "▲" : "▼"}
        <InfoTooltip texto="Para produtos mais complexos (ex: Fashion Mind), o preço do plano pode mudar conforme a fase do ciclo de vida (Ideação, Validação, PMF, Tração, Escala, Maturidade). Defina aqui o preço a partir de cada fase — ele vale até a próxima fase com preço definido." />
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {itens.length === 0 && (
            <p className="text-[10.5px] text-text-faint">
              Sem override — usa o preço base ({formatBRL(precoBase)}) em todas as fases.
            </p>
          )}
          {itens.map((pf) => (
            <div key={pf.id} className="flex items-center justify-between rounded-md bg-bg px-2.5 py-1.5">
              <span className="text-[11px]">{FASE_LABEL[pf.fase] ?? pf.fase}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold">{formatBRL(Number(pf.preco))}</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => excluirPrecoFase(pf.id, produtoId))}
                  className="text-[10.5px] text-danger"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <form
            ref={formRef}
            action={async (fd) => {
              await formAction(fd);
              formRef.current?.reset();
            }}
            className="flex items-end gap-1.5"
          >
            <input type="hidden" name="produto_id" value={produtoId} />
            <input type="hidden" name="plano_id" value={planoId} />
            <select name="fase" className="input w-[130px]" defaultValue="" required>
              <option value="" disabled>
                Fase…
              </option>
              {FASES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <input name="preco" type="number" step="0.01" placeholder="Preço (R$)" className="input w-[100px]" required />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg border border-border px-2.5 py-2 text-[11px] font-medium text-primary-deep disabled:opacity-60"
            >
              {pending ? "…" : "+ Definir"}
            </button>
          </form>
          {state.error && <p className="text-[10.5px] text-danger">{state.error}</p>}
        </div>
      )}
    </div>
  );
}
