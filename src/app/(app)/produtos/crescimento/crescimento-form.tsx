"use client";

import { useMemo, useState, useTransition } from "react";
import { projetarPlataforma, type FaseCrescimento } from "@/lib/projecao-clientes";
import { salvarCrescimento } from "./crescimento-actions";

type Mod = { id: string; codigo: string; nome: string; crescimento: FaseCrescimento[] | null; data_inicio_testes: string | null };

const HORIZONTE = 36;
const num = (v: string) => Number(v.replace(",", ".")) || 0;

function TabelaFases({ fases, onChange }: { fases: FaseCrescimento[]; onChange: (f: FaseCrescimento[]) => void }) {
  const editar = (i: number, campo: keyof FaseCrescimento, valor: string) =>
    onChange(fases.map((f, j) => (j === i ? { ...f, [campo]: campo === "nome" ? valor : num(valor) } : f)));
  return (
    <table className="w-full text-[11.5px]">
      <thead><tr className="text-left text-text-faint"><th className="py-1 pr-2 font-medium">Fase</th><th className="py-1 pr-2 font-medium">Meses</th><th className="py-1 pr-2 font-medium">Novos/mês</th><th className="py-1 pr-2 font-medium">Churn %/mês</th></tr></thead>
      <tbody>
        {fases.map((f, i) => (
          <tr key={i} className="border-t border-border-soft">
            <td className="py-1 pr-2"><input value={f.nome} onChange={(e) => editar(i, "nome", e.target.value)} className="input input-compacto" /></td>
            <td className="py-1 pr-2"><input value={f.meses} onChange={(e) => editar(i, "meses", e.target.value)} className="input input-compacto w-16" inputMode="numeric" /></td>
            <td className="py-1 pr-2"><input value={f.novos_mes} onChange={(e) => editar(i, "novos_mes", e.target.value)} className="input input-compacto w-16" inputMode="decimal" /></td>
            <td className="py-1 pr-2"><input value={f.churn_pct} onChange={(e) => editar(i, "churn_pct", e.target.value)} className="input input-compacto w-16" inputMode="decimal" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CrescimentoForm({ modulos, padraoInicial }: { modulos: Mod[]; padraoInicial: FaseCrescimento[] }) {
  const [padrao, setPadrao] = useState<FaseCrescimento[]>(padraoInicial.length ? padraoInicial : []);
  const [herda, setHerda] = useState<Record<string, boolean>>(Object.fromEntries(modulos.map((m) => [m.id, !m.crescimento])));
  const [curvas, setCurvas] = useState<Record<string, FaseCrescimento[]>>(Object.fromEntries(modulos.map((m) => [m.id, m.crescimento ?? padraoInicial])));
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, start] = useTransition();

  // offset de cada módulo = meses após o início mais cedo (pela data de início dos testes)
  const offsets = useMemo(() => {
    const datas = modulos.map((m) => m.data_inicio_testes).filter(Boolean) as string[];
    const base = datas.length ? datas.sort()[0] : null;
    const off: Record<string, number> = {};
    for (const m of modulos) {
      if (!base || !m.data_inicio_testes) { off[m.id] = 0; continue; }
      const a = new Date(base), b = new Date(m.data_inicio_testes);
      off[m.id] = Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
    }
    return off;
  }, [modulos]);

  const proj = useMemo(() => projetarPlataforma(
    modulos.map((m) => ({ codigo: m.codigo, nome: m.nome, fases: herda[m.id] ? padrao : curvas[m.id], offsetMes: offsets[m.id] ?? 0 })),
    HORIZONTE,
  ), [modulos, herda, padrao, curvas, offsets]);

  const salvar = () => {
    setErro(null); setSalvo(false);
    start(async () => {
      const r = await salvarCrescimento(padrao, modulos.map((m) => ({ id: m.id, herdaPadrao: herda[m.id], fases: curvas[m.id] })));
      if (r.error) setErro(r.error); else setSalvo(true);
    });
  };

  const clientes = (mesIdx: number) => Math.round(proj.total[Math.min(HORIZONTE - 1, mesIdx)] ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-wine-deep p-4 text-white">
        <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">Projeção de clientes ativos na plataforma</p>
        <div className="mt-1 flex flex-wrap gap-x-8 gap-y-1">
          <span className="text-[13px]">12 meses: <b className="text-[18px]">{clientes(11)}</b></span>
          <span className="text-[13px]">24 meses: <b className="text-[18px]">{clientes(23)}</b></span>
          <span className="text-[13px]">36 meses: <b className="text-[18px]">{clientes(35)}</b></span>
        </div>
        <p className="mt-1 text-[11px] text-white/70">Soma dos módulos, respeitando a data de início dos testes de cada um (tela 1).</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-heading text-sm font-semibold">Primeiro lançamento (padrão)</h2>
        <p className="mb-2 text-[12px] text-text-muted">Curva usada por cada módulo que herdar o padrão. Ajuste e todos os que herdam acompanham.</p>
        <TabelaFases fases={padrao} onChange={(f) => { setSalvo(false); setPadrao(f); }} />
      </div>

      {modulos.map((m) => {
        const pm = proj.porModulo.find((x) => x.codigo === m.codigo);
        return (
          <div key={m.id} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold">{m.nome} <span className="text-[11px] font-normal text-text-faint">{m.data_inicio_testes ? `início ${m.data_inicio_testes}` : "sem data de início (tela 1)"}</span></h3>
              <div className="flex items-center gap-3 text-[12px]">
                <span className="text-text-faint">12m: <b>{Math.round(pm?.curva[11] ?? 0)}</b> · 36m: <b>{Math.round(pm?.curva[35] ?? 0)}</b></span>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={herda[m.id]} onChange={(e) => { setSalvo(false); setHerda((h) => ({ ...h, [m.id]: e.target.checked })); }} className="accent-wine" /> herda o padrão</label>
              </div>
            </div>
            {!herda[m.id] && <div className="mt-2"><TabelaFases fases={curvas[m.id]} onChange={(f) => { setSalvo(false); setCurvas((c) => ({ ...c, [m.id]: f })); }} /></div>}
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button type="button" disabled={pendente} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">{pendente ? "Salvando…" : "Salvar crescimento"}</button>
        {salvo && <span className="text-[11.5px] text-success">Salvo.</span>}
        {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
      </div>
    </div>
  );
}
