"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  clientesTotaisAcao,
  custoAcaoPorMes,
  custoTotalAcao,
  PARCELAS_FEIRA,
  type AcaoMarketing,
  type RetornoAcao,
} from "@/lib/acoes-marketing";
import { excluirAcaoMarketing, salvarAcaoMarketing } from "./acoes-marketing-actions";

export type ProdutoPlanos = {
  id: string;
  nome: string;
  planos: { nome: string; preco: number }[];
  niveis: { nome: string; preco: number }[];
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function formatMes(iso: string) {
  return new Date(iso.slice(0, 7) + "-01T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}
function formatNum(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

type LinhaRetorno = { produto_id: string; plano: string; clientes: string };
type Rascunho = {
  id: string | null;
  tipo: "feira" | "evento";
  nome: string;
  mes: string;
  ano: string;
  quantidade: string;
  custo: string;
  observacoes: string;
  retorno: LinhaRetorno[];
};

const VAZIO: Rascunho = { id: null, tipo: "feira", nome: "", mes: "", ano: "", quantidade: "", custo: "", observacoes: "", retorno: [] };

/** plano: "" (mix do produto) | "plano:Nome" | "modulo:Nome" */
function planoDeLinha(plano: string): Pick<RetornoAcao, "plano_tipo" | "plano_nome"> {
  if (!plano) return { plano_tipo: null, plano_nome: null };
  const [tipo, ...nome] = plano.split(":");
  return { plano_tipo: tipo as "plano" | "modulo", plano_nome: nome.join(":") };
}

/**
 * Feiras e eventos do plano de marketing. Feira: custo em 3 parcelas até o mês dela, vendas no mês
 * da feira. Evento: custo do ano provisionado em 12 parcelas fixas e vendas distribuídas no ano.
 * As vendas entram no canal direto; o custo, na linha de Marketing (e no CAC).
 */
export function FeirasEventos({ cenarioId, acoes, produtos }: { cenarioId: string; acoes: AcaoMarketing[]; produtos: ProdutoPlanos[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const nomeProduto = new Map(produtos.map((p) => [p.id, p.nome]));

  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setRascunho((r) => (r ? { ...r, [k]: v } : r));

  function editar(a: AcaoMarketing) {
    setErro(null);
    setRascunho({
      id: a.id,
      tipo: a.tipo,
      nome: a.nome,
      mes: a.mes?.slice(0, 7) ?? "",
      ano: a.ano ? String(a.ano) : "",
      quantidade: a.quantidade ? String(a.quantidade) : "",
      custo: String(a.custo ?? ""),
      observacoes: a.observacoes ?? "",
      retorno: (a.retorno ?? []).map((r) => ({
        produto_id: r.produto_id,
        plano: r.plano_tipo && r.plano_nome ? `${r.plano_tipo}:${r.plano_nome}` : "",
        clientes: String(r.clientes),
      })),
    });
  }

  function salvar() {
    if (!rascunho) return;
    setErro(null);
    startTransition(async () => {
      const r = await salvarAcaoMarketing(cenarioId, {
        id: rascunho.id,
        tipo: rascunho.tipo,
        nome: rascunho.nome,
        mes: rascunho.mes || null,
        ano: rascunho.ano ? Number(rascunho.ano) : null,
        quantidade: rascunho.quantidade ? Number(rascunho.quantidade) : null,
        custo: Number(rascunho.custo || 0),
        observacoes: rascunho.observacoes || null,
        retorno: rascunho.retorno.map((l) => ({ produto_id: l.produto_id, clientes: Number(l.clientes || 0), ...planoDeLinha(l.plano) })),
      });
      if (r.error) setErro(r.error);
      else setRascunho(null);
      router.refresh();
    });
  }

  function excluir(a: AcaoMarketing) {
    if (!confirm(`Excluir "${a.nome}"? O custo e as vendas previstas saem da projeção.`)) return;
    startTransition(async () => {
      const r = await excluirAcaoMarketing(a.id, cenarioId);
      if (r.error) setErro(r.error);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-primary-fill/50 bg-primary-soft/20 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-[13px] font-semibold">Feiras e eventos</h3>
          <p className="mt-0.5 max-w-3xl text-[11px] text-text-muted">
            <b>Feira:</b> custo em {PARCELAS_FEIRA} parcelas até o mês da feira; as vendas previstas entram no mês da feira.{" "}
            <b>Eventos:</b> o custo do ano (quantidade × custo médio) vira um custo fixo mensal nos 12 meses, e os clientes do ano
            entram distribuídos mês a mês. Em ambos, as vendas entram no canal direto e o custo na linha de Marketing (conta 2.1.8).
          </p>
        </div>
        {!rascunho && (
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setRascunho({ ...VAZIO, tipo: "feira" })} className="rounded-lg bg-wine-deep px-3 py-1.5 text-[12px] font-medium text-white">
              + Feira
            </button>
            <button type="button" onClick={() => setRascunho({ ...VAZIO, tipo: "evento" })} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-primary-deep">
              + Eventos do ano
            </button>
          </div>
        )}
      </div>

      {acoes.length === 0 && !rascunho && <p className="text-[11.5px] text-text-faint">Nenhuma feira ou evento cadastrado neste cenário.</p>}

      <div className="flex flex-col gap-2">
        {acoes.map((a) => {
          const total = custoTotalAcao(a);
          const clientes = clientesTotaisAcao(a);
          const meses = [...custoAcaoPorMes(a).keys()];
          return (
            <div key={a.id} className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[12px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="mr-1.5 rounded bg-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-text-muted">{a.tipo === "feira" ? "Feira" : "Eventos"}</span>
                  <span className="font-medium">{a.nome}</span>
                  <span className="ml-1.5 text-text-muted">
                    {a.tipo === "feira" && a.mes ? `· ${formatMes(a.mes)}` : `· ${a.ano} · ${a.quantidade} evento${a.quantidade === 1 ? "" : "s"} × ${formatBRL(Number(a.custo))}`}
                  </span>
                  <p className="mt-1 text-[11px] text-text-muted">
                    Custo {formatBRL(total)}
                    {a.tipo === "feira"
                      ? ` em ${PARCELAS_FEIRA}× de ${formatBRL(total / PARCELAS_FEIRA)} (${meses.map(formatMes).join(", ")})`
                      : ` → ${formatBRL(total / 12)}/mês de ${formatMes(meses[0])} a ${formatMes(meses[meses.length - 1])}`}
                    {clientes > 0 && ` · ${formatNum(clientes)} cliente${clientes === 1 ? "" : "s"}${a.tipo === "evento" ? ` no ano (${formatNum(clientes / 12)}/mês)` : " no mês da feira"} · custo por cliente ${formatBRL(total / clientes)}`}
                  </p>
                  {(a.retorno ?? []).length > 0 && (
                    <p className="mt-0.5 text-[11px] text-text-faint">
                      Retorno {a.tipo === "feira" ? "na feira" : "por evento"}:{" "}
                      {a.retorno.map((r) => `${formatNum(Number(r.clientes))} ${nomeProduto.get(r.produto_id) ?? "produto"}${r.plano_nome ? ` (${r.plano_nome})` : ""}`).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" disabled={isPending} onClick={() => editar(a)} className="text-[11px] text-primary-deep">
                    Editar
                  </button>
                  <button type="button" disabled={isPending} onClick={() => excluir(a)} className="text-[11px] text-danger">
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {rascunho && (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            {rascunho.id ? "Editar" : "Nova"} {rascunho.tipo === "feira" ? "feira" : "linha de eventos"}
          </div>
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3">
            <div>
              <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Nome</label>
              <input className="input" value={rascunho.nome} onChange={(e) => set("nome", e.target.value)} placeholder={rascunho.tipo === "feira" ? "Ex: Fenim 2027" : "Ex: Workshops com associações"} />
            </div>
            {rascunho.tipo === "feira" ? (
              <>
                <div>
                  <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Mês e ano da feira</label>
                  <input className="input" type="month" value={rascunho.mes} onChange={(e) => set("mes", e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Custo estimado (R$)</label>
                  <input className="input" type="number" min={0} step="0.01" value={rascunho.custo} onChange={(e) => set("custo", e.target.value)} />
                </div>
                <div className="self-end pb-2 text-[10.5px] text-text-faint">
                  {rascunho.custo && rascunho.mes ? `${PARCELAS_FEIRA}× de ${formatBRL(Number(rascunho.custo) / PARCELAS_FEIRA)}` : `pago em ${PARCELAS_FEIRA} parcelas`}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Ano</label>
                  <input className="input" type="number" min={2020} max={2100} value={rascunho.ano} onChange={(e) => set("ano", e.target.value)} placeholder="2027" />
                </div>
                <div>
                  <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Quantidade de eventos</label>
                  <input className="input" type="number" min={1} step={1} value={rascunho.quantidade} onChange={(e) => set("quantidade", e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Custo médio por evento (R$)</label>
                  <input className="input" type="number" min={0} step="0.01" value={rascunho.custo} onChange={(e) => set("custo", e.target.value)} />
                </div>
              </>
            )}
          </div>
          {rascunho.tipo === "evento" && rascunho.custo && rascunho.quantidade && (
            <p className="-mt-1 text-[10.5px] text-text-faint">
              {formatBRL(Number(rascunho.custo) * Number(rascunho.quantidade))} no ano → {formatBRL((Number(rascunho.custo) * Number(rascunho.quantidade)) / 12)}/mês de custo fixo de eventos
            </p>
          )}

          <div>
            <label className="mb-1 block text-[10.5px] font-medium text-text-muted">
              Retorno previsto {rascunho.tipo === "feira" ? "na feira" : "por evento"} — clientes por ferramenta e plano
            </label>
            <div className="flex flex-col gap-2">
              {rascunho.retorno.map((l, i) => {
                const produto = produtos.find((p) => p.id === l.produto_id);
                const atualizar = (patch: Partial<LinhaRetorno>) =>
                  set("retorno", rascunho.retorno.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="grid grid-cols-[1.2fr_1.6fr_0.7fr_auto] items-center gap-2">
                    <select className="input" value={l.produto_id} onChange={(e) => atualizar({ produto_id: e.target.value, plano: "" })}>
                      <option value="">Ferramenta…</option>
                      {produtos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                    <select className="input" value={l.plano} onChange={(e) => atualizar({ plano: e.target.value })} disabled={!produto}>
                      <option value="">Mix de planos do produto</option>
                      {(produto?.niveis ?? []).map((n) => (
                        <option key={`m-${n.nome}`} value={`modulo:${n.nome}`}>
                          Nível {n.nome} — {formatBRL(n.preco)}/mês
                        </option>
                      ))}
                      {(produto?.planos ?? []).map((p) => (
                        <option key={`p-${p.nome}`} value={`plano:${p.nome}`}>
                          Plano {p.nome} — {formatBRL(p.preco)}/mês
                        </option>
                      ))}
                    </select>
                    <input className="input" type="number" min={0} step="0.5" placeholder="clientes" value={l.clientes} onChange={(e) => atualizar({ clientes: e.target.value })} />
                    <button type="button" onClick={() => set("retorno", rascunho.retorno.filter((_, j) => j !== i))} className="px-1 text-[13px] text-danger">
                      ×
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => set("retorno", [...rascunho.retorno, { produto_id: produtos[0]?.id ?? "", plano: "", clientes: "" }])}
                className="w-fit text-[11.5px] font-medium text-primary-deep"
              >
                + ferramenta / plano
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Observações (opcional)</label>
            <input className="input" value={rascunho.observacoes} onChange={(e) => set("observacoes", e.target.value)} placeholder="Ex: estande compartilhado com a associação" />
          </div>

          {erro && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] text-danger">{erro}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={isPending} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60">
              {isPending ? "Salvando e recalculando…" : "Salvar e recalcular"}
            </button>
            <button type="button" disabled={isPending} onClick={() => setRascunho(null)} className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] text-text-muted">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && !rascunho && <p className="mt-2 text-[11.5px] text-danger">{erro}</p>}
    </div>
  );
}
