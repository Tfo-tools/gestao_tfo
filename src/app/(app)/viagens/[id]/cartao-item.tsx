"use client";

import { useState } from "react";
import { IconeItem } from "../item-icons";
import type { ItemViagem, AnexoViagem } from "./itinerario";

const fmtHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Cartão do item fechado por padrão: ícone do tipo, nome e uma linha de contexto. Abre ao tocar
 * — localizador, endereço, anexos, valor e ações. A faixa de cor à esquerda é o lugar da régua.
 */
export function CartaoItem({
  it,
  tipoLabel,
  cor,
  anexos,
  soDessas,
  onEditar,
  onRemover,
  onLancar,
  onAbrirAnexo,
  onRemoverAnexo,
}: {
  it: ItemViagem;
  tipoLabel: string;
  cor: string | null;
  anexos: AnexoViagem[];
  /** Nomes de quem está no trecho, só quando não são todas. */
  soDessas: string[];
  onEditar: () => void;
  onRemover: () => void;
  onLancar: () => void;
  onAbrirAnexo: (caminho: string) => void;
  onRemoverAnexo: (a: AnexoViagem) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const obs = it.detalhes?.observacoes;
  const mapa = it.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.endereco)}` : null;
  const waze = it.endereco ? `https://waze.com/ul?q=${encodeURIComponent(it.endereco)}` : null;
  const contexto = [fmtHora(it.inicio), it.fim ? `até ${fmtHora(it.fim)}` : null, it.fornecedor, it.origem || it.destino ? [it.origem, it.destino].filter(Boolean).join(" → ") : null]
    .filter(Boolean)
    .join(" · ");

  function copiar() {
    if (!it.localizador) return;
    navigator.clipboard?.writeText(it.localizador);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <div className="rounded-xl border border-border bg-surface" style={{ borderLeft: `4px solid ${cor ?? "var(--color-border)"}` }}>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-text" title={tipoLabel}>
          <IconeItem tipo={it.tipo} className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
            {it.titulo}
            {soDessas.length > 0 && <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-text-muted">só {soDessas.join(", ")}</span>}
            {anexos.length > 0 && <span className="text-[10.5px] text-text-faint">📎 {anexos.length}</span>}
          </span>
          {contexto && <span className="block truncate text-[11.5px] text-text-muted">{contexto}</span>}
        </span>
        <span className={`shrink-0 text-text-faint transition ${aberto ? "rotate-180" : ""}`} aria-hidden>▾</span>
      </button>

      {aberto && (
        <div className="border-t border-border-soft px-3.5 pb-3 pt-2.5 text-[12px]">
          {it.detalhes?.conexoes && <p className="text-text-muted">Conexão: {it.detalhes.conexoes}</p>}
          <div className="mt-1 flex flex-wrap gap-2">
            {it.localizador && (
              <button type="button" onClick={copiar} className="rounded-lg border border-border px-2.5 py-1 font-mono text-[11.5px]">
                {copiado ? "✓ copiado" : it.localizador}
              </button>
            )}
            {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-2.5 py-1 text-[11.5px] text-primary-deep">Maps</a>}
            {waze && <a href={waze} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-2.5 py-1 text-[11.5px] text-primary-deep">Waze</a>}
          </div>
          {it.endereco && <p className="mt-1.5 text-text-muted">📍 {it.endereco}</p>}
          {obs && <p className="mt-1 text-text-faint">{obs}</p>}
          {anexos.map((a) => (
            <p key={a.id} className="mt-1">
              <button type="button" onClick={() => onAbrirAnexo(a.caminho_arquivo)} className="font-medium text-primary-deep">📎 {a.nome_arquivo}</button>{" "}
              <button type="button" onClick={() => onRemoverAnexo(a)} className="text-danger">remover</button>
            </p>
          ))}
          {it.detalhes?.valor != null && (
            <p className="mt-1.5">
              <span className="text-text-muted">Valor: </span>
              <span className="font-medium">{brl(it.detalhes.valor)}</span>{" "}
              {it.detalhes.despesa_id ? (
                <span className="text-success">· ✓ no Custos</span>
              ) : (
                <button type="button" onClick={onLancar} className="font-medium text-primary-deep">· Lançar no Custos</button>
              )}
            </p>
          )}
          <div className="mt-2.5 flex gap-3">
            <button type="button" onClick={onEditar} className="font-medium text-primary-deep">Editar</button>
            <button type="button" onClick={onRemover} className="font-medium text-danger">Remover</button>
          </div>
        </div>
      )}
    </div>
  );
}
