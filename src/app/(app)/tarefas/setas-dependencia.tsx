"use client";

import { useEffect, useRef, useState } from "react";

export type Seta = { de: string; para: string; critica: boolean };

/**
 * Setas de dependência por cima da linha do tempo: do fim da barra "de" ao início da barra "para".
 * Mede as barras no DOM (data-barra) depois de montar e a cada redimensionamento — assim não depende
 * de altura fixa de linha nem de cabeçalho de faixa. Seta escura = caminho crítico.
 */
export function SetasDependencia({ setas }: { setas: Seta[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [linhas, setLinhas] = useState<{ d: string; critica: boolean; chave: string }[]>([]);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const container = svg.parentElement;
    if (!container) return;

    const medir = () => {
      const base = container.getBoundingClientRect();
      const barra = (id: string) => {
        const el = container.querySelector<HTMLElement>(`[data-barra="${CSS.escape(id)}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x1: r.left - base.left, x2: r.right - base.left, y: r.top - base.top + r.height / 2 };
      };
      const novas: { d: string; critica: boolean; chave: string }[] = [];
      for (const s of setas) {
        const a = barra(s.de);
        const b = barra(s.para);
        if (!a || !b) continue;
        const saida = a.x2 + 2;
        const chegada = b.x1 - 3;
        // Sai pela direita, desce/sobe no meio do caminho, entra pela esquerda. Quando a sucessora
        // começa antes da antecessora terminar, dá a volta por fora pra não cruzar a barra.
        const meio = chegada >= saida + 10 ? saida + (chegada - saida) / 2 : Math.min(saida, chegada) - 10;
        const d =
          chegada >= saida + 10
            ? `M ${saida} ${a.y} H ${meio} V ${b.y} H ${chegada}`
            : `M ${saida} ${a.y} H ${saida + 6} V ${(a.y + b.y) / 2} H ${meio} V ${b.y} H ${chegada}`;
        novas.push({ d, critica: s.critica, chave: `${s.de}>${s.para}` });
      }
      setLinhas(novas);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(container);
    return () => ro.disconnect();
  }, [setas]);

  if (setas.length === 0) return null;
  return (
    <svg ref={ref} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <marker id="seta-dep" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
        </marker>
      </defs>
      {linhas.map((l) => (
        <path
          key={l.chave}
          d={l.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={l.critica ? 2 : 1}
          strokeOpacity={l.critica ? 0.9 : 0.45}
          markerEnd="url(#seta-dep)"
          className={l.critica ? "text-wine" : "text-text-muted"}
        />
      ))}
    </svg>
  );
}
