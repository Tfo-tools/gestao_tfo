"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { simularRetornoInvestidor, type BaseSaida } from "@/lib/retorno-investidor";
import { SimuladorRetorno } from "./simulador-retorno";

/**
 * Tudo de investimento num bloco só: o caixa acumulado (EBITDA + aportes) com um marco em cada
 * parcela que entra, no break-even e na saída — o capital entrando, sendo consumido e voltando.
 *
 * Ao lado, o retorno do investidor SÓ quando há investidor (programa que entra no retorno). Cenário
 * só com fomento não tem retorno a mostrar — subvenção não se devolve —, então o painel mostra o
 * fomento: quanto entra em caixa, quando, e as notas do que não passa pelo caixa da empresa.
 *
 * O gráfico mostra só o caixa acumulado: a receita mensal no mesmo eixo ficaria achatada no zero
 * (o caixa chega a dezenas de milhões) — o mesmo problema que escondia o Centelha no Base.
 */

export type ParcelaMarco = { mes: string; valor: number; programa: string };
export type ProgramaResumo = { nome: string; tipo: string; valorEmCaixa: number; parcelas: { mes: string; valor: number }[] };
export type NotaForaDoCaixa = { programa: string; valor: number; descricao: string | null };

export type PropsRetorno = {
  capitalPadrao: number;
  equityPadrao: number;
  mesAportePadrao: string;
  mesSaida: string;
  arrNaSaida: number;
  ebitdaNaSaida: number;
  paybackMes: string | null;
  paybackMeses: number | null;
  capitalRecuperadoPct: number | null;
  tirProjetoPct: number | null;
  nomeRodada: string | null;
  /** MOIC/TIR pelo valuation cadastrado, quando há — complementa a simulação. */
  valuation: { moic: number | null; tirPct: number | null } | null;
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
function compacto(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${s}R$ ${(a / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${s}R$ ${(a / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `${s}R$ ${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/** Caixa acumulado mês a mês: o que a operação gera mais o que entra de capital. */
export function serieCaixa(meses: { mes: string; ebitda: number; aportes: number }[]): { mes: string; valor: number; aporte: number }[] {
  let acc = 0;
  return meses.map((m) => {
    acc += m.ebitda + m.aportes;
    return { mes: m.mes, valor: acc, aporte: m.aportes };
  });
}

const COR_CAIXA = "#3f6fc4";
const COR_APORTE = "#b8456f";
const W = 1000, H = 240, L = 70, R = 24, T = 26, B = 28;

function GraficoCaixa({
  meses,
  marcos,
  breakEvenMes,
}: {
  meses: { mes: string; ebitda: number; aportes: number }[];
  marcos: ParcelaMarco[];
  breakEvenMes: string | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const serie = serieCaixa(meses);
  if (serie.length < 2) return null;

  const valores = serie.map((p) => p.valor);
  const min = Math.min(0, ...valores);
  const max = Math.max(1, ...valores);
  const x = (i: number) => L + (i / (serie.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const idx = (mes: string) => serie.findIndex((p) => p.mes === mes);
  const grade = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  const passoEixo = Math.max(1, Math.ceil(serie.length / 8));

  // Maior queima: o ponto mais baixo do caixa acumulado.
  const iQueima = valores.indexOf(Math.min(...valores));
  const iBreakEven = breakEvenMes ? idx(breakEvenMes) : -1;
  const aportesNoGrafico = marcos.map((m) => ({ ...m, i: idx(m.mes) })).filter((m) => m.i >= 0);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Caixa acumulado com marcos de aporte, break-even e saída"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - L) / (W - L - R)) * (serie.length - 1));
          setHover(i >= 0 && i < serie.length ? i : null);
        }}
      >
        {grade.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-border-soft)" />
            <text x={L - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--color-text-faint)">
              {compacto(v)}
            </text>
          </g>
        ))}
        {min < 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--color-text-faint)" strokeDasharray="3 3" />}
        {serie.map((p, i) =>
          i === 0 || i === serie.length - 1 || i % passoEixo === 0 ? (
            <text key={p.mes} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--color-text-faint)">
              {rotuloMes(p.mes)}
            </text>
          ) : null,
        )}

        <path
          d={serie.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={COR_CAIXA}
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Marcos: cada parcela que entra, a maior queima, o break-even e a saída. */}
        {aportesNoGrafico.map((m) => (
          <g key={`${m.programa}-${m.mes}`}>
            <line x1={x(m.i)} x2={x(m.i)} y1={T - 4} y2={y(serie[m.i].valor)} stroke={COR_APORTE} strokeDasharray="2 2" />
            <circle cx={x(m.i)} cy={y(serie[m.i].valor)} r="5" fill={COR_APORTE} stroke="var(--color-surface)" strokeWidth="2" />
            <text x={x(m.i) + 5} y={T - 8} fontSize="10.5" fill="var(--color-text)">
              {m.programa} · {compacto(m.valor)}
            </text>
          </g>
        ))}
        {iQueima > 0 && valores[iQueima] < 0 && (
          <g>
            <circle cx={x(iQueima)} cy={y(valores[iQueima])} r="5" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" />
            <text x={x(iQueima)} y={y(valores[iQueima]) + 17} textAnchor="middle" fontSize="10.5" fill="var(--color-text-muted)">
              maior queima
            </text>
          </g>
        )}
        {iBreakEven >= 0 && (
          <g>
            <line x1={x(iBreakEven)} x2={x(iBreakEven)} y1={T} y2={H - B} stroke="var(--color-text-faint)" strokeDasharray="3 3" />
            <text x={x(iBreakEven) + 4} y={H - B - 6} fontSize="10.5" fill="var(--color-text-muted)">
              break-even
            </text>
          </g>
        )}
        <text x={W - R} y={y(valores[valores.length - 1]) - 8} textAnchor="end" fontSize="10.5" fill="var(--color-text)">
          saída · {compacto(valores[valores.length - 1])}
        </text>

        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--color-text-faint)" />
            <circle cx={x(hover)} cy={y(serie[hover].valor)} r="4" fill={COR_CAIXA} stroke="var(--color-surface)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-6 z-10 rounded-md border border-border bg-surface px-3 py-2 text-[11px] shadow-sm"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}
        >
          <div className="font-semibold">{rotuloMes(serie[hover].mes)}</div>
          <div className="text-text-muted">
            Caixa acumulado <span className="font-mono text-text">{brl(serie[hover].valor)}</span>
          </div>
          {serie[hover].aporte > 0 && (
            <div className="text-text-muted">
              Aporte no mês <span className="font-mono text-text">{brl(serie[hover].aporte)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PainelRetorno(props: PropsRetorno) {
  const params = useSearchParams();
  // Mesmos parâmetros e padrões do simulador — o painel e o simulador mostram o mesmo número.
  const num = (chave: string, padrao: number) => {
    const v = params.get(chave);
    const n = v != null && v !== "" ? Number(v.replace(",", ".")) : NaN;
    return Number.isFinite(n) ? n : padrao;
  };
  const equity = num("equity", props.equityPadrao);
  const r = simularRetornoInvestidor({
    valorInvestido: num("capital", props.capitalPadrao),
    mesAporte: params.get("aporte") || props.mesAportePadrao,
    equityPct: equity,
    multiploSaida: num("multiplo", 5),
    baseSaida: (params.get("base") === "ebitda" ? "ebitda" : "arr") as BaseSaida,
    arrNaSaida: props.arrNaSaida,
    ebitdaNaSaida: props.ebitdaNaSaida,
    mesSaida: props.mesSaida,
  });
  return (
    <div className="rounded-lg bg-bg p-4">
      <p className="text-[11px] font-medium text-text-muted">Retorno do investidor{props.nomeRodada ? ` · ${props.nomeRodada}` : ""}</p>
      <p className="mt-1 font-heading text-[24px] font-semibold leading-none">
        {r.moic != null ? `${r.moic.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x` : "—"}
      </p>
      <p className="mb-3 text-[10.5px] text-text-faint">MOIC na saída ({rotuloMes(props.mesSaida)})</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11.5px]">
        <div>
          <div className="text-text-faint">TIR do investidor</div>
          <div className="font-semibold">{r.tirAnualPct != null ? `${r.tirAnualPct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% a.a.` : "—"}</div>
        </div>
        <div>
          <div className="text-text-faint">Payback</div>
          <div className="font-semibold">{props.paybackMeses != null ? `${props.paybackMeses} meses` : "no período, não"}</div>
        </div>
        <div>
          <div className="text-text-faint">Valor da participação</div>
          <div className="font-semibold">{compacto(r.valorParticipacao)}</div>
        </div>
        <div>
          <div className="text-text-faint">Participação</div>
          <div className="font-semibold">{equity.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</div>
        </div>
      </div>
      {props.valuation && props.valuation.moic != null && (
        <p className="mt-3 border-t border-border-soft pt-2 text-[10.5px] text-text-faint">
          Pelo valuation cadastrado: MOIC {props.valuation.moic.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x
          {props.valuation.tirPct != null ? ` · TIR ${props.valuation.tirPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% a.a.` : ""}
        </p>
      )}
    </div>
  );
}

function PainelFomento({ programas, notas }: { programas: ProgramaResumo[]; notas: NotaForaDoCaixa[] }) {
  return (
    <div className="rounded-lg bg-bg p-4">
      <p className="text-[11px] font-medium text-text-muted">Fomento no cenário</p>
      <p className="mb-3 text-[10.5px] text-text-faint">Subvenção não se devolve — não há retorno de investidor a calcular.</p>
      {programas.map((p) => (
        <div key={p.nome} className="mb-3 last:mb-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-semibold">{p.nome}</span>
            <span className="font-mono text-[12px]">{brl(p.valorEmCaixa)}</span>
          </div>
          <div className="text-[10.5px] text-text-faint">
            entra em caixa: {p.parcelas.map((x) => `${rotuloMes(x.mes)} ${compacto(x.valor)}`).join(" · ")}
          </div>
        </div>
      ))}
      {notas.length > 0 && (
        <div className="mt-3 border-t border-border-soft pt-2">
          {notas.map((n, i) => (
            <p key={i} className="text-[10.5px] leading-snug text-text-muted">
              <span className="font-semibold">Nota:</span> {n.programa} inclui {brl(n.valor)} que não passam pelo caixa da empresa
              {n.descricao ? ` — ${n.descricao}` : ""}. Fora do caixa, da DFC e da DRE.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function InvestimentoERetorno({
  nome,
  meses,
  marcos,
  breakEvenMes,
  programas,
  notas,
  retorno,
}: {
  nome: string;
  meses: { mes: string; ebitda: number; aportes: number }[];
  marcos: ParcelaMarco[];
  breakEvenMes: string | null;
  programas: ProgramaResumo[];
  notas: NotaForaDoCaixa[];
  /** Presente só quando o cenário tem investidor. */
  retorno: PropsRetorno | null;
}) {
  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-6">
      <h2 className="font-heading text-sm font-semibold">Investimento e retorno — {nome}</h2>
      <p className="mb-3 text-[11px] text-text-muted">
        Caixa acumulado (EBITDA + aportes). Cada marco é uma parcela que entra; abaixo da linha do zero, o cenário está consumindo capital.
      </p>
      <div className={`grid gap-5 ${retorno || programas.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_260px]" : ""}`}>
        <GraficoCaixa meses={meses} marcos={marcos} breakEvenMes={breakEvenMes} />
        {retorno ? <PainelRetorno {...retorno} /> : programas.length > 0 ? <PainelFomento programas={programas} notas={notas} /> : null}
      </div>
      {retorno && (
        <details className="group mt-4 rounded-lg border border-border-soft">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-[12px] font-medium text-primary-deep [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">+ Simular outra rodada</span>
            <span className="hidden group-open:inline">− Fechar simulação</span>
          </summary>
          <div className="border-t border-border-soft p-4">
            <SimuladorRetorno {...retorno} />
          </div>
        </details>
      )}
      {retorno && notas.length > 0 && (
        <p className="mt-3 text-[10.5px] text-text-muted">
          {notas.map((n) => `${n.programa}: ${brl(n.valor)} não passam pelo caixa da empresa${n.descricao ? ` (${n.descricao})` : ""}`).join(" · ")}.
        </p>
      )}
    </div>
  );
}
