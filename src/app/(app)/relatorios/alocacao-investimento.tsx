"use client";

import { useActionState, useRef, useTransition } from "react";
import { criarAlocacaoInvestimento, excluirAlocacaoInvestimento, type ActionState } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";

type Item = { id: string; categoria: string; percentual: number; observacoes: string | null };

const initialState: ActionState = { error: null };

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const pct = (v: number) => `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Destinação do capital captado por frente. `somenteLeitura` (Relatórios): barras horizontais nas
 * cores da marca, alternando azul/branco e amarelo/vinho, com % e R$ quando o total captado é
 * conhecido; a edição mora no plano (`linkEditar`). Sem a flag: lista + formulário (tela do plano).
 * Percentual é em pontos (40 = 40%).
 */
export function AlocacaoInvestimento({
  cenarioId,
  itens,
  nomeCenario,
  totalCaptado = 0,
  somenteLeitura = false,
  linkEditar,
}: {
  cenarioId: string;
  itens: Item[];
  nomeCenario: string;
  totalCaptado?: number;
  somenteLeitura?: boolean;
  linkEditar?: string;
}) {
  const [state, formAction, pending] = useActionState(criarAlocacaoInvestimento, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const somaPct = itens.reduce((acc, i) => acc + Number(i.percentual), 0);
  const ordenados = [...itens].sort((a, b) => Number(b.percentual) - Number(a.percentual));
  const maior = Math.max(1, ...ordenados.map((i) => Number(i.percentual)));
  const fecha100 = Math.round(somaPct) === 100;

  if (somenteLeitura) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="flex items-center font-heading text-[13px] font-semibold">
            Destinação do investimento — {nomeCenario}
            <InfoTooltip texto="Como o capital captado será usado neste cenário, por frente. Os percentuais são definidos no plano; o R$ é o percentual aplicado sobre o total captado." />
          </h2>
          {linkEditar && (
            <a
              href={linkEditar}
              title="Editar no plano"
              aria-label="Editar no plano"
              className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-text-muted hover:border-wine hover:text-wine"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </a>
          )}
        </div>
        {totalCaptado > 0 && <p className="mb-4 text-[11px] text-text-muted">Sobre {brl(totalCaptado)} captados</p>}

        {ordenados.length === 0 ? (
          <p className="text-[12px] text-text-faint">Nenhuma destinação definida ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {ordenados.map((i, idx) => {
              // Paleta da marca em rodízio: azul (letra branca) → amarelo (letra vinho) → vinho (letra amarela).
              const estilo = ["bg-primary text-white", "bg-cream text-wine", "bg-wine text-cream"][idx % 3];
              // Barra proporcional à maior frente (a maior ocupa a largura toda) — assim as
              // diferenças entre frentes ficam legíveis mesmo quando nenhuma passa de 40%.
              const largura = Math.max(18, (Number(i.percentual) / maior) * 100);
              return (
                <div key={i.id}>
                  <div className="h-8 w-full overflow-hidden rounded-md bg-bg">
                    <div
                      className={`flex h-full items-center justify-between gap-3 rounded-md px-3 text-[12px] ${estilo}`}
                      style={{ width: `${largura}%` }}
                    >
                      <span className="truncate font-medium capitalize">{i.categoria}</span>
                      <span className="shrink-0 font-mono font-semibold">
                        {pct(Number(i.percentual))}
                        {totalCaptado > 0 && <span className="ml-1.5 font-normal opacity-80">{brl((Number(i.percentual) / 100) * totalCaptado)}</span>}
                      </span>
                    </div>
                  </div>
                  {i.observacoes && <p className="mt-1 pl-1 text-[10.5px] leading-snug text-text-faint">{i.observacoes}</p>}
                </div>
              );
            })}
            <div className={`mt-1 text-right text-[11px] font-medium ${fecha100 ? "text-success" : "text-danger"}`}>
              Total: {pct(somaPct)} {!fecha100 && "(ideal somar 100%)"}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div id="destinacao" className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 flex items-center font-heading text-[13px] font-semibold">
        Destinação do investimento — {nomeCenario}
        <InfoTooltip texto="Como o capital captado (fomento/investimento) será usado neste cenário — útil para a prestação de contas e para explicar a investidores onde o dinheiro será aplicado. Percentual em pontos: 40 = 40%." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">Defina livremente as categorias e o % de destinação — aparece em Relatórios e na planilha do investidor</p>

      <div className="mb-3 flex flex-col gap-1.5">
        {itens.length === 0 && <p className="text-[12px] text-text-faint">Nenhuma destinação definida ainda.</p>}
        {ordenados.map((i) => (
          <div key={i.id} className="rounded-md border border-border-soft px-2.5 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium capitalize">{i.categoria}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-semibold text-primary-deep">{pct(Number(i.percentual))}</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => excluirAlocacaoInvestimento(i.id))}
                  className="text-[11px] text-danger"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg">
              <div className="h-full rounded-full bg-primary-fill" style={{ width: `${Math.min(100, Number(i.percentual))}%` }} />
            </div>
            {i.observacoes && <p className="mt-1 text-[10.5px] text-text-faint">{i.observacoes}</p>}
          </div>
        ))}
        {itens.length > 0 && (
          <div className={`text-right text-[11px] font-medium ${fecha100 ? "text-success" : "text-danger"}`}>
            Total: {pct(somaPct)} {!fecha100 && "(ideal somar 100%)"}
          </div>
        )}
      </div>

      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
        }}
        className="flex flex-wrap items-end gap-2 border-t border-border-soft pt-3"
      >
        <input type="hidden" name="cenario_id" value={cenarioId} />
        <input name="categoria" placeholder="Categoria (ex: Marketing)" className="input min-w-[120px] flex-1" required />
        <input name="percentual" type="number" step="0.5" min="0" max="100" placeholder="% (ex: 40)" className="input w-[90px]" required />
        <input name="observacoes" placeholder="Obs. (opcional)" className="input min-w-[120px] flex-1" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
        >
          {pending ? "…" : "+ Adicionar"}
        </button>
      </form>
      {state.error && <p className="mt-1 text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}
