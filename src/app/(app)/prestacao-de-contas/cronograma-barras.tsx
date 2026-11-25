"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirExecucao, vincularDespesaEntrega } from "./entregas-actions";
import type { CronogramaEntregas, EntregaBarra } from "@/lib/prestacao-entregas";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmt0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ym: string) => `${MES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const STATUS_LABEL: Record<string, string> = { previsto: "Previsto", andamento: "Em andamento", entregue: "Entregue" };
const LEFT = 268;
const COLW = 54;

export type DespesaLivre = { id: string; descricao: string; valor: number; dataGasto: string };

export function CronogramaBarras({
  cronograma,
  podeEditar,
  despesasLivres,
}: {
  cronograma: CronogramaEntregas;
  podeEditar: boolean;
  despesasLivres: DespesaLivre[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const { meses, rubricas, semRubrica } = cronograma;
  const n = Math.max(meses.length, 1);

  const todas = useMemo(
    () => [...rubricas.flatMap((r) => r.entregas), ...semRubrica],
    [rubricas, semRubrica],
  );
  const aberta = abertaId ? todas.find((e) => e.id === abertaId) ?? null : null;

  function idx(iso: string) {
    const m = iso.slice(0, 7);
    const i = meses.indexOf(m);
    if (i >= 0) return i;
    return m < (meses[0] ?? m) ? 0 : n - 1;
  }
  const L = (iso: string) => (idx(iso) / n) * 100;
  const R = (iso: string) => ((idx(iso) + 1) / n) * 100;
  const C = (iso: string) => ((idx(iso) + 0.5) / n) * 100;

  const minW = LEFT + n * COLW;

  function Barra({ e }: { e: EntregaBarra }) {
    const planL = L(e.iniPrev);
    const planW = R(e.fimPrev) - planL;
    const entregue = e.status === "entregue" && e.fimReal;
    const andamento = e.status === "andamento";
    const execW = entregue ? R(e.fimReal!) - planL : R(e.fimPrev) - planL;
    const late = entregue && e.fimReal! > e.fimPrev;
    const dMes = entregue ? mesesDiff(e.fimPrev, e.fimReal!) : 0;
    return (
      <button
        type="button"
        onClick={() => setAbertaId(e.id)}
        className="group relative block h-11 w-full text-left"
        title={e.atividade}
      >
        {/* barra prevista (clara) */}
        <span
          className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-[5px] border border-wine/50 bg-wine-soft"
          style={{ left: `${planL}%`, width: `${planW}%` }}
        />
        {/* barra executada (escura) */}
        {(entregue || andamento) && (
          <span
            className={`absolute top-1/2 h-3.5 -translate-y-1/2 rounded-[5px] ${late ? "bg-danger" : "bg-success"} ${andamento ? "opacity-60" : ""}`}
            style={{ left: `${planL}%`, width: `${execW}%` }}
          />
        )}
        {/* ponto entrega prevista (vinho) */}
        <Ponto cor="bg-wine" left={C(e.fimPrev)} titulo={`Entrega prevista · ${rotuloMes(e.fimPrev.slice(0, 7))}`} />
        {/* ponto entregue (verde) */}
        {entregue && (
          <Ponto cor="bg-success" left={C(e.fimReal!)} titulo={`Entregue · ${rotuloMes(e.fimReal!.slice(0, 7))}`} />
        )}
        {/* ponto pago (azul) */}
        {e.pago && e.pagoMes && (
          <Ponto cor="bg-primary" left={C(`${e.pagoMes}-01`)} titulo={`Pago · ${rotuloMes(e.pagoMes)}`} />
        )}
        {/* etiqueta antecipou/atrasou */}
        {entregue && dMes !== 0 && (
          <span
            className={`absolute top-0.5 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-px text-[8.5px] font-bold ${dMes > 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
            style={{ left: `${C(e.fimReal!)}%` }}
          >
            {dMes > 0 ? `▲ ${dMes}m antes` : `▼ ${-dMes}m depois`}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div style={{ minWidth: minW }}>
          {/* cabeçalho de meses */}
          <div className="sticky top-0 z-10 grid border-b border-border bg-surface" style={{ gridTemplateColumns: `${LEFT}px 1fr` }}>
            <div className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">Rubrica · atividade</div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
              {meses.map((m) => (
                <div key={m} className="border-l border-border-soft py-2 text-center text-[10px] font-medium text-text-muted">
                  {rotuloMes(m)}
                </div>
              ))}
            </div>
          </div>

          {rubricas.map((r) => (
            <div key={r.id} className="border-b border-border-soft last:border-b-0">
              <div className="grid items-center bg-bg/40" style={{ gridTemplateColumns: `${LEFT}px 1fr` }}>
                <div className="flex items-baseline justify-between gap-2 px-3 py-1.5">
                  <span className="text-[12px] font-semibold leading-tight">{r.nome}</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-text-muted">{fmt0(r.valor)}</span>
                </div>
                <div />
              </div>
              {r.entregas.map((e) => (
                <div key={e.id} className="grid items-center border-t border-border-soft/60" style={{ gridTemplateColumns: `${LEFT}px 1fr` }}>
                  <div className="truncate px-3 py-1 pl-5 text-[11.5px] text-text" title={e.atividade}>{e.atividade}</div>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
                      {meses.map((m) => (<div key={m} className="border-l border-border-soft/50" />))}
                    </div>
                    <Barra e={e} />
                  </div>
                </div>
              ))}
            </div>
          ))}

          {semRubrica.length > 0 && (
            <div className="border-t border-border-soft">
              <div className="grid items-center bg-warning-soft/40" style={{ gridTemplateColumns: `${LEFT}px 1fr` }}>
                <div className="px-3 py-1.5 text-[12px] font-semibold text-warning">Sem rubrica</div>
                <div />
              </div>
              {semRubrica.map((e) => (
                <div key={e.id} className="grid items-center border-t border-border-soft/60" style={{ gridTemplateColumns: `${LEFT}px 1fr` }}>
                  <div className="truncate px-3 py-1 pl-5 text-[11.5px]" title={e.atividade}>{e.atividade}</div>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
                      {meses.map((m) => (<div key={m} className="border-l border-border-soft/50" />))}
                    </div>
                    <Barra e={e} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* legenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm border border-wine/60 bg-wine-soft" /> previsto (barra clara)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm bg-success" /> executado (barra escura)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-wine" /> entrega prevista</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-success" /> entregue</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-primary" /> pago</span>
      </div>

      {aberta && (
        <DetalheEntrega
          entrega={aberta}
          podeEditar={podeEditar}
          pending={pending}
          despesasLivres={despesasLivres}
          onClose={() => setAbertaId(null)}
          onSalvar={(status, fimReal) => start(async () => { await definirExecucao(aberta.id, status, fimReal); router.refresh(); })}
          onVincular={(despesaId, linhaId) => start(async () => { await vincularDespesaEntrega(despesaId, linhaId); router.refresh(); })}
        />
      )}
    </div>
  );
}

function Ponto({ cor, left, titulo }: { cor: string; left: number; titulo: string }) {
  return (
    <span
      className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] border-2 border-surface shadow-sm ${cor}`}
      style={{ left: `${left}%` }}
      title={titulo}
    />
  );
}

function mesesDiff(a: string, b: string) {
  const [ay, am] = [Number(a.slice(0, 4)), Number(a.slice(5, 7))];
  const [by, bm] = [Number(b.slice(0, 4)), Number(b.slice(5, 7))];
  return ay * 12 + am - (by * 12 + bm);
}

function DetalheEntrega({
  entrega,
  podeEditar,
  pending,
  despesasLivres,
  onClose,
  onSalvar,
  onVincular,
}: {
  entrega: EntregaBarra;
  podeEditar: boolean;
  pending: boolean;
  despesasLivres: DespesaLivre[];
  onClose: () => void;
  onSalvar: (status: string, fimReal: string | null) => void;
  onVincular: (despesaId: string, linhaId: string | null) => void;
}) {
  const [status, setStatus] = useState(entrega.status);
  const [fimReal, setFimReal] = useState(entrega.fimReal ?? "");
  const dataBR = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="mt-8 mb-8 w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-sm font-semibold">{entrega.atividade}</h3>
            <p className="text-[11.5px] text-text-muted">
              Prevista: {dataBR(entrega.iniPrev)} → {dataBR(entrega.fimPrev)} · {fmt(entrega.valor)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[16px] leading-none text-text-muted hover:bg-bg">✕</button>
        </div>

        {podeEditar ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Status
              <select className="input input-compacto" value={status} onChange={(e) => setStatus(e.target.value as EntregaBarra["status"])}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </label>
            {status === "entregue" && (
              <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                Data real de entrega
                <input type="date" className="input input-compacto" value={fimReal} onChange={(e) => setFimReal(e.target.value)} />
              </label>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => onSalvar(status, status === "entregue" ? (fimReal || entrega.fimPrev) : null)}
              className="rounded-lg bg-primary-fill px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-primary disabled:opacity-50"
            >
              Salvar execução
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1 text-[12.5px]">
            <p>Status: <b>{STATUS_LABEL[entrega.status]}</b></p>
            {entrega.fimReal && <p className="text-success">Entregue em {dataBR(entrega.fimReal)}</p>}
          </div>
        )}

        <div className="mt-4 border-t border-border-soft pt-3">
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Pagamento (despesas vinculadas)</h4>
          {entrega.despesas.length === 0 ? (
            <p className="text-[11.5px] text-text-muted">Nenhuma despesa vinculada a esta atividade ainda.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {entrega.despesas.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg/60 px-2.5 py-1.5 text-[11.5px]">
                  <span className="min-w-0 truncate">{d.descricao} <span className="text-text-faint">· {dataBR(d.dataGasto)}</span></span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono">{fmt(d.valor)}</span>
                    {podeEditar && (
                      <button type="button" disabled={pending} onClick={() => onVincular(d.id, null)} className="text-[10.5px] text-danger underline">desvincular</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {podeEditar && despesasLivres.length > 0 && (
            <label className="mt-2 flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Vincular uma despesa do programa
              <select
                className="input input-compacto"
                defaultValue=""
                disabled={pending}
                onChange={(e) => { if (e.target.value) onVincular(e.target.value, entrega.id); e.target.value = ""; }}
              >
                <option value="">Escolher despesa…</option>
                {despesasLivres.map((d) => (
                  <option key={d.id} value={d.id}>{d.descricao} · {dataBR(d.dataGasto)} · {fmt(d.valor)}</option>
                ))}
              </select>
            </label>
          )}
          <p className="mt-2 text-[10.5px] text-text-faint">
            As evidências (NF, cotações, comprovante…) ficam na despesa, na planilha de prestação por rubrica e mês.
          </p>
        </div>
        {pending && <p className="mt-2 text-[11px] text-text-faint">salvando…</p>}
      </div>
    </div>
  );
}
