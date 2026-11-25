"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirNegociado } from "./entregas-actions";
import type { OrcamentoTempo, LinhaOrc, EstadoMes } from "@/lib/orcamento-tempo";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const sgn = (v: number) => (v > 0 ? "+ " : v < 0 ? "− " : "") + fmt(Math.abs(v)).replace("R$ ", "R$ ");
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ym: string) => `${MES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const ESTADO: Record<EstadoMes, string> = { previsto: "Previsto", negociado: "Negociado", realizado: "Realizado" };

const CELL: Record<EstadoMes, string> = {
  previsto: "bg-bg text-text-muted",
  negociado: "bg-primary-soft text-primary-deep",
  realizado: "bg-success-soft text-success",
};
const CHIP: Record<EstadoMes, string> = {
  previsto: "bg-bg text-text-muted",
  negociado: "bg-primary-soft text-primary-deep",
  realizado: "bg-success-soft text-success",
};
const COL1 = "sticky left-0 z-10 bg-surface min-w-[210px] max-w-[240px]";

export function OrcamentoControle({ orcamento, podeEditar }: { orcamento: OrcamentoTempo; podeEditar: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editar, setEditar] = useState<LinhaOrc | null>(null);
  const { meses, linhas, previstoMes, projecaoMes, estouroMes, previstoTotal, projecaoTotal, estouroTotal } = orcamento;

  if (linhas.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className={`${COL1} px-3 py-2 text-left font-medium`}>Rubrica</th>
              <th className="px-2 py-2 text-left font-medium">Estado</th>
              {meses.map((m) => (<th key={m} className="whitespace-nowrap px-2 py-2 text-right font-medium">{rotuloMes(m)}</th>))}
              <th className="whitespace-nowrap border-l border-border px-3 py-2 text-right font-semibold">Consolidado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const temDelta = l.meses.some((c) => c.delta !== 0);
              return (
                <tr key={l.id} className="border-t border-border-soft">
                  <td className={`${COL1} px-3 py-2`}>
                    <button
                      type="button"
                      disabled={!podeEditar}
                      onClick={() => podeEditar && setEditar(l)}
                      className={`text-left font-medium leading-tight ${podeEditar ? "hover:text-primary-deep" : "cursor-default"}`}
                      title={podeEditar ? "Definir o valor negociado" : l.atividade}
                    >
                      {l.rubrica}
                    </button>
                  </td>
                  <td className="px-2 py-2"><span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${CHIP[l.estado]}`}>{ESTADO[l.estado]}</span></td>
                  {l.meses.map((c, i) => (
                    <td key={i} className="px-2 py-2 text-right">
                      <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${CELL[c.estado]}`}>{fmt(c.val)}</span>
                    </td>
                  ))}
                  <td className="border-l border-border px-3 py-2 text-right">
                    <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${CELL[l.estado]}`}>{fmt(l.consolidado)}</span>
                  </td>
                  {temDelta && (
                    <RowDelta l={l} />
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="font-semibold">
            <tr className="border-t-2 border-border bg-bg">
              <td className={`${COL1} bg-bg px-3 py-2`}>Previsto (aprovado)</td><td></td>
              {previstoMes.map((v, i) => (<td key={i} className="px-2 py-2 text-right font-mono">{fmt(v)}</td>))}
              <td className="border-l border-border px-3 py-2 text-right font-mono">{fmt(previstoTotal)}</td>
            </tr>
            <tr className="border-t border-border bg-primary-soft/40">
              <td className={`${COL1} bg-primary-soft/40 px-3 py-2`}>Projeção</td><td></td>
              {projecaoMes.map((v, i) => (<td key={i} className="px-2 py-2 text-right font-mono">{fmt(v)}</td>))}
              <td className="border-l border-border px-3 py-2 text-right font-mono">{fmt(projecaoTotal)}</td>
            </tr>
            <tr className="border-t border-border bg-danger-soft text-danger">
              <td className={`${COL1} bg-danger-soft px-3 py-2 text-danger`}>Estouro</td><td></td>
              {estouroMes.map((v, i) => (<td key={i} className="px-2 py-2 text-right font-mono">{v !== 0 ? sgn(v) : "—"}</td>))}
              <td className="border-l border-border px-3 py-2 text-right font-mono">{estouroTotal !== 0 ? sgn(estouroTotal) : fmt(0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-bg ring-1 ring-border" /> previsto (aprovado)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-primary-soft ring-1 ring-primary-fill" /> negociado (orçamento fechado)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-success-soft ring-1 ring-success" /> realizado (pago)</span>
      </div>

      {editar && (
        <ModalNegociado
          linha={editar}
          pending={pending}
          onClose={() => setEditar(null)}
          onSalvar={(valor) => start(async () => { await definirNegociado(editar.id, valor); setEditar(null); router.refresh(); })}
        />
      )}
    </div>
  );
}

function RowDelta({ l }: { l: LinhaOrc }) {
  const over = l.deltaConsolidado > 0;
  const cls = over ? "text-danger" : "text-success";
  return (
    <tr className="text-[10px]">
      <td className={`${COL1} px-3 pb-2 pt-0 text-[10px] font-normal text-text-faint`}>↳ Δ previsto × executado (aprovado {fmt(l.aprovado)})</td>
      <td className={`px-2 pb-2 pt-0 ${cls}`}>{over ? "estouro" : "economia"}</td>
      {l.meses.map((c, i) => (
        <td key={i} className={`px-2 pb-2 pt-0 text-right font-mono ${c.delta > 0 ? "text-danger" : c.delta < 0 ? "text-success" : "text-text-faint"}`}>
          {c.delta !== 0 ? sgn(c.delta) : "—"}
        </td>
      ))}
      <td className={`border-l border-border px-3 pb-2 pt-0 text-right font-mono ${cls}`}>{sgn(l.deltaConsolidado)}</td>
    </tr>
  );
}

function ModalNegociado({ linha, pending, onClose, onSalvar }: { linha: LinhaOrc; pending: boolean; onClose: () => void; onSalvar: (v: number | null) => void }) {
  const [valor, setValor] = useState(linha.negociado != null ? String(linha.negociado) : "");
  const num = valor.trim() === "" ? null : Number(valor.replace(/\./g, "").replace(",", "."));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="mt-10 w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="font-heading text-sm font-semibold">{linha.rubrica}</h3>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[16px] leading-none text-text-muted hover:bg-bg">✕</button>
        </div>
        <p className="mb-3 text-[11.5px] text-text-muted">Aprovado (previsto): <b>{fmt(linha.aprovado)}</b>. Informe o valor do <b>orçamento fechado</b> — vira o valor oficial da linha.</p>
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
          Valor negociado
          <input
            autoFocus inputMode="decimal" className="input"
            placeholder="ex.: 23.000,00"
            value={valor} onChange={(e) => setValor(e.target.value)}
          />
        </label>
        {num != null && Number.isFinite(num) && (
          <p className={`mt-2 text-[11.5px] font-medium ${num - linha.aprovado > 0 ? "text-danger" : num - linha.aprovado < 0 ? "text-success" : "text-text-muted"}`}>
            {num - linha.aprovado > 0 ? "Estouro" : num - linha.aprovado < 0 ? "Economia" : "Igual ao aprovado"}: {sgn(Math.round((num - linha.aprovado) * 100) / 100)}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" disabled={pending} onClick={() => onSalvar(null)} className="text-[11.5px] text-text-muted underline">limpar (volta ao previsto)</button>
          <button
            type="button" disabled={pending || num == null || !Number.isFinite(num)}
            onClick={() => onSalvar(Math.round((num as number) * 100) / 100)}
            className="rounded-lg bg-primary-fill px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-primary disabled:opacity-50"
          >Salvar negociado</button>
        </div>
        {pending && <p className="mt-2 text-[11px] text-text-faint">salvando…</p>}
      </div>
    </div>
  );
}
