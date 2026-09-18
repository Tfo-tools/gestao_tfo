"use client";

import { useState } from "react";

/**
 * Linhas por cenário, um eixo só. Um gráfico por medida: receita e caixa acumulado ficam em
 * gráficos separados, nunca num eixo duplo. Cada linha tem cor E traço próprios (o traço resolve o
 * par que colide em daltonismo) e o nome no fim — a cor nunca identifica sozinha. Passar o mouse
 * mostra o mês com o valor de todos os cenários.
 */

export type SerieComparativa = {
  id: string;
  nome: string;
  cor: string;
  traco: string;
  pontos: { mes: string; valor: number }[];
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;

function compacto(v: number): string {
  const a = Math.abs(v);
  const sinal = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sinal}R$ ${(a / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${sinal}R$ ${(a / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `${sinal}R$ ${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

const L = 64; // margem esquerda (eixo)
const R = 132; // margem direita (rótulos no fim das linhas)
const T = 12;
const B = 26;
const W = 1000;
const H = 250;

export function GraficoComparativo({ titulo, subtitulo, series }: { titulo: string; subtitulo?: string; series: SerieComparativa[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const meses = series[0]?.pontos.map((p) => p.mes) ?? [];
  if (meses.length < 2) return null;

  const todos = series.flatMap((s) => s.pontos.map((p) => p.valor));
  const min = Math.min(0, ...todos);
  const max = Math.max(1, ...todos);
  const x = (i: number) => L + (i / (meses.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);

  // Grade recessiva: 4 faixas, sempre passando pelo zero quando há negativo.
  const passos = 4;
  const grade = Array.from({ length: passos + 1 }, (_, i) => min + ((max - min) * i) / passos);

  // Rótulos no fim: ordenados pela altura e afastados pra não se sobreporem.
  const fins = series
    .map((s) => ({ s, y: y(s.pontos[s.pontos.length - 1]?.valor ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < fins.length; i++) if (fins[i].y - fins[i - 1].y < 14) fins[i].y = fins[i - 1].y + 14;

  const passoEixo = Math.max(1, Math.ceil(meses.length / 8));

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-heading text-sm font-semibold">{titulo}</h2>
      {subtitulo && <p className="mb-2 text-[11px] text-text-muted">{subtitulo}</p>}

      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <svg width="22" height="6" aria-hidden>
              <line x1="0" y1="3" x2="22" y2="3" stroke={s.cor} strokeWidth="2" strokeDasharray={s.traco || undefined} />
            </svg>
            {s.nome}
          </span>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - L) / (W - L - R)) * (meses.length - 1));
            setHover(i >= 0 && i < meses.length ? i : null);
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

          {meses.map((m, i) =>
            i === 0 || i === meses.length - 1 || i % passoEixo === 0 ? (
              <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--color-text-faint)">
                {rotuloMes(m)}
              </text>
            ) : null,
          )}

          {series.map((s) => (
            <path
              key={s.id}
              d={s.pontos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={s.cor}
              strokeWidth="2"
              strokeDasharray={s.traco || undefined}
              strokeLinejoin="round"
            />
          ))}

          {fins.map(({ s, y: yy }) => (
            <text key={s.id} x={W - R + 8} y={yy + 3.5} fontSize="11" fill="var(--color-text)">
              {s.nome.length > 18 ? `${s.nome.slice(0, 17)}…` : s.nome}
            </text>
          ))}

          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--color-text-faint)" />
              {series.map((s) => (
                <circle key={s.id} cx={x(hover)} cy={y(s.pontos[hover].valor)} r="4" fill={s.cor} stroke="var(--color-surface)" strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>

        {hover != null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-surface px-3 py-2 text-[11px] shadow-sm"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: x(hover) > W / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            }}
          >
            <div className="mb-1 font-semibold">{rotuloMes(meses[hover])}</div>
            {[...series]
              .sort((a, b) => b.pontos[hover].valor - a.pontos[hover].valor)
              .map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-text-muted">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.cor }} />
                    {s.nome}
                  </span>
                  <span className="font-mono">{compacto(s.pontos[hover].valor)}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
