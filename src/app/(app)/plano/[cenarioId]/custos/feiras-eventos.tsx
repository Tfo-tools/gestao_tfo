"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  acaoSemRetorno,
  clientesMensaisCampanha,
  clientesTotaisAcao,
  custoAcaoPorMes,
  custoTotalAcao,
  LABEL_TIPO_ACAO,
  leadsMensaisCampanha,
  mesesDaCampanha,
  PARCELAS_FEIRA,
  type AcaoMarketing,
  type RetornoAcao,
  type TipoAcao,
} from "@/lib/acoes-marketing";
import { duplicarAcaoMarketing, excluirAcaoMarketing, salvarAcaoMarketing } from "./acoes-marketing-actions";
import { InfoTooltip } from "@/components/info-tooltip";

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

const CANAIS_MIDIA = ["Google Ads", "LinkedIn Ads", "Instagram / Meta Ads", "TikTok Ads", "E-mail / automação", "Outro"];

type LinhaRetorno = { produto_id: string; plano: string; clientes: string };
type Rascunho = {
  id: string | null;
  tipo: TipoAcao;
  nome: string;
  mes: string;
  mes_fim: string;
  ano: string;
  quantidade: string;
  custo: string;
  estande: string;
  logistica: string;
  material: string;
  canal: string;
  cpl: string;
  /** Em %, como a pessoa digita (3,5). */
  conversao: string;
  soma_na_meta: boolean;
  observacoes: string;
  retorno: LinhaRetorno[];
};

const VAZIO: Rascunho = {
  id: null, tipo: "feira", nome: "", mes: "", mes_fim: "", ano: "", quantidade: "", custo: "", estande: "", logistica: "", material: "",
  canal: CANAIS_MIDIA[0], cpl: "", conversao: "", soma_na_meta: false, observacoes: "", retorno: [],
};

/** plano: "" (mix do produto) | "plano:Nome" | "modulo:Nome" */
function planoDeLinha(plano: string): Pick<RetornoAcao, "plano_tipo" | "plano_nome"> {
  if (!plano) return { plano_tipo: null, plano_nome: null };
  const [tipo, ...nome] = plano.split(":");
  return { plano_tipo: tipo as "plano" | "modulo", plano_nome: nome.join(":") };
}

function numOuNull(v: string): number | null {
  return v.trim() === "" ? null : Number(v.replace(",", "."));
}

/** Custo da feira: com estande/logística/material preenchidos, é a soma deles. */
function custoDaFeira(r: Rascunho): number {
  const partes = [r.estande, r.logistica, r.material];
  if (partes.every((v) => v.trim() === "")) return Number(r.custo || 0);
  return partes.reduce((s, v) => s + Number(v || 0), 0);
}

/** O rascunho como ação, pra reaproveitar as mesmas regras de custo e clientes na prévia. */
function acaoDoRascunho(r: Rascunho): AcaoMarketing {
  return {
    id: r.id ?? "novo",
    tipo: r.tipo,
    nome: r.nome,
    mes: r.mes ? `${r.mes}-01` : null,
    mes_fim: r.mes_fim ? `${r.mes_fim}-01` : null,
    ano: r.ano ? Number(r.ano) : null,
    quantidade: r.quantidade ? Number(r.quantidade) : null,
    custo: r.tipo === "feira" ? custoDaFeira(r) : Number(r.custo || 0),
    retorno: r.retorno.map((l) => ({ produto_id: l.produto_id, clientes: Number(l.clientes || 0), ...planoDeLinha(l.plano) })),
    parametros: { cpl: numOuNull(r.cpl), conversao: numOuNull(r.conversao) != null ? Number(numOuNull(r.conversao)) / 100 : null, canal: r.canal },
    soma_na_meta: r.soma_na_meta,
  };
}

function anoDaAcao(a: AcaoMarketing): string {
  return a.tipo === "evento" ? String(a.ano ?? "") : (a.mes ?? "").slice(0, 4);
}

/**
 * Ações do plano de marketing: feiras, eventos do ano e campanhas de mídia. Custo na linha de
 * Marketing (e no CAC). Os clientes previstos explicam a meta do canal direto — a cobertura aparece
 * logo abaixo — e só somam à projeção quando a ação é marcada pra isso.
 */
export function FeirasEventos({
  cenarioId,
  acoes,
  produtos,
  fimCenario,
}: {
  cenarioId: string;
  acoes: AcaoMarketing[];
  produtos: ProdutoPlanos[];
  fimCenario?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const nomeProduto = new Map(produtos.map((p) => [p.id, p.nome]));

  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setRascunho((r) => (r ? { ...r, [k]: v } : r));

  function novo(tipo: TipoAcao) {
    setErro(null);
    setRascunho({ ...VAZIO, tipo, retorno: tipo === "campanha" ? [{ produto_id: produtos[0]?.id ?? "", plano: "", clientes: "1" }] : [] });
  }

  function editar(a: AcaoMarketing) {
    setErro(null);
    const p = a.parametros ?? {};
    const temPartes = p.estande != null || p.logistica != null || p.material != null;
    setRascunho({
      id: a.id,
      tipo: a.tipo,
      nome: a.nome,
      mes: a.mes?.slice(0, 7) ?? "",
      mes_fim: a.mes_fim?.slice(0, 7) ?? "",
      ano: a.ano ? String(a.ano) : "",
      quantidade: a.quantidade ? String(a.quantidade) : "",
      custo: String(a.custo ?? ""),
      // Feira antiga, sem composição: o custo inteiro aparece como estande, pra ninguém perder o valor.
      estande: temPartes ? (p.estande != null ? String(p.estande) : "") : a.tipo === "feira" ? String(a.custo ?? "") : "",
      logistica: p.logistica != null ? String(p.logistica) : "",
      material: p.material != null ? String(p.material) : "",
      canal: p.canal ?? CANAIS_MIDIA[0],
      cpl: p.cpl != null ? String(p.cpl) : "",
      conversao: p.conversao != null ? String(Number((p.conversao * 100).toFixed(3))) : "",
      soma_na_meta: a.soma_na_meta === true,
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
    const r = rascunho;
    startTransition(async () => {
      const res = await salvarAcaoMarketing(cenarioId, {
        id: r.id,
        tipo: r.tipo,
        nome: r.nome,
        mes: r.mes || null,
        mes_fim: r.mes_fim || null,
        ano: r.ano ? Number(r.ano) : null,
        quantidade: r.quantidade ? Number(r.quantidade) : null,
        custo: r.tipo === "feira" ? custoDaFeira(r) : Number(r.custo || 0),
        parametros:
          r.tipo === "feira"
            ? { estande: numOuNull(r.estande), logistica: numOuNull(r.logistica), material: numOuNull(r.material) }
            : r.tipo === "campanha"
              ? { canal: r.canal, cpl: numOuNull(r.cpl), conversao: numOuNull(r.conversao) != null ? Number(numOuNull(r.conversao)) / 100 : null }
              : {},
        soma_na_meta: r.soma_na_meta,
        observacoes: r.observacoes || null,
        retorno: r.retorno.map((l) => ({ produto_id: l.produto_id, clientes: Number(l.clientes || 0), ...planoDeLinha(l.plano) })),
      });
      if (res.error) setErro(res.error);
      else setRascunho(null);
      router.refresh();
    });
  }

  function duplicar(a: AcaoMarketing) {
    setErro(null);
    startTransition(async () => {
      const r = await duplicarAcaoMarketing(a.id, cenarioId);
      if (r.error) setErro(r.error);
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

  const grupos = useMemo(() => {
    const m = new Map<string, AcaoMarketing[]>();
    for (const a of acoes) {
      const k = anoDaAcao(a) || "sem data";
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [acoes]);

  // O custo do ano soma o que cai naquele ano — campanha que atravessa o ano pesa nos dois.
  const custoNoAno = (ano: string) =>
    acoes.reduce((s, a) => s + [...custoAcaoPorMes(a, fimCenario)].filter(([m]) => m.startsWith(ano)).reduce((t, [, v]) => t + v, 0), 0);

  const previa = rascunho ? acaoDoRascunho(rascunho) : null;

  return (
    <div className="mt-4 rounded-lg border border-primary-fill/50 bg-primary-soft/20 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center font-heading text-[13px] font-semibold">
            Ações de marketing
            <InfoTooltip texto="Feiras, eventos do ano e campanhas de mídia. O custo entra na coluna Marketing (e no CAC). Os clientes previstos explicam a meta do canal direto — o quadro de cobertura logo abaixo mostra quanto da meta está coberto por ações e quanto de verba faltaria. Só somam à projeção se você marcar isso na ação." />
          </h3>
          <p className="mt-0.5 max-w-3xl text-[11px] text-text-muted">
            <b>Feira:</b> estande + logística + material, pago em {PARCELAS_FEIRA} parcelas até o mês dela. <b>Eventos:</b> custo do ano vira
            um fixo mensal. <b>Campanha:</b> verba mensal ÷ custo por lead × conversão = clientes por mês.
          </p>
        </div>
        {!rascunho && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={() => novo("feira")} className="rounded-lg bg-wine-deep px-3 py-1.5 text-[12px] font-medium text-white">
              + Feira
            </button>
            <button type="button" onClick={() => novo("evento")} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-primary-deep">
              + Eventos do ano
            </button>
            <button type="button" onClick={() => novo("campanha")} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-primary-deep">
              + Campanha de mídia
            </button>
          </div>
        )}
      </div>

      {acoes.length === 0 && !rascunho && <p className="text-[11.5px] text-text-faint">Nenhuma ação de marketing cadastrada neste cenário.</p>}

      <div className="flex flex-col gap-3">
        {grupos.map(([ano, lista]) => (
          <div key={ano}>
            <div className="mb-1.5 flex items-baseline justify-between border-b border-border-soft pb-1">
              <span className="text-[12px] font-semibold">{ano}</span>
              {ano !== "sem data" && <span className="text-[11px] text-text-muted">custo das ações no ano: {formatBRL(custoNoAno(ano))}</span>}
            </div>
            <div className="flex flex-col gap-2">
              {lista.map((a) => {
                const total = custoTotalAcao(a, fimCenario);
                const clientes = clientesTotaisAcao(a, fimCenario);
                const meses = [...custoAcaoPorMes(a, fimCenario).keys()];
                const p = a.parametros ?? {};
                return (
                  <div key={a.id} className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[12px]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="mr-1.5 rounded bg-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-text-muted">{LABEL_TIPO_ACAO[a.tipo]}</span>
                        <span className="font-medium">{a.nome}</span>
                        <span className="ml-1.5 text-text-muted">
                          {a.tipo === "feira" && a.mes
                            ? `· ${formatMes(a.mes)}`
                            : a.tipo === "campanha"
                              ? `· ${p.canal ?? "mídia"} · ${formatBRL(Number(a.custo))}/mês de ${meses.length ? formatMes(meses[0]) : "—"} a ${meses.length ? formatMes(meses[meses.length - 1]) : "—"}${a.mes_fim ? "" : " (fim do cenário)"}`
                              : `· ${a.quantidade} evento${a.quantidade === 1 ? "" : "s"} × ${formatBRL(Number(a.custo))}`}
                        </span>
                        {a.soma_na_meta && <span className="ml-1.5 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] text-warning">soma à projeção</span>}
                        <p className="mt-1 text-[11px] text-text-muted">
                          Custo {formatBRL(total)}
                          {a.tipo === "feira"
                            ? ` em ${PARCELAS_FEIRA}× de ${formatBRL(total / PARCELAS_FEIRA)} (${meses.map(formatMes).join(", ")})`
                            : a.tipo === "evento"
                              ? ` → ${formatBRL(total / 12)}/mês de ${formatMes(meses[0])} a ${formatMes(meses[meses.length - 1])}`
                              : ` no período · ${formatNum(leadsMensaisCampanha(a))} leads e ${formatNum(clientesMensaisCampanha(a))} clientes por mês`}
                          {clientes > 0 && ` · ${formatNum(clientes)} cliente${clientes === 1 ? "" : "s"} · custo por cliente ${formatBRL(total / clientes)}`}
                        </p>
                        {a.tipo === "feira" && (p.estande != null || p.logistica != null || p.material != null) && (
                          <p className="mt-0.5 text-[11px] text-text-faint">
                            Estande {formatBRL(Number(p.estande ?? 0))} · logística {formatBRL(Number(p.logistica ?? 0))} · material {formatBRL(Number(p.material ?? 0))}
                          </p>
                        )}
                        {(a.retorno ?? []).length > 0 && a.tipo !== "campanha" && (
                          <p className="mt-0.5 text-[11px] text-text-faint">
                            Retorno {a.tipo === "feira" ? "na feira" : "por evento"}:{" "}
                            {a.retorno.map((r) => `${formatNum(Number(r.clientes))} ${nomeProduto.get(r.produto_id) ?? "produto"}${r.plano_nome ? ` (${r.plano_nome})` : ""}`).join(" · ")}
                          </p>
                        )}
                        {a.tipo === "campanha" && (a.retorno ?? []).length > 0 && (
                          <p className="mt-0.5 text-[11px] text-text-faint">
                            Para {a.retorno.map((r) => `${nomeProduto.get(r.produto_id) ?? "produto"}${r.plano_nome ? ` (${r.plano_nome})` : ""}`).join(", ")} · CPL{" "}
                            {formatBRL(Number(p.cpl ?? 0))} · conversão {formatNum(Number(p.conversao ?? 0) * 100)}%
                          </p>
                        )}
                        {acaoSemRetorno(a) && (
                          <p className="mt-1 text-[11px] text-warning">
                            Sem retorno cadastrado — entra só o custo, e a cobertura do canal direto não conta esta ação. Edite e informe os clientes esperados.
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2.5">
                        <button type="button" disabled={isPending} onClick={() => editar(a)} className="text-[11px] text-primary-deep">
                          Editar
                        </button>
                        <button type="button" disabled={isPending} onClick={() => duplicar(a)} className="text-[11px] text-primary-deep" title="Copia para o ano seguinte — ajuste o que mudar">
                          Duplicar p/ {Number(anoDaAcao(a) || new Date().getFullYear()) + 1}
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
          </div>
        ))}
      </div>

      {rascunho && previa && (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="text-[12px] font-semibold">
            {rascunho.id ? "Editar" : "Nova"} {rascunho.tipo === "feira" ? "feira" : rascunho.tipo === "evento" ? "linha de eventos" : "campanha de mídia"}
          </div>

          {rascunho.tipo === "feira" && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
              <div>
                <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Nome</label>
                <input className="input" value={rascunho.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex: Febratex Summit 2027" />
              </div>
              <div>
                <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Mês e ano da feira</label>
                <input className="input" type="month" value={rascunho.mes} onChange={(e) => set("mes", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Estande (R$)</label>
                <input className="input" type="number" min={0} step="100" value={rascunho.estande} onChange={(e) => set("estande", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Logística (R$)</label>
                <input className="input" type="number" min={0} step="100" value={rascunho.logistica} onChange={(e) => set("logistica", e.target.value)} placeholder="viagem, hospedagem" />
              </div>
              <div>
                <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Material (R$)</label>
                <input className="input" type="number" min={0} step="100" value={rascunho.material} onChange={(e) => set("material", e.target.value)} placeholder="totens, brindes" />
              </div>
            </div>
          )}
          {rascunho.tipo === "feira" && (
            <p className="-mt-1 text-[10.5px] text-text-faint">
              Custo total {formatBRL(previa.custo)}
              {rascunho.mes ? ` → ${PARCELAS_FEIRA}× de ${formatBRL(previa.custo / PARCELAS_FEIRA)} até ${formatMes(`${rascunho.mes}-01`)}` : ` pago em ${PARCELAS_FEIRA} parcelas até o mês da feira`}
            </p>
          )}

          {rascunho.tipo === "evento" && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
                <div>
                  <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Nome</label>
                  <input className="input" value={rascunho.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex: Eventos com associações" />
                </div>
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
                  <input className="input" type="number" min={0} step="100" value={rascunho.custo} onChange={(e) => set("custo", e.target.value)} />
                </div>
              </div>
              {rascunho.custo && rascunho.quantidade && (
                <p className="-mt-1 text-[10.5px] text-text-faint">
                  {formatBRL(Number(rascunho.custo) * Number(rascunho.quantidade))} no ano → {formatBRL((Number(rascunho.custo) * Number(rascunho.quantidade)) / 12)}/mês de custo fixo de eventos
                </p>
              )}
            </>
          )}

          {rascunho.tipo === "campanha" && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-[2fr_1.3fr_1fr_1fr]">
                <div>
                  <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Nome</label>
                  <input className="input" value={rascunho.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex: Google Search — Mind" />
                </div>
                <div>
                  <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Canal</label>
                  <select className="input" value={rascunho.canal} onChange={(e) => set("canal", e.target.value)}>
                    {CANAIS_MIDIA.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Começa em</label>
                  <input className="input" type="month" value={rascunho.mes} onChange={(e) => set("mes", e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
                    Termina em
                    <InfoTooltip texto="Em branco = roda até o fim do período do cenário." />
                  </label>
                  <input className="input" type="month" value={rascunho.mes_fim} onChange={(e) => set("mes_fim", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Verba mensal (R$)</label>
                  <input className="input" type="number" min={0} step="100" value={rascunho.custo} onChange={(e) => set("custo", e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
                    Custo por lead — CPL (R$)
                    <InfoTooltip texto="Quanto a mídia cobra, em média, por contato interessado (formulário, WhatsApp, cadastro). Referência B2B: Google Search R$ 20–40, LinkedIn R$ 30–60, Instagram R$ 15–30." />
                  </label>
                  <input className="input" type="number" min={0} step="0.5" value={rascunho.cpl} onChange={(e) => set("cpl", e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
                    Conversão lead → cliente (%)
                    <InfoTooltip texto="De cada 100 leads da campanha, quantos viram clientes pagantes (depois do SDR/vendedor ou do teste grátis). Referência B2B: 2–4%." />
                  </label>
                  <input className="input" type="number" min={0} max={100} step="0.1" value={rascunho.conversao} onChange={(e) => set("conversao", e.target.value)} />
                </div>
              </div>
              {clientesMensaisCampanha(previa) > 0 && (
                <p className="-mt-1 rounded-md bg-bg px-2.5 py-1.5 text-[11px] text-text-muted">
                  ≈ <b>{formatNum(leadsMensaisCampanha(previa))} leads</b> e <b>{formatNum(clientesMensaisCampanha(previa))} clientes por mês</b> · custo por
                  cliente da campanha <b>{formatBRL(Number(previa.custo) / clientesMensaisCampanha(previa))}</b> · {mesesDaCampanha(previa, fimCenario).length} meses ·
                  total {formatBRL(custoTotalAcao(previa, fimCenario))} e {formatNum(clientesTotaisAcao(previa, fimCenario))} clientes
                </p>
              )}
            </>
          )}

          <div>
            <label className="mb-1 block text-[10.5px] font-medium text-text-muted">
              {rascunho.tipo === "campanha"
                ? "Para qual ferramenta e plano a campanha traz clientes"
                : `Retorno previsto ${rascunho.tipo === "feira" ? "na feira" : "por evento"} — clientes por ferramenta e plano`}
            </label>
            <div className="flex flex-col gap-2">
              {rascunho.retorno.map((l, i) => {
                const produto = produtos.find((p) => p.id === l.produto_id);
                const atualizar = (patch: Partial<LinhaRetorno>) => set("retorno", rascunho.retorno.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className={`grid items-center gap-2 ${rascunho.tipo === "campanha" ? "grid-cols-[1.2fr_1.6fr_auto]" : "grid-cols-[1.2fr_1.6fr_0.7fr_auto]"}`}>
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
                    {rascunho.tipo !== "campanha" && (
                      <input className="input" type="number" min={0} step="0.5" placeholder="clientes" value={l.clientes} onChange={(e) => atualizar({ clientes: e.target.value })} />
                    )}
                    <button type="button" onClick={() => set("retorno", rascunho.retorno.filter((_, j) => j !== i))} className="px-1 text-[13px] text-danger">
                      ×
                    </button>
                  </div>
                );
              })}
              {(rascunho.tipo !== "campanha" || rascunho.retorno.length === 0) && (
                <button
                  type="button"
                  onClick={() => set("retorno", [...rascunho.retorno, { produto_id: produtos[0]?.id ?? "", plano: "", clientes: rascunho.tipo === "campanha" ? "1" : "" }])}
                  className="w-fit text-[11.5px] font-medium text-primary-deep"
                >
                  + ferramenta / plano
                </button>
              )}
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-md bg-bg px-2.5 py-2 text-[11.5px]">
            <input type="checkbox" className="mt-0.5" checked={rascunho.soma_na_meta} onChange={(e) => set("soma_na_meta", e.target.checked)} />
            <span>
              <b>Somar esses clientes à projeção.</b> Deixe desmarcado no normal: os clientes da ação fazem parte da meta do canal direto e
              aparecem no quadro de cobertura. Marque só se a ação traz clientes além do crescimento definido nas fases — senão eles contam duas vezes.
            </span>
          </label>

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
