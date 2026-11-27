"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirExecucao, vincularDespesaEntrega } from "./entregas-actions";
import { marcarEntrega, removerEntrega, urlEvidenciaEntrega } from "./entregas-evidencia-actions";
import type { CronogramaEntregas, EntregaBarra, SlotEntrega } from "@/lib/prestacao-entregas";

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
  programaId,
  podeEditar,
  despesasLivres,
}: {
  cronograma: CronogramaEntregas;
  programaId: string;
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
        {/* marcadores por slot: pendente (vinho) no mês previsto, entregue (verde) no mês real */}
        {slotMarkers(e.slots).map((m, i) => (
          <Ponto
            key={i}
            cor={m.verde ? "bg-success" : "bg-wine opacity-60"}
            left={C(`${m.mes}-01`)}
            offsetPx={m.offset * 7}
            titulo={m.verde
              ? `Entregue · ${rotuloMes(m.mes)}${m.slot.mesReal !== m.slot.mesPrevisto ? ` (previsto ${rotuloMes(m.slot.mesPrevisto)})` : ""}`
              : `Entrega prevista · ${rotuloMes(m.mes)} — pendente`}
          />
        ))}
        {/* ponto pago (azul) */}
        {e.pago && e.pagoMes && (
          <Ponto cor="bg-primary" left={C(`${e.pagoMes}-01`)} offsetPx={-7} titulo={`Pago · ${rotuloMes(e.pagoMes)}`} />
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
          programaId={programaId}
          podeEditar={podeEditar}
          pending={pending}
          despesasLivres={despesasLivres}
          onClose={() => setAbertaId(null)}
          onSalvar={(status, fimReal) => start(async () => { await definirExecucao(aberta.id, status, fimReal); router.refresh(); })}
          onVincular={(despesaId, linhaId) => start(async () => { await vincularDespesaEntrega(despesaId, linhaId); router.refresh(); })}
          onRefresh={() => router.refresh()}
        />
      )}
    </div>
  );
}

function Ponto({ cor, left, titulo, offsetPx = 0 }: { cor: string; left: number; titulo: string; offsetPx?: number }) {
  return (
    <span
      className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] border-2 border-surface shadow-sm ${cor}`}
      style={{ left: `calc(${left}% + ${offsetPx}px)` }}
      title={titulo}
    />
  );
}

/** Onde cada slot aparece: pendente no mês previsto; entregue (com evidência) no mês real. Empilha
 * horizontalmente quando mais de um cai no mesmo mês (ex.: entrega antecipada do mês seguinte). */
function slotMarkers(slots: SlotEntrega[]) {
  const porMes = new Map<string, number>();
  return slots.map((slot) => {
    const verde = slot.temEvidencia && !!slot.mesReal;
    const mes = verde ? slot.mesReal! : slot.mesPrevisto;
    const offset = porMes.get(mes) ?? 0;
    porMes.set(mes, offset + 1);
    return { slot, mes, verde, offset };
  });
}

function mesesDiff(a: string, b: string) {
  const [ay, am] = [Number(a.slice(0, 4)), Number(a.slice(5, 7))];
  const [by, bm] = [Number(b.slice(0, 4)), Number(b.slice(5, 7))];
  return ay * 12 + am - (by * 12 + bm);
}

function DetalheEntrega({
  entrega,
  programaId,
  podeEditar,
  pending,
  despesasLivres,
  onClose,
  onSalvar,
  onVincular,
  onRefresh,
}: {
  entrega: EntregaBarra;
  programaId: string;
  podeEditar: boolean;
  pending: boolean;
  despesasLivres: DespesaLivre[];
  onClose: () => void;
  onSalvar: (status: string, fimReal: string | null) => void;
  onVincular: (despesaId: string, linhaId: string | null) => void;
  onRefresh: () => void;
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

        {/* Entregas por mês: cada mês do período é um slot. Anexar evidência + data real deixa verde
            e move o marcador para o mês real. Vários por mês são permitidos (antecipar/atrasar). */}
        <div className="mb-4 rounded-xl border border-border-soft bg-bg/40 p-3">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Entregas por mês</h4>
          <div className="flex flex-col gap-1.5">
            {entrega.slots.map((s) => (
              <SlotLinha
                key={s.mesPrevisto}
                slot={s}
                programaId={programaId}
                linhaId={entrega.id}
                podeEditar={podeEditar}
                onRefresh={onRefresh}
              />
            ))}
          </div>
          <p className="mt-2 text-[10.5px] text-text-faint">
            Pago à medida que o prestador comprova. Sem evidência, fica no mês previsto (pendente); com evidência e data, vira verde no mês real.
          </p>
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

function SlotLinha({
  slot,
  programaId,
  linhaId,
  podeEditar,
  onRefresh,
}: {
  slot: SlotEntrega;
  programaId: string;
  linhaId: string;
  podeEditar: boolean;
  onRefresh: () => void;
}) {
  const [abrir, setAbrir] = useState(false);
  const [data, setData] = useState(`${slot.mesPrevisto}-15`);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const entregue = slot.temEvidencia && !!slot.mesReal;

  function salvar() {
    if (!arquivo) { setErro("Anexe a evidência."); return; }
    if (!data) { setErro("Informe a data da entrega."); return; }
    setErro(null);
    const fd = new FormData();
    fd.set("programaId", programaId);
    fd.set("linhaId", linhaId);
    fd.set("mesPrevisto", slot.mesPrevisto);
    fd.set("dataReal", data);
    fd.set("arquivo", arquivo);
    startBusy(async () => {
      const r = await marcarEntrega(fd);
      if (r.error) { setErro(r.error); return; }
      setAbrir(false);
      setArquivo(null);
      onRefresh();
    });
  }

  async function ver() {
    if (!slot.entregaId) return;
    const url = await urlEvidenciaEntrega(slot.entregaId);
    if (url) window.open(url, "_blank");
  }

  function remover() {
    if (!slot.entregaId) return;
    startBusy(async () => {
      await removerEntrega(slot.entregaId!);
      onRefresh();
    });
  }

  return (
    <div className="rounded-lg border border-border-soft bg-surface px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2 text-[11.5px]">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] ${entregue ? "bg-success" : "bg-wine opacity-60"}`} />
          {entregue ? (
            <span>
              Entregue em <b>{rotuloMes(slot.mesReal!)}</b>
              {slot.mesReal !== slot.mesPrevisto && <span className="text-text-faint"> · previsto {rotuloMes(slot.mesPrevisto)}</span>}
            </span>
          ) : (
            <span>Previsto <b>{rotuloMes(slot.mesPrevisto)}</b> <span className="text-wine">· pendente</span></span>
          )}
        </span>
        {podeEditar && (
          entregue ? (
            <span className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={ver} className="text-[10.5px] text-primary-deep underline">ver</button>
              <button type="button" disabled={busy} onClick={remover} className="text-[10.5px] text-danger underline">remover</button>
            </span>
          ) : (
            <button type="button" onClick={() => setAbrir((v) => !v)} className="shrink-0 text-[10.5px] text-primary-deep underline">
              {abrir ? "cancelar" : "lançar entrega"}
            </button>
          )
        )}
      </div>

      {entregue && slot.evidenciaNome && (
        <p className="mt-1 truncate text-[10.5px] text-text-faint" title={slot.evidenciaNome}>📎 {slot.evidenciaNome}</p>
      )}

      {abrir && !entregue && podeEditar && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border-soft pt-2">
          <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            Data real da entrega
            <input type="date" className="input input-compacto" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            Evidência
            <input type="file" className="text-[11px]" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          </label>
          {erro && <p className="text-[10.5px] text-danger">{erro}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={salvar}
            className="rounded-lg bg-success px-3 py-1.5 text-[11.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "salvando…" : "Marcar entregue"}
          </button>
        </div>
      )}
    </div>
  );
}
