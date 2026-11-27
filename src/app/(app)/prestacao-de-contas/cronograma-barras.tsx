"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarEntrega, removerEntrega, urlEvidenciaEntrega } from "./entregas-evidencia-actions";
import type { CronogramaEntregas, AtividadeBarra, RubricaDaAtividade } from "@/lib/prestacao-entregas";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmt0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ym: string) => `${MES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const LEFT = 300;
const COLW = 52;

export function CronogramaBarras({
  cronograma,
  programaId,
  podeEditar,
}: {
  cronograma: CronogramaEntregas;
  programaId: string;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<Record<string, boolean>>({});
  const { meses, atividades, corte } = cronograma;
  const n = Math.max(meses.length, 1);
  const minW = LEFT + n * COLW;

  const aberta = abertaId ? atividades.find((a) => a.id === abertaId) ?? null : null;
  const corteIdx = meses.findIndex((m) => m >= corte.finalIniMes); // 1ª coluna da prestação Final

  function idx(ym: string) {
    const i = meses.indexOf(ym.slice(0, 7));
    if (i >= 0) return i;
    return ym.slice(0, 7) < (meses[0] ?? ym) ? 0 : n - 1;
  }
  const C = (ym: string) => ((idx(ym) + 0.5) / n) * 100;
  const L = (ym: string) => (idx(ym) / n) * 100;
  const R = (ym: string) => ((idx(ym) + 1) / n) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary-fill/40 bg-primary-soft px-2 py-1 text-primary-deep"><b>1ª Parcial</b> · até {rotuloMes(corte.parcialFimMes)} · prestar 30/05/27</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-wine/40 bg-wine-soft px-2 py-1 text-wine-deep"><b>Final</b> · {rotuloMes(corte.finalIniMes)} em diante · prestar 30/11/27</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div style={{ minWidth: minW }}>
          {/* cabeçalho de meses */}
          <div className="sticky top-0 z-10 grid border-b border-border bg-surface" style={{ gridTemplateColumns: `${LEFT}px 1fr` }}>
            <div className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">Atividade ▸ rúbrica que paga</div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
              {meses.map((m, i) => (
                <div key={m} className={`py-2 text-center text-[9.5px] font-medium text-text-muted ${i === corteIdx ? "border-l-2 border-primary/60" : "border-l border-border-soft"}`}>
                  <div className="font-semibold">M{i + 1}</div>
                  <div className="text-text-faint">{rotuloMes(m)}</div>
                </div>
              ))}
            </div>
          </div>

          {atividades.map((a) => (
            <AtividadeLinhas
              key={a.id}
              a={a}
              n={n}
              meses={meses}
              corteIdx={corteIdx}
              expandida={!!expandida[a.id]}
              onToggle={() => setExpandida((e) => ({ ...e, [a.id]: !e[a.id] }))}
              onAbrir={() => setAbertaId(a.id)}
              C={C}
              L={L}
              R={R}
            />
          ))}
          {atividades.length === 0 && <p className="px-4 py-6 text-[12.5px] text-text-muted">Sem atividades cadastradas no cronograma deste programa.</p>}
        </div>
      </div>

      {/* legenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm border border-wine/60 bg-wine-soft" /> janela da atividade</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-wine opacity-60" /> entrega prevista (pendente)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-success" /> entregue (mês real)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-px bg-primary/60" /> corte Parcial · Final</span>
      </div>

      {aberta && (
        <DetalheAtividade
          atividade={aberta}
          programaId={programaId}
          podeEditar={podeEditar}
          corte={corte}
          onClose={() => setAbertaId(null)}
          onRefresh={() => router.refresh()}
        />
      )}
    </div>
  );
}

function AtividadeLinhas({
  a, n, meses, corteIdx, expandida, onToggle, onAbrir, C, L, R,
}: {
  a: AtividadeBarra; n: number; meses: string[]; corteIdx: number; expandida: boolean;
  onToggle: () => void; onAbrir: () => void;
  C: (ym: string) => number; L: (ym: string) => number; R: (ym: string) => number;
}) {
  const todasEntregas = a.rubricas.flatMap((r) => r.entregas);
  return (
    <div className="border-b border-border-soft last:border-b-0">
      {/* linha principal da atividade */}
      <div className="grid items-stretch" style={{ gridTemplateColumns: `${LEFT}px 1fr` }}>
        <button type="button" onClick={onToggle} className="flex items-start gap-2 px-3 py-2 text-left hover:bg-bg/40">
          <span className="mt-0.5 grid h-5 w-7 shrink-0 place-items-center rounded bg-wine-soft text-[10px] font-bold text-wine-deep">{a.codigo}</span>
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold leading-tight">{a.nome}</span>
            <span className="text-[10px] text-text-faint">{a.responsavel} · {a.rubricas.length} rúbrica(s) · {a.totalEntregas} entregue(s)</span>
          </span>
          <span className={`ml-auto mt-1 shrink-0 text-[10px] text-text-faint transition-transform ${expandida ? "rotate-90" : ""}`}>▶</span>
        </button>
        <button type="button" onClick={onAbrir} className="relative block h-11 w-full" title="Abrir entregas da atividade">
          <GridLines n={n} corteIdx={corteIdx} />
          <span className="absolute top-1/2 h-3 -translate-y-1/2 rounded-[5px] border border-wine/50 bg-wine-soft" style={{ left: `${L(a.iniPrev)}%`, width: `${R(a.fimPrev) - L(a.iniPrev)}%` }} />
          {a.pendentes.map((m) => (<Ponto key={`p${m}`} cor="bg-wine opacity-60" left={C(m)} titulo={`Prevista · ${rotuloMes(m)} — pendente`} />))}
          {stack(todasEntregas.map((e) => e.mesReal)).map((s, i) => (
            <Ponto key={`e${i}`} cor="bg-success" left={C(s.mes)} offsetPx={s.off * 7} titulo={`Entregue · ${rotuloMes(s.mes)}`} />
          ))}
        </button>
      </div>

      {/* sub-linhas por rúbrica */}
      {expandida && a.rubricas.map((r) => (
        <div key={r.rubricaId} className="grid items-stretch border-t border-dashed border-border-soft/70 bg-bg/30" style={{ gridTemplateColumns: `${LEFT}px 1fr` }}>
          <div className="flex items-center gap-1.5 px-3 py-1.5 pl-11 text-[11px]">
            <span className="min-w-0 truncate font-medium" title={r.nome}>{r.nome}</span>
            <span className={`shrink-0 rounded-full px-1.5 py-px text-[8px] font-bold uppercase ${r.contrapartida ? "bg-wine-soft text-wine-deep" : "bg-primary-soft text-primary-deep"}`}>{r.contrapartida ? "contrap." : "subv."}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-text-muted">{fmt0(r.valorContrato)}</span>
          </div>
          <div className="relative h-7">
            <GridLines n={n} corteIdx={corteIdx} />
            {r.entregas.length === 0 ? (
              <span className="absolute top-1/2 left-2 -translate-y-1/2 text-[9.5px] text-text-faint">sem entrega lançada</span>
            ) : stack(r.entregas.map((e) => e.mesReal)).map((s, i) => (
              <Ponto key={i} cor="bg-success" left={C(s.mes)} offsetPx={s.off * 7} small titulo={`Entregue · ${rotuloMes(s.mes)}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GridLines({ n, corteIdx }: { n: number; corteIdx: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {Array.from({ length: n }).map((_, i) => (<div key={i} className={i === corteIdx ? "border-l-2 border-primary/50" : "border-l border-border-soft/50"} />))}
    </div>
  );
}

function Ponto({ cor, left, titulo, offsetPx = 0, small }: { cor: string; left: number; titulo: string; offsetPx?: number; small?: boolean }) {
  const sz = small ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <span
      className={`absolute top-1/2 ${sz} -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] border-2 border-surface shadow-sm ${cor}`}
      style={{ left: `calc(${left}% + ${offsetPx}px)` }}
      title={titulo}
    />
  );
}

/** Empilha marcadores que caem no mesmo mês (offset horizontal). */
function stack(mesesReais: string[]) {
  const seen: Record<string, number> = {};
  return mesesReais.map((mes) => { const off = seen[mes] ?? 0; seen[mes] = off + 1; return { mes, off }; });
}

function prestacaoDoMes(ym: string, corte: { finalIniMes: string }) {
  return ym >= corte.finalIniMes ? "Final" : "1ª Parcial";
}

function DetalheAtividade({
  atividade, programaId, podeEditar, corte, onClose, onRefresh,
}: {
  atividade: AtividadeBarra; programaId: string; podeEditar: boolean;
  corte: { parcialFimMes: string; finalIniMes: string };
  onClose: () => void; onRefresh: () => void;
}) {
  const dataBR = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
  // entregas confirmadas por mês real
  const porMesReal = new Map<string, { rub: RubricaDaAtividade; e: RubricaDaAtividade["entregas"][number] }[]>();
  for (const r of atividade.rubricas) for (const e of r.entregas) {
    porMesReal.set(e.mesReal, [...(porMesReal.get(e.mesReal) ?? []), { rub: r, e }]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="mt-8 mb-8 w-full max-w-lg rounded-2xl bg-surface p-5 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-sm font-semibold">{atividade.codigo} · {atividade.nome}</h3>
            <p className="text-[11.5px] text-text-muted">{atividade.responsavel} · {dataBR(atividade.iniPrev)} → {dataBR(atividade.fimPrev)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[16px] leading-none text-text-muted hover:bg-bg">✕</button>
        </div>

        <p className="mb-3 rounded-lg bg-bg/60 px-3 py-2 text-[11px] text-text-muted">
          Pago à medida que o prestador comprova (regra FAPES 9.7/9.9). Cada entrega leva <b>data real + evidência</b>; vira verde no mês real e cai na prestação correspondente.
        </p>

        <div className="flex flex-col gap-2.5">
          {atividade.meses.map((mp) => {
            const feitas = porMesReal.get(mp) ?? [];
            return (
              <div key={mp} className="rounded-xl border border-border-soft bg-bg/30 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[12px] font-semibold">{rotuloMes(mp)}</span>
                  <span className={`rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase ${mp >= corte.finalIniMes ? "bg-wine-soft text-wine-deep" : "bg-primary-soft text-primary-deep"}`}>{prestacaoDoMes(mp, corte)}</span>
                </div>
                {feitas.map(({ rub, e }) => (
                  <EntregaFeita key={e.id} nome={rub.nome} contrap={rub.contrapartida} valor={e.valor} evidenciaNome={e.evidenciaNome} entregaId={e.id} podeEditar={podeEditar} onRefresh={onRefresh} />
                ))}
                {podeEditar && (
                  <LancarEntrega programaId={programaId} atividadeId={atividade.id} rubricas={atividade.rubricas} mesPrevisto={mp} onRefresh={onRefresh} />
                )}
                {!podeEditar && feitas.length === 0 && <p className="text-[11px] text-text-faint">pendente</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EntregaFeita({ nome, contrap, valor, evidenciaNome, entregaId, podeEditar, onRefresh }: {
  nome: string; contrap: boolean; valor: number | null; evidenciaNome: string | null; entregaId: string; podeEditar: boolean; onRefresh: () => void;
}) {
  const [busy, start] = useTransition();
  async function ver() { const u = await urlEvidenciaEntrega(entregaId); if (u) window.open(u, "_blank"); }
  function remover() { start(async () => { await removerEntrega(entregaId); onRefresh(); }); }
  return (
    <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft/50 px-2.5 py-1.5 text-[11.5px]">
      <span className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-success" />
      <span className="min-w-0">
        <span className="font-medium">{nome}</span> <span className={`rounded-full px-1 text-[8px] font-bold uppercase ${contrap ? "bg-wine-soft text-wine-deep" : "bg-primary-soft text-primary-deep"}`}>{contrap ? "contrap." : "subv."}</span>
        {valor != null && <span className="ml-1 font-mono text-text-muted">{fmt(valor)}</span>}
        {evidenciaNome && <span className="block truncate text-[10px] text-text-faint" title={evidenciaNome}>📎 {evidenciaNome}</span>}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <button type="button" onClick={ver} className="text-[10.5px] text-primary-deep underline">ver</button>
        {podeEditar && <button type="button" disabled={busy} onClick={remover} className="text-[10.5px] text-danger underline">remover</button>}
      </span>
    </div>
  );
}

function LancarEntrega({ programaId, atividadeId, rubricas, mesPrevisto, onRefresh }: {
  programaId: string; atividadeId: string; rubricas: RubricaDaAtividade[]; mesPrevisto: string; onRefresh: () => void;
}) {
  const [abrir, setAbrir] = useState(false);
  const [rubricaId, setRubricaId] = useState(rubricas[0]?.rubricaId ?? "");
  const [data, setData] = useState(`${mesPrevisto}-15`);
  const [valor, setValor] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function salvar() {
    if (!rubricaId) { setErro("Escolha a rúbrica que paga."); return; }
    if (!arquivo) { setErro("Anexe a evidência."); return; }
    if (!data) { setErro("Informe a data da entrega."); return; }
    setErro(null);
    const fd = new FormData();
    fd.set("programaId", programaId);
    fd.set("atividadeId", atividadeId);
    fd.set("rubricaId", rubricaId);
    fd.set("mesPrevisto", mesPrevisto);
    fd.set("dataReal", data);
    fd.set("valor", valor);
    fd.set("arquivo", arquivo);
    start(async () => {
      const r = await marcarEntrega(fd);
      if (r.error) { setErro(r.error); return; }
      setAbrir(false); setArquivo(null); setValor(""); onRefresh();
    });
  }

  if (!abrir) return (
    <button type="button" onClick={() => setAbrir(true)} className="mt-0.5 text-[10.5px] font-medium text-primary-deep underline">+ lançar entrega neste mês</button>
  );
  return (
    <div className="mt-1 flex flex-col gap-2 rounded-lg border border-border-soft bg-surface p-2.5">
      <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">Rúbrica que paga
        <select className="input input-compacto" value={rubricaId} onChange={(e) => setRubricaId(e.target.value)}>
          {rubricas.map((r) => (<option key={r.rubricaId} value={r.rubricaId}>{r.nome}{r.contrapartida ? " (contrapartida)" : ""}</option>))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">Data real
          <input type="date" className="input input-compacto" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">Valor (opcional)
          <input type="text" inputMode="decimal" placeholder="0,00" className="input input-compacto" value={valor} onChange={(e) => setValor(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">Evidência de entrega
        <input type="file" className="text-[11px]" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
      </label>
      {erro && <p className="text-[10.5px] text-danger">{erro}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={salvar} className="rounded-lg bg-success px-3 py-1.5 text-[11.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? "salvando…" : "Marcar entregue"}</button>
        <button type="button" onClick={() => setAbrir(false)} className="rounded-lg px-3 py-1.5 text-[11.5px] text-text-muted hover:bg-bg">cancelar</button>
      </div>
    </div>
  );
}
