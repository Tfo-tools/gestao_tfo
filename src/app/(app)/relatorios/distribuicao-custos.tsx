"use client";

import { useState } from "react";

/**
 * Para onde vai cada real de receita: custos em % da receita, ano a ano, e o que sobra (margem
 * EBITDA) vazado até a linha de 100%. Ano com prejuízo passa da linha — dá pra ver sem ler número.
 *
 * Forma: parte-do-todo → barra empilhada horizontal (anos nas linhas). Paleta validada com o
 * script de dataviz (5 slots, pior par em daltonismo ΔE 12,9): família da marca — azul, bordô
 * (vinho), mostarda (amarelo) — mais verde-petróleo e violeta. O mostarda fica abaixo de 3:1
 * contra a superfície, então a identidade nunca depende só da cor: legenda sempre visível,
 * rótulo direto quando cabe, tooltip em cada segmento e a DRE logo abaixo como tabela.
 */

export type LinhaDistribuicao = {
  rotulo: string;
  sub?: string;
  receita: number;
  impostos: number;
  cogs: number;
  sm: number;
  pd: number;
  ga: number;
  ebitda: number;
  total?: boolean;
};

const SERIES = [
  { chave: "cogs", rotulo: "Operação (COGS)", cor: "#3f6fc4" },
  { chave: "sm", rotulo: "Marketing e vendas (S&M)", cor: "#b8456f" },
  { chave: "pd", rotulo: "Produto e tecnologia (P&D)", cor: "#e0a100" },
  { chave: "ga", rotulo: "Estrutura (G&A)", cor: "#1f9a8a" },
  { chave: "impostos", rotulo: "Impostos sobre a receita", cor: "#8a63c8" },
] as const;

type Chave = (typeof SERIES)[number]["chave"];

const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function DistribuicaoCustos({ linhas }: { linhas: LinhaDistribuicao[] }) {
  const [foco, setFoco] = useState<{ linha: string; chave: Chave | "margem" } | null>(null);

  const validas = linhas.filter((l) => l.receita > 0);
  if (validas.length === 0) return null;

  // Escala: 100% da receita, ou mais quando algum ano gasta além do que fatura.
  const somaCustosPct = (l: LinhaDistribuicao) => (SERIES.reduce((s, x) => s + l[x.chave], 0) / l.receita) * 100;
  const dominio = Math.max(100, ...validas.map(somaCustosPct));
  const larg = (valorPct: number) => `${(valorPct / dominio) * 100}%`;

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-6">
      <h2 className="font-heading text-sm font-semibold">Para onde vai a receita</h2>
      <p className="mb-3 text-[11px] text-text-muted">
        Cada custo em % da receita do ano. O que sobra até a linha de 100% é a margem EBITDA; passar da linha é prejuízo.
      </p>

      {/* Legenda sempre visível: a cor nunca carrega o significado sozinha. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {SERIES.map((s) => (
          <span key={s.chave} className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.cor }} />
            {s.rotulo}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-dashed border-text-faint" />
          Margem EBITDA
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {validas.map((l) => {
          const custos = SERIES.map((s) => ({ ...s, valor: l[s.chave], p: (l[s.chave] / l.receita) * 100 })).filter((s) => s.p > 0.05);
          const totalCustos = custos.reduce((s, c) => s + c.p, 0);
          const margemPct = (l.ebitda / l.receita) * 100;
          const sobra = Math.max(0, 100 - totalCustos);
          const ultimoCusto = custos.length - 1;
          return (
            <div key={l.rotulo} className={`grid grid-cols-[88px_1fr_104px] items-center gap-3 ${l.total ? "mt-1 border-t border-border-soft pt-3" : ""}`}>
              <div className={`text-[12px] ${l.total ? "font-semibold" : ""}`}>
                {l.rotulo}
                {l.sub && <span className="ml-1 text-[10px] text-text-faint">({l.sub})</span>}
              </div>

              <div className="relative h-6">
                {/* Linha de 100% da receita. */}
                <div
                  className="absolute inset-y-[-3px] w-0 border-l border-dashed border-text-faint"
                  style={{ left: larg(100) }}
                  aria-hidden
                />
                <div className="flex h-full gap-[2px]">
                  {custos.map((c, i) => {
                    const ativo = foco?.linha === l.rotulo && foco.chave === c.chave;
                    return (
                      <div
                        key={c.chave}
                        onMouseEnter={() => setFoco({ linha: l.rotulo, chave: c.chave })}
                        onMouseLeave={() => setFoco(null)}
                        className={`relative flex h-full items-center justify-center text-[10px] font-semibold text-white ${
                          i === 0 ? "rounded-l-[4px]" : ""
                        } ${i === ultimoCusto && sobra === 0 ? "rounded-r-[4px]" : ""}`}
                        style={{ width: larg(c.p), background: c.cor, opacity: foco && !ativo && foco.linha === l.rotulo ? 0.55 : 1 }}
                      >
                        {/* Rótulo direto só quando cabe com folga — senão fica no tooltip e na DRE. */}
                        {c.p / dominio >= 0.07 && pct(c.p)}
                        {ativo && (
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-max -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-left text-[11px] font-normal text-text shadow-sm">
                            <div className="font-semibold">{c.rotulo}</div>
                            <div className="text-text-muted">
                              {pct(c.p)} da receita · {brl(c.valor)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {sobra > 0.05 && (
                    <div
                      onMouseEnter={() => setFoco({ linha: l.rotulo, chave: "margem" })}
                      onMouseLeave={() => setFoco(null)}
                      className="relative flex h-full items-center justify-center rounded-r-[4px] border border-dashed border-text-faint text-[10px] font-semibold text-text-muted"
                      style={{ width: larg(sobra) }}
                    >
                      {sobra / dominio >= 0.1 && `EBITDA ${pct(sobra)}`}
                      {foco?.linha === l.rotulo && foco.chave === "margem" && (
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-max -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-left text-[11px] font-normal text-text shadow-sm">
                          <div className="font-semibold">Margem EBITDA</div>
                          <div className="text-text-muted">
                            {pct(margemPct)} da receita · {brl(l.ebitda)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className={`text-right font-mono text-[11.5px] ${margemPct < 0 ? "text-danger" : "text-text-muted"}`}>
                {margemPct < 0 ? `prejuízo ${pct(Math.abs(margemPct))}` : `margem ${pct(margemPct)}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
