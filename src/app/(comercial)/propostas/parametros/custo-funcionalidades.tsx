"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import type { Bloco, Modulo } from "@/lib/precificacao";
import { PERIODOS, execucoesMes } from "@/lib/processamento";
import { COR_MODULO, COR_MODULO_FALLBACK } from "@/components/produto/linhas";
import { salvarProcFuncionalidades } from "@/app/(app)/produtos/produto-actions";

type Dado = { tipo: "modulo" | "bloco"; proc_periodo: string | null; proc_dias: number | null; proc_fracao_volume: number | null; custo_processamento_mes: number | null };
type Row = { key: string; header: boolean; editavel: boolean; tipo: "modulo" | "bloco"; id: string; nome: string; moduloCodigo: string };
const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")) || 0);
const dadoDe = (x: { proc_periodo?: string | null; proc_dias?: number | null; proc_fracao_volume?: number | null; custo_processamento_mes?: number | null }, tipo: "modulo" | "bloco"): Dado =>
  ({ tipo, proc_periodo: x.proc_periodo ?? null, proc_dias: x.proc_dias ?? null, proc_fracao_volume: x.proc_fracao_volume ?? 1, custo_processamento_mes: x.custo_processamento_mes ?? 0 });

/**
 * Custo de processamento por funcionalidade (COGS/Infra). Os três módulos aparecem: Skills com suas
 * funcionalidades, Mind e Price como "produto inteiro" (editáveis na própria linha). Modelo por período:
 * execuções/mês × fração × GB do cliente × R$/GB processado; sem período, usa o valor fixo (R$/mês).
 */
export function CustoFuncionalidades({ modulos, blocos }: { modulos: Modulo[]; blocos: Bloco[] }) {
  const { rows, inicial } = useMemo(() => {
    const mods = [...modulos].filter((m) => m.ativo).sort((a, b) => a.ordem - b.ordem);
    const rows: Row[] = [];
    const inicial: Record<string, Dado> = {};
    for (const m of mods) {
      const filhos = blocos.filter((b) => b.modulo_id === m.id).sort((a, b) => a.ordem - b.ordem);
      if (filhos.length > 0) {
        rows.push({ key: `h-${m.id}`, header: true, editavel: false, tipo: "modulo", id: m.id, nome: m.nome, moduloCodigo: m.codigo });
        for (const b of filhos) {
          rows.push({ key: `b-${b.id}`, header: false, editavel: true, tipo: "bloco", id: b.id, nome: b.nome, moduloCodigo: m.codigo });
          inicial[b.id] = dadoDe(b, "bloco");
        }
      } else {
        rows.push({ key: `m-${m.id}`, header: false, editavel: true, tipo: "modulo", id: m.id, nome: `${m.nome} (produto inteiro)`, moduloCodigo: m.codigo });
        inicial[m.id] = dadoDe(m, "modulo");
      }
    }
    return { rows, inicial };
  }, [modulos, blocos]);

  const [dados, setDados] = useState<Record<string, Dado>>(inicial);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  const upd = (id: string, patch: Partial<Dado>) => { setSalvo(false); setDados((d) => ({ ...d, [id]: { ...d[id], ...patch } })); };
  const salvar = () => {
    setErro(null); setSalvo(false);
    start(async () => {
      const r = await salvarProcFuncionalidades(Object.entries(dados).map(([id, d]) => ({ id, ...d })));
      if (r.error) setErro(r.error); else setSalvo(true);
    });
  };

  const linhaEditavel = (row: Row) => {
    const l = dados[row.id];
    const periodo = PERIODOS.find((p) => p.value === l?.proc_periodo);
    const exec = execucoesMes(l?.proc_periodo, l?.proc_dias);
    const temPeriodo = !!l?.proc_periodo;
    const corModulo = row.tipo === "modulo" ? (COR_MODULO[row.moduloCodigo] ?? COR_MODULO_FALLBACK) : "";
    return (
      <tr key={row.key} className={`border-t border-border-soft ${corModulo}`}>
        <td className={`py-1 pr-2 ${row.tipo === "modulo" ? "font-heading text-[12px] font-semibold" : ""}`}>{row.nome}</td>
        <td className="py-1 pr-2">
          <select value={l?.proc_periodo ?? ""} onChange={(e) => upd(row.id, { proc_periodo: e.target.value || null })} className="input input-compacto">
            <option value="">— (valor fixo)</option>
            {PERIODOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </td>
        <td className="py-1 pr-2">
          {periodo?.pedeDias ? <input value={l?.proc_dias ?? ""} onChange={(e) => upd(row.id, { proc_dias: num(e.target.value) })} className="input input-compacto w-14 text-right" inputMode="decimal" placeholder={periodo.pedeDias === "semana" ? "/sem" : "/mês"} /> : <span className="text-text-faint">—</span>}
        </td>
        <td className="py-1 pr-2">
          <input value={temPeriodo ? Math.round((l?.proc_fracao_volume ?? 1) * 100) : ""} disabled={!temPeriodo} onChange={(e) => upd(row.id, { proc_fracao_volume: (Number(e.target.value.replace(",", ".")) || 0) / 100 })} className="input input-compacto w-16 text-right disabled:opacity-40" inputMode="decimal" />
        </td>
        <td className="py-1 pr-2 tabular-nums text-text-muted">{exec == null ? "—" : exec.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
        <td className="py-1 pr-2">
          <input value={temPeriodo ? "" : (l?.custo_processamento_mes ?? "")} disabled={temPeriodo} placeholder={temPeriodo ? "pelo período" : ""} onChange={(e) => upd(row.id, { custo_processamento_mes: num(e.target.value) })} className="input input-compacto w-20 text-right disabled:opacity-40" inputMode="decimal" />
        </td>
      </tr>
    );
  };

  return (
    <div className="rounded-lg border border-border-soft p-3">
      <h3 className="text-[12.5px] font-medium">Custo por funcionalidade (processamento)</h3>
      <p className="mb-2 mt-0.5 text-[11px] text-text-muted">Por quanto em quanto tempo o back-end reprocessa cada funcionalidade e quanto do volume varre. Custo = execuções/mês × fração × GB do cliente × R$/GB processado. Sem período, vale o valor fixo. Mind e Price entram como produto inteiro.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="py-1 pr-2 font-medium">Funcionalidade</th>
              <th className="py-1 pr-2 font-medium">Período</th>
              <th className="py-1 pr-2 font-medium">Dias</th>
              <th className="py-1 pr-2 font-medium">Fração do volume (%)</th>
              <th className="py-1 pr-2 font-medium">Exec./mês</th>
              <th className="py-1 pr-2 font-medium">Custo fixo (R$/mês)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.header ? (
                <tr key={row.key} className={COR_MODULO[row.moduloCodigo] ?? COR_MODULO_FALLBACK}>
                  <td colSpan={6} className="px-2 py-1 font-heading text-[12px] font-semibold">{row.nome}</td>
                </tr>
              ) : (
                <Fragment key={row.key}>{linhaEditavel(row)}</Fragment>
              ),
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={pendente} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-1.5 text-[12px] font-medium text-white disabled:opacity-60">{pendente ? "Salvando…" : "Salvar processamento"}</button>
        {salvo && <span className="text-[11.5px] text-success">Salvo.</span>}
        {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
      </div>
    </div>
  );
}
