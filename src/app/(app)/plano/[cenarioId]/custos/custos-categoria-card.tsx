"use client";

import Link from "next/link";
import { InfoTooltip } from "@/components/info-tooltip";
import type { CustoDerivado } from "./custos-derivados";
import { useActionState, useRef, useState, useTransition } from "react";
import {
  criarCustoFixo,
  criarCustoVariavel,
  excluirCustoFixo,
  excluirCustoVariavel,
  type ActionState,
} from "@/app/(app)/plano-de-custos/actions";
import { criarCustoEmpresa, atualizarCustoEmpresa, excluirCustoEmpresa } from "@/app/(app)/plano-de-custos/empresa/actions";
import { calcularRateioPorProduto, rateioPorReceita, type ParametrosCustoEmpresa, type TipoCustoEmpresa } from "@/lib/custos-empresa";
import { FASES } from "@/lib/fases";

type PlanoContas = { id: string; codigo: string; conta: string };
type Produto = { id: string; nome: string };

export type CustoFixoRow = {
  id: string;
  item: string;
  quantidade: number;
  valor_unitario: number;
  plano_contas_id: string | null;
  plano_contas: { codigo: string; conta: string } | null;
  fases_produto: { produto_id: string; fase: string; produtos: { nome: string } | null } | null;
};

export type CustoVariavelRow = {
  id: string;
  item: string;
  tipo_calculo: string;
  valor_base: number | null;
  percentual: number | null;
  valor_por_unidade: number | null;
  plano_contas_id: string | null;
  plano_contas: { codigo: string; conta: string } | null;
  fases_produto: { produto_id: string; fase: string; produtos: { nome: string } | null } | null;
};

type CustoEmpresaRow = {
  id: string;
  item: string;
  valor_mensal: number | null;
  tipo_custo: TipoCustoEmpresa;
  parametros: ParametrosCustoEmpresa;
  plano_contas_id: string | null;
  plano_contas: { codigo: string; conta: string } | null;
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatPct(v: number) {
  return `${(v * 100).toFixed(0)}%`;
}

const TIPO_CALCULO_LABEL: Record<string, string> = {
  valor_fixo: "Fixo",
  valor_por_cliente: "Por cliente/mês",
  unico_por_cliente: "Único por cliente novo",
  percentual_receita: "% da receita",
};

const TIPO_CUSTO_EMPRESA_LABEL: Record<TipoCustoEmpresa, string> = {
  fixo: "Fixo",
  escalonado: "Escalonado (degrau)",
  cronograma: "Cronograma (por mês)",
  variavel_receita: "% da receita",
  variavel_cliente: "Por cliente/mês",
};

const FASE_LABEL = new Map<string, string>(FASES.map((f) => [f.value, f.label]));

const initialState: ActionState = { error: null };

function custoEmpresaValorMensal(c: CustoEmpresaRow): number {
  if (c.tipo_custo === "fixo") return Number(c.valor_mensal) || 0;
  if (c.tipo_custo === "variavel_receita" || c.tipo_custo === "variavel_cliente") return 0; // depende do mês, mostrado só como % ou R$/unidade
  return Number(c.valor_mensal) || 0;
}

export function CustosCategoriaCard({
  categoria,
  label,
  cenarioId,
  produtos,
  planoContas,
  fixos,
  variaveis,
  custosEmpresa,
  matrizPorProduto,
  clientesPorProduto,
  receitaPorProduto = {},
  derivados = [],
  atalhos = [],
  comecarAberto = false,
  painel,
}: {
  categoria: string;
  label: string;
  cenarioId: string;
  produtos: Produto[];
  planoContas: PlanoContas[];
  fixos: CustoFixoRow[];
  variaveis: CustoVariavelRow[];
  custosEmpresa: CustoEmpresaRow[];
  matrizPorProduto: boolean;
  clientesPorProduto: Record<string, number>;
  /** Receita do mês mais recente por produto — base do rateio de custos que são % da receita. */
  receitaPorProduto?: Record<string, number>;
  /** Custos que o motor calcula a partir de outras telas (canais, implementação) e que pertencem a
   *  este grupo. Não são editáveis aqui — a linha diz onde ajustar. */
  derivados?: CustoDerivado[];
  /** Telas onde o custo deste grupo é configurado de fato (ex: equipe comercial em Necessidade de
   *  Contratação). Aparecem no topo do card pra ninguém procurar o lançamento no lugar errado. */
  atalhos?: { label: string; descricao: string; href: string }[];
  /** Abre o card já expandido — usado quando o atalho de outra tela aponta pra ele (?card=…). */
  comecarAberto?: boolean;
  /** Painel de configuração específico do grupo (ex: regras de escala do COGS), acima dos lançamentos. */
  painel?: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(comecarAberto);
  const [isPending, startTransition] = useTransition();

  const totalMes =
    fixos.reduce((s, f) => s + Number(f.quantidade) * Number(f.valor_unitario), 0) +
    variaveis.reduce((s, v) => s + (Number(v.valor_base) || 0), 0) +
    custosEmpresa.reduce((s, c) => s + custoEmpresaValorMensal(c), 0);

  const totalItens = fixos.length + variaveis.length + custosEmpresa.length + derivados.filter((d) => d.total > 0).length;
  const derivadosComValor = derivados.filter((d) => d.total > 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <span className="font-heading text-[14px] font-semibold">{label}</span>
          <span className="ml-2 text-[11.5px] text-text-faint">
            {totalItens} item{totalItens === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {totalMes > 0 && <span className="font-mono text-[13px] font-semibold">{formatBRL(totalMes)}/mês</span>}
          <span className="text-text-faint">{aberto ? "▲" : "▼"}</span>
        </div>
      </button>

      {aberto && atalhos.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {atalhos.map((a) => (
            <Link
              key={a.href}
              href={a.href.replace("{cenarioId}", cenarioId)}
              className="flex-1 rounded-lg border border-primary-fill bg-primary-soft px-3 py-2.5 text-[12px] hover:bg-primary-soft/70"
            >
              <span className="font-medium text-primary-deep">{a.label} →</span>
              <span className="mt-0.5 block text-[11px] text-text-muted">{a.descricao}</span>
            </Link>
          ))}
        </div>
      )}

      {aberto && painel}

      {aberto && derivadosComValor.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="flex items-center text-[10.5px] font-medium uppercase tracking-wide text-text-faint">
            Calculado automaticamente
            <InfoTooltip texto="Estes custos já entram neste grupo no EBITDA e nos indicadores, mas o lançamento deles vive em outra tela — o motor deriva o valor mês a mês a partir do que você configurou lá. Para mudar, use o link de cada linha." />
          </p>
          {derivadosComValor.map((d) => (
            <div key={d.rotulo} className="flex items-start justify-between gap-3 rounded-lg border border-dashed border-border bg-bg px-3 py-2.5">
              <div className="text-[12px]">
                <span className="font-medium">{d.rotulo}</span>
                {d.grupo && <span className="ml-1.5 text-[10.5px] text-text-faint">· {d.grupo}</span>}
                <p className="mt-0.5 text-[11px] text-text-muted">{d.detalhe}</p>
                <Link href={d.href.replace("{cenarioId}", cenarioId)} className="mt-0.5 inline-block text-[11px] text-primary-deep underline">
                  Ajustar em {d.ondeEditar} →
                </Link>
              </div>
              <div className="shrink-0 text-right">
                <span className="font-mono text-[12px] font-semibold">{formatBRL(d.total)}</span>
                <span className="block text-[9.5px] text-text-faint">no período</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {aberto &&
        (matrizPorProduto ? (
          <MatrizPorProduto
            cenarioId={cenarioId}
            produtos={produtos}
            planoContas={planoContas}
            fixos={fixos}
            variaveis={variaveis}
            custosEmpresa={custosEmpresa}
            clientesPorProduto={clientesPorProduto}
            receitaPorProduto={receitaPorProduto}
          />
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {[...fixos.map((f) => ({ tipo: "fixo" as const, row: f })), ...variaveis.map((v) => ({ tipo: "variavel" as const, row: v }))].map(
              ({ tipo, row }) => (
                <div key={`${tipo}-${row.id}`} className="flex items-center justify-between rounded-lg bg-bg px-3 py-2.5">
                  <div className="text-[12px]">
                    <span className="font-medium">{row.item}</span>
                    <span className="ml-1.5 text-text-faint">
                      · {row.fases_produto?.produtos?.nome ?? "—"} · {FASE_LABEL.get(row.fases_produto?.fase ?? "") ?? row.fases_produto?.fase}
                    </span>
                    <span className="ml-1.5 text-text-faint">
                      ·{" "}
                      {tipo === "fixo"
                        ? `${(row as CustoFixoRow).quantidade}× ${formatBRL(Number((row as CustoFixoRow).valor_unitario))}`
                        : (() => {
                            const v = row as CustoVariavelRow;
                            return v.tipo_calculo === "percentual_receita" && v.percentual != null
                              ? `${(v.percentual * 100).toFixed(1)}% da receita`
                              : v.tipo_calculo === "valor_por_cliente"
                                ? `${formatBRL(v.valor_por_unidade ?? 0)}/cliente/mês`
                                : v.tipo_calculo === "unico_por_cliente"
                                  ? `${formatBRL(v.valor_por_unidade ?? 0)}/cliente novo`
                                  : formatBRL(v.valor_base ?? 0);
                          })()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold">
                      {formatBRL(
                        tipo === "fixo"
                          ? Number((row as CustoFixoRow).quantidade) * Number((row as CustoFixoRow).valor_unitario)
                          : Number((row as CustoVariavelRow).valor_base) || 0,
                      )}
                    </span>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          if (tipo === "fixo") await excluirCustoFixo(row.id, row.fases_produto?.produto_id ?? "");
                          else await excluirCustoVariavel(row.id, row.fases_produto?.produto_id ?? "");
                        })
                      }
                      className="text-[11px] text-danger"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ),
            )}

            {custosEmpresa.map((c) => (
              <div key={`empresa-${c.id}`} className="flex items-center justify-between rounded-lg bg-bg px-3 py-2.5">
                <div className="text-[12px]">
                  <span className="font-medium">{c.item}</span>
                  <span className="ml-1.5 text-text-faint">· custo da empresa (compartilhado)</span>
                </div>
                <span className="font-mono text-[12px] font-semibold">{formatBRL(custoEmpresaValorMensal(c))}</span>
              </div>
            ))}

            {planoContas.length === 0 ? (
              <p className="text-[11.5px] text-text-faint">Nenhuma conta desse tipo no plano de contas ainda.</p>
            ) : (
              <NovoCustoForm cenarioId={cenarioId} produtos={produtos} planoContas={planoContas} />
            )}
          </div>
        ))}
    </div>
  );
}

// ============================================================================
// Matriz por produto — usada em CSP, Marketing, Vendas, Desenvolvimento e Marca
// ============================================================================

type LinhaMatriz =
  | { modo: "especifico"; chave: string; nome: string; conta: string | null; porProduto: Map<string, { tipo: "fixo" | "variavel"; row: CustoFixoRow | CustoVariavelRow }> }
  | { modo: "compartilhado"; chave: string; row: CustoEmpresaRow };

function agruparPorLinha(fixos: CustoFixoRow[], variaveis: CustoVariavelRow[], custosEmpresa: CustoEmpresaRow[]): LinhaMatriz[] {
  const especificas = new Map<string, LinhaMatriz & { modo: "especifico" }>();

  for (const f of fixos) {
    const produtoId = f.fases_produto?.produto_id;
    if (!produtoId) continue;
    const chave = f.plano_contas_id ?? f.item.toLowerCase();
    if (!especificas.has(chave)) especificas.set(chave, { modo: "especifico", chave, nome: f.item, conta: f.plano_contas?.conta ?? null, porProduto: new Map() });
    especificas.get(chave)!.porProduto.set(produtoId, { tipo: "fixo", row: f });
  }
  for (const v of variaveis) {
    const produtoId = v.fases_produto?.produto_id;
    if (!produtoId) continue;
    const chave = v.plano_contas_id ?? v.item.toLowerCase();
    if (!especificas.has(chave)) especificas.set(chave, { modo: "especifico", chave, nome: v.item, conta: v.plano_contas?.conta ?? null, porProduto: new Map() });
    especificas.get(chave)!.porProduto.set(produtoId, { tipo: "variavel", row: v });
  }

  const compartilhadas: LinhaMatriz[] = custosEmpresa.map((c) => ({ modo: "compartilhado", chave: `empresa-${c.id}`, row: c }));

  return [...especificas.values(), ...compartilhadas];
}

function valorLinhaEspecifica(item: { tipo: "fixo" | "variavel"; row: CustoFixoRow | CustoVariavelRow } | undefined): number {
  if (!item) return 0;
  if (item.tipo === "fixo") {
    const r = item.row as CustoFixoRow;
    return Number(r.quantidade) * Number(r.valor_unitario);
  }
  const r = item.row as CustoVariavelRow;
  return Number(r.valor_base) || 0;
}

function descricaoLinhaEspecifica(item: { tipo: "fixo" | "variavel"; row: CustoFixoRow | CustoVariavelRow } | undefined): string {
  if (!item) return "";
  if (item.tipo === "fixo") {
    const r = item.row as CustoFixoRow;
    return `${r.quantidade}× ${formatBRL(Number(r.valor_unitario))}`;
  }
  const v = item.row as CustoVariavelRow;
  return v.tipo_calculo === "percentual_receita" && v.percentual != null
    ? `${(v.percentual * 100).toFixed(1)}% da receita`
    : v.tipo_calculo === "valor_por_cliente"
      ? `${formatBRL(v.valor_por_unidade ?? 0)}/cliente/mês`
      : v.tipo_calculo === "unico_por_cliente"
        ? `${formatBRL(v.valor_por_unidade ?? 0)}/cliente novo`
        : formatBRL(v.valor_base ?? 0);
}

function MatrizPorProduto({
  cenarioId,
  produtos,
  planoContas,
  fixos,
  variaveis,
  custosEmpresa,
  clientesPorProduto,
  receitaPorProduto = {},
}: {
  cenarioId: string;
  produtos: Produto[];
  planoContas: PlanoContas[];
  fixos: CustoFixoRow[];
  variaveis: CustoVariavelRow[];
  custosEmpresa: CustoEmpresaRow[];
  clientesPorProduto: Record<string, number>;
  receitaPorProduto?: Record<string, number>;
}) {
  const linhas = agruparPorLinha(fixos, variaveis, custosEmpresa);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-4 flex flex-col gap-2">
      {linhas.length === 0 && <p className="text-[11.5px] text-text-faint">Nenhum custo lançado ainda nessa categoria.</p>}

      {linhas.map((linha) => {
        const isAberta = expandida === linha.chave;
        const nome = linha.modo === "especifico" ? linha.nome : linha.row.item;
        const total =
          linha.modo === "especifico"
            ? produtos.reduce((s, p) => s + valorLinhaEspecifica(linha.porProduto.get(p.id)), 0)
            : custoEmpresaValorMensal(linha.row);
        const rateio =
          linha.modo === "compartilhado" ? calcularRateioPorProduto(linha.row.parametros, total, produtos, clientesPorProduto, receitaPorProduto) : null;

        return (
          <div key={linha.chave} className={`rounded-lg border ${isAberta ? "border-primary-fill" : "border-border-soft"} overflow-hidden`}>
            <button
              type="button"
              onClick={() => setExpandida(isAberta ? null : linha.chave)}
              className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left ${isAberta ? "bg-primary-soft" : ""}`}
            >
              <span className={`w-2.5 text-[9px] ${isAberta ? "text-primary-deep" : "text-text-faint"}`}>{isAberta ? "▾" : "▸"}</span>
              <span className="text-[12.5px] font-semibold">{nome}</span>
              <span className="rounded bg-bg px-1.5 py-0.5 text-[9.5px] text-text-muted">
                {linha.modo === "especifico" ? "Específico por produto" : "Compartilhado (rateado)"}
              </span>
              <span className="ml-auto font-mono text-[12.5px] font-semibold">{formatBRL(total)}</span>
            </button>

            {isAberta && (
              <div className="border-t border-border-soft overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="w-[110px]"></th>
                      {produtos.map((p) => (
                        <th key={p.id} className="border-l border-border-soft px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-text-faint">
                          {p.nome}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linha.modo === "especifico" ? (
                      <>
                        <tr>
                          <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Como calcula</th>
                          {produtos.map((p) => {
                            const item = linha.porProduto.get(p.id);
                            return (
                              <td key={p.id} className="border-l border-t border-border-soft px-3 py-2 font-mono text-[11px]">
                                {item ? descricaoLinhaEspecifica(item) : <span className="font-sans italic text-text-faint">não usa</span>}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Total no mês</th>
                          {produtos.map((p) => {
                            const item = linha.porProduto.get(p.id);
                            return (
                              <td key={p.id} className="border-l border-t border-border-soft bg-primary-soft px-3 py-2 font-mono text-[11.5px] font-semibold text-primary-deep">
                                {item ? formatBRL(valorLinhaEspecifica(item)) : "R$ 0"}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted"></th>
                          {produtos.map((p) => {
                            const item = linha.porProduto.get(p.id);
                            return (
                              <td key={p.id} className="border-l border-t border-border-soft px-3 py-2">
                                {item && (
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() =>
                                      startTransition(async () => {
                                        if (item.tipo === "fixo") await excluirCustoFixo(item.row.id, p.id);
                                        else await excluirCustoVariavel(item.row.id, p.id);
                                      })
                                    }
                                    className="text-[10.5px] text-danger"
                                  >
                                    Remover
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      </>
                    ) : (
                      <>
                        <tr>
                          <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
                            {linha.modo === "compartilhado" && rateioPorReceita(linha.row.parametros, linha.row.tipo_custo as TipoCustoEmpresa) ? "Receita do mês" : "Clientes ativos"}
                          </th>
                          {produtos.map((p) => {
                            const porReceita = linha.modo === "compartilhado" && rateioPorReceita(linha.row.parametros, linha.row.tipo_custo as TipoCustoEmpresa);
                            return (
                              <td key={p.id} className="border-l border-t border-border-soft bg-primary-soft px-3 py-2 font-mono text-[11px] text-primary-deep">
                                {porReceita ? formatBRL(receitaPorProduto[p.id] ?? 0) : (clientesPorProduto[p.id] ?? 0)} ({formatPct(rateio?.find((r) => r.produtoId === p.id)?.percentual ?? 0)})
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Rateio calculado</th>
                          {produtos.map((p) => (
                            <td key={p.id} className="border-l border-t border-border-soft bg-primary-soft px-3 py-2 font-mono text-[11.5px] font-semibold text-primary-deep">
                              {formatBRL(rateio?.find((r) => r.produtoId === p.id)?.valor ?? 0)}
                            </td>
                          ))}
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>

                {linha.modo === "compartilhado" && (
                  <div className="border-t border-border-soft p-3">
                    <EditarCompartilhadoForm cenarioId={cenarioId} produtos={produtos} custo={linha.row} />
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => startTransition(() => excluirCustoEmpresa(linha.row.id))}
                      className="mt-2 text-[11px] text-danger"
                    >
                      Remover essa conta compartilhada
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {planoContas.length === 0 ? (
        <p className="text-[11.5px] text-text-faint">Nenhuma conta desse tipo no plano de contas ainda.</p>
      ) : (
        <NovoCustoMatrizForm cenarioId={cenarioId} produtos={produtos} planoContas={planoContas} />
      )}
    </div>
  );
}

function EditarCompartilhadoForm({ cenarioId, produtos, custo }: { cenarioId: string; produtos: Produto[]; custo: CustoEmpresaRow }) {
  const [state, formAction, pending] = useActionState(atualizarCustoEmpresa, initialState);
  const [rateioModo, setRateioModo] = useState<"auto_clientes" | "auto_receita" | "manual">(custo.parametros.rateio_modo ?? (rateioPorReceita(custo.parametros, custo.tipo_custo as TipoCustoEmpresa) ? "auto_receita" : "auto_clientes"));

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <input type="hidden" name="id" value={custo.id} />
      <input type="hidden" name="item" value={custo.item} />
      <input type="hidden" name="plano_contas_id" value={custo.plano_contas_id ?? ""} />
      <input type="hidden" name="tipo_custo" value={custo.tipo_custo} />

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Valor mensal (R$)</label>
          <input name="valor_mensal" type="number" step="0.01" defaultValue={custo.valor_mensal ?? undefined} className="input w-[130px]" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Rateio</label>
          <select
            value={rateioModo}
            onChange={(e) => setRateioModo(e.target.value as "auto_clientes" | "auto_receita" | "manual")}
            name="rateio_modo"
            className="input w-[170px]"
          >
            <option value="auto_clientes">Automático (clientes ativos)</option>
            <option value="auto_receita">Automático (receita do produto)</option>
            <option value="manual">Manual, por produto</option>
          </select>
        </div>
      </div>

      {rateioModo === "manual" && (
        <div className="flex flex-wrap gap-2 rounded-lg bg-bg p-2.5">
          {produtos.map((p) => (
            <div key={p.id}>
              <label className="mb-1 block text-[10px] text-text-faint">{p.nome} (%)</label>
              <input
                name={`rateio_manual_${p.id}`}
                type="number"
                step="0.1"
                defaultValue={custo.parametros.rateio_manual?.[p.id] != null ? (custo.parametros.rateio_manual[p.id] * 100).toFixed(1) : undefined}
                className="input w-[90px]"
              />
            </div>
          ))}
        </div>
      )}

      <button type="submit" disabled={pending} className="self-start rounded-lg border border-border px-3 py-1.5 text-[11.5px] font-medium text-primary-deep disabled:opacity-60">
        {pending ? "Salvando…" : "Salvar rateio"}
      </button>
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

function NovoCustoMatrizForm({ cenarioId, produtos, planoContas }: { cenarioId: string; produtos: Produto[]; planoContas: PlanoContas[] }) {
  const [modo, setModo] = useState<"especifico" | "compartilhado">("especifico");

  return (
    <div className="rounded-lg border border-dashed border-border p-3">
      <div className="mb-2.5 flex gap-1 rounded-lg bg-bg p-1" style={{ maxWidth: 320 }}>
        <button
          type="button"
          onClick={() => setModo("especifico")}
          className={`flex-1 rounded-md py-1.5 text-[11.5px] font-medium ${modo === "especifico" ? "bg-surface shadow-sm" : "text-text-muted"}`}
        >
          Específico por produto
        </button>
        <button
          type="button"
          onClick={() => setModo("compartilhado")}
          className={`flex-1 rounded-md py-1.5 text-[11.5px] font-medium ${modo === "compartilhado" ? "bg-surface shadow-sm" : "text-text-muted"}`}
        >
          Compartilhado (rateado)
        </button>
      </div>
      {modo === "especifico" ? (
        <NovoCustoForm cenarioId={cenarioId} produtos={produtos} planoContas={planoContas} />
      ) : (
        <NovoCustoCompartilhadoForm cenarioId={cenarioId} produtos={produtos} planoContas={planoContas} />
      )}
    </div>
  );
}

function NovoCustoCompartilhadoForm({ cenarioId, produtos, planoContas }: { cenarioId: string; produtos: Produto[]; planoContas: PlanoContas[] }) {
  const [state, formAction, pending] = useActionState(criarCustoEmpresa, initialState);
  const [tipoCusto, setTipoCusto] = useState<TipoCustoEmpresa>("fixo");
  const [rateioModo, setRateioModo] = useState<"auto_clientes" | "auto_receita" | "manual">("auto_clientes");
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        fd.set("cenario_id", cenarioId);
        await formAction(fd);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-[10.5px] text-text-faint">Item</label>
          <input name="item" type="text" placeholder="Ex: Infraestrutura e Cloud" required className="input w-full" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Conta</label>
          <select name="plano_contas_id" className="input w-[170px]" defaultValue="">
            <option value="">Selecione…</option>
            {planoContas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.conta}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Como calcula</label>
          <select name="tipo_custo" value={tipoCusto} onChange={(e) => setTipoCusto(e.target.value as TipoCustoEmpresa)} className="input w-[160px]">
            {Object.entries(TIPO_CUSTO_EMPRESA_LABEL)
              .filter(([v]) => v !== "escalonado" && v !== "cronograma")
              .map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {tipoCusto === "fixo" && (
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Valor mensal (R$)</label>
            <input name="valor_mensal" type="number" step="0.01" required className="input w-[130px]" />
          </div>
        )}
        {tipoCusto === "variavel_receita" && (
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">% da receita</label>
            <input name="percentual" type="number" step="0.01" required className="input w-[110px]" />
          </div>
        )}
        {tipoCusto === "variavel_cliente" && (
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">R$/cliente/mês</label>
            <input name="valor_por_cliente" type="number" step="0.01" required className="input w-[130px]" />
          </div>
        )}

        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Rateio entre produtos</label>
          <select value={rateioModo} onChange={(e) => setRateioModo(e.target.value as "auto_clientes" | "auto_receita" | "manual")} name="rateio_modo" className="input w-[190px]">
            <option value="auto_clientes">Automático (clientes ativos)</option>
            <option value="auto_receita">Automático (receita do produto)</option>
            <option value="manual">Manual, por produto</option>
          </select>
        </div>

        <button type="submit" disabled={pending} className="rounded-lg border border-border px-3.5 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60">
          {pending ? "…" : "+ Adicionar"}
        </button>
      </div>

      {rateioModo === "manual" && (
        <div className="flex flex-wrap gap-2 rounded-lg bg-bg p-2.5">
          {produtos.map((p) => (
            <div key={p.id}>
              <label className="mb-1 block text-[10px] text-text-faint">{p.nome} (%)</label>
              <input name={`rateio_manual_${p.id}`} type="number" step="0.1" className="input w-[90px]" />
            </div>
          ))}
        </div>
      )}

      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

function NovoCustoForm({ cenarioId, produtos, planoContas }: { cenarioId: string; produtos: Produto[]; planoContas: PlanoContas[] }) {
  const [tipo, setTipo] = useState<"fixo" | "variavel">("fixo");
  const [tipoCalculo, setTipoCalculo] = useState("valor_fixo");
  const [stateFixo, actionFixo, pendingFixo] = useActionState(criarCustoFixo, initialState);
  const [stateVariavel, actionVariavel, pendingVariavel] = useActionState(criarCustoVariavel, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const pending = tipo === "fixo" ? pendingFixo : pendingVariavel;
  const state = tipo === "fixo" ? stateFixo : stateVariavel;

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        fd.set("cenario_id", cenarioId);
        if (tipo === "fixo") await actionFixo(fd);
        else await actionVariavel(fd);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Produto</label>
          <select name="produto_id" required className="input w-[140px]">
            <option value="">Selecione…</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Fase</label>
          <select name="fase" required className="input w-[140px]">
            {FASES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Conta</label>
          <select name="plano_contas_id" className="input w-[170px]" defaultValue="">
            <option value="">Selecione…</option>
            {planoContas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.conta}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Fixo ou variável</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as "fixo" | "variavel")} className="input w-[110px]">
            <option value="fixo">Fixo</option>
            <option value="variavel">Variável</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-[10.5px] text-text-faint">Item</label>
          <input name="item" type="text" placeholder="Ex: Infra cloud, Mídia paga" required className="input w-full" />
        </div>

        {tipo === "fixo" ? (
          <>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Qtd.</label>
              <input name="quantidade" type="number" step="0.5" min="0" defaultValue={1} className="input w-[70px]" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Valor unit. (R$)</label>
              <input name="valor_unitario" type="number" step="0.01" min="0" required className="input w-[110px]" />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Como calcula</label>
              <select name="tipo_calculo" value={tipoCalculo} onChange={(e) => setTipoCalculo(e.target.value)} className="input w-[160px]">
                {Object.entries(TIPO_CALCULO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {tipoCalculo === "percentual_receita" ? (
              <div>
                <label className="mb-1 block text-[10.5px] text-text-faint">% da receita</label>
                <input name="percentual" type="number" step="0.01" required className="input w-[110px]" />
              </div>
            ) : tipoCalculo === "valor_por_cliente" ? (
              <>
                <div>
                  <label className="mb-1 block text-[10.5px] text-text-faint">Base fixa (R$, opcional)</label>
                  <input name="valor_base" type="number" step="0.01" className="input w-[120px]" />
                </div>
                <div>
                  <label className="mb-1 block text-[10.5px] text-text-faint">R$/cliente/mês</label>
                  <input name="valor_por_unidade" type="number" step="0.01" required className="input w-[120px]" />
                </div>
              </>
            ) : tipoCalculo === "unico_por_cliente" ? (
              <div>
                <label className="mb-1 block text-[10.5px] text-text-faint">R$/cliente novo</label>
                <input name="valor_por_unidade" type="number" step="0.01" required className="input w-[120px]" />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-[10.5px] text-text-faint">Valor mensal (R$)</label>
                <input name="valor_base" type="number" step="0.01" required className="input w-[120px]" />
              </div>
            )}
          </>
        )}

        <button type="submit" disabled={pending} className="rounded-lg border border-border px-3.5 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60">
          {pending ? "…" : "+ Adicionar"}
        </button>
      </div>
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}
