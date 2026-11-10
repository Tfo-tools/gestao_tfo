"use client";

import { useState } from "react";
import { IconPlane } from "@/components/nav-icons";
import { IconCar, IconTicket } from "../item-icons";
import { ondeNoDia, type MapaViagem } from "@/lib/viagem-mapa";

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaSemana = (d: string) => SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()];
const porExtenso = (d: string) => `${diaSemana(d)}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;
const cap = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);

/**
 * A régua da viagem: toque num dia e ela responde onde cada uma está, quem voa, quem está em
 * evento e quem está de carro. Hoje vem selecionado. Desenho portado do "Viagens em Família".
 */
export function MapaPessoas({ mapa, hojeIndex, compacto = false }: { mapa: MapaViagem; hojeIndex: number; compacto?: boolean }) {
  const [sel, setSel] = useState(hojeIndex >= 0 ? hojeIndex : 0);
  const n = mapa.dias.length;
  const cols = `${compacto ? "4.5rem" : "6rem"} repeat(${n}, minmax(1.6rem, 1fr))`;
  const info = ondeNoDia(mapa, sel);
  const temVoo = mapa.faixas.some((f) => f.voos.length > 0);
  const temEvento = mapa.faixas.some((f) => f.eventos.length > 0);
  const temCarro = mapa.faixas.some((f) => f.carros.length > 0);

  const Marcador = ({ col, children, title }: { col: number; children: React.ReactNode; title: string }) => (
    <div className="z-10 flex items-center justify-center" style={{ gridColumn: col + 2, gridRow: 1 }} title={title}>
      <span className="rounded-full border border-border bg-surface p-0.5 text-text">{children}</span>
    </div>
  );

  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div style={{ minWidth: `${(compacto ? 4.5 : 6) + n * 1.6}rem` }}>
          <div className="grid text-[10.5px] text-text-faint" style={{ gridTemplateColumns: cols }}>
            <div />
            {mapa.dias.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => setSel(i)}
                className={`rounded-md py-1 text-center leading-tight ${i === sel ? "bg-wine-deep font-semibold text-white" : i === hojeIndex ? "font-semibold text-wine" : ""}`}
                title={porExtenso(d)}
              >
                {d.slice(8, 10)}
                <span className="block text-[8.5px] font-normal opacity-80">{diaSemana(d)}</span>
              </button>
            ))}
          </div>
          {mapa.faixas.map((f) => (
            <div key={f.pessoa.id} className="grid h-8 items-center" style={{ gridTemplateColumns: cols }}>
              <div className="truncate pr-1 text-[12px] font-medium" style={{ gridColumn: 1, gridRow: 1 }}>
                {cap(f.pessoa.nome)}
              </div>
              {f.segmentos.map((s, i) => (
                <div key={i} title={`${s.lugar} · ${s.titulo}`} className="mx-px h-5 rounded-md" style={{ gridColumn: `${s.inicio + 2} / ${s.fim + 2}`, gridRow: 1, background: s.cor }} />
              ))}
              {f.voos.map((v, i) => (
                <Marcador key={`v${i}`} col={v} title="voo"><IconPlane className="h-3 w-3" /></Marcador>
              ))}
              {f.eventos.map((e, i) => (
                <Marcador key={`e${i}`} col={e} title="evento"><IconTicket className="h-3 w-3" /></Marcador>
              ))}
              {f.carros.map((c, i) => (
                <Marcador key={`c${i}`} col={c} title="carro alugado"><IconCar className="h-3 w-3" /></Marcador>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
        {Object.entries(mapa.cores).map(([lugar, cor]) => (
          <span key={lugar} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: cor }} />{lugar}</span>
        ))}
        {temVoo && <span className="inline-flex items-center gap-1"><IconPlane className="h-3 w-3" /> voo</span>}
        {temEvento && <span className="inline-flex items-center gap-1"><IconTicket className="h-3 w-3" /> evento</span>}
        {temCarro && <span className="inline-flex items-center gap-1"><IconCar className="h-3 w-3" /> carro</span>}
      </div>

      <div className="mt-3 rounded-lg bg-bg p-3 text-[12.5px]">
        <p className="mb-1 font-heading font-semibold">{porExtenso(mapa.dias[sel])}{sel === hojeIndex ? " · hoje" : ""}</p>
        {info.grupos.map(([lugar, nomes]) => (
          <p key={lugar}><span className="text-text-muted">{lugar}:</span> {nomes.map(cap).join(", ")}</p>
        ))}
        {info.voando.length > 0 && <p className="mt-1 flex items-center gap-1 font-medium text-wine"><IconPlane className="h-3.5 w-3.5" /> Voo: {info.voando.map(cap).join(", ")}</p>}
        {info.emEvento.length > 0 && <p className="mt-0.5 flex items-center gap-1 font-medium"><IconTicket className="h-3.5 w-3.5" /> Em evento: {info.emEvento.map(cap).join(", ")}</p>}
        {info.comCarro.length > 0 && <p className="mt-0.5 flex items-center gap-1 text-text-muted"><IconCar className="h-3.5 w-3.5" /> Com carro: {info.comCarro.map(cap).join(", ")}</p>}
      </div>
    </div>
  );
}
