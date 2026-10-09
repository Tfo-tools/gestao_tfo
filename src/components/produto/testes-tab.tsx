"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { type TesteProduto } from "@/lib/fases-lancamento";
import { montarLinhas, type ModuloRow, type BlocoRow, type LinhaProduto } from "./linhas";
import { salvarTestes } from "@/app/(app)/produtos/produto-actions";

const fmtData = (iso?: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "sem data");
const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")) || 0);

/**
 * Aba 2 — plano de testes. Mesmas funcionalidades, agrupadas pela data de validação em comum (a fase de
 * testes, vinda da aba 1). Por funcionalidade: nº de beta testers, início e fim dos testes, modelo e
 * valor se pago.
 */
export function TestesTab({ modulos, blocos }: { modulos: ModuloRow[]; blocos: BlocoRow[] }) {
  const linhas = useMemo(() => montarLinhas(modulos, blocos).filter((l) => !l.header), [modulos, blocos]);
  const grupos = useMemo(() => {
    const map = new Map<string, LinhaProduto[]>();
    for (const l of linhas) {
      const chave = (l.fases_datas?.validacao as string) || "";
      const arr = map.get(chave) ?? [];
      arr.push(l);
      map.set(chave, arr);
    }
    return [...map.entries()].sort((a, b) => (a[0] || "9999").localeCompare(b[0] || "9999"));
  }, [linhas]);

  const [testes, setTestes] = useState<Record<string, TesteProduto>>(() =>
    Object.fromEntries(linhas.map((l) => [l.id, { modelo: "gratuito", ...l.teste }])),
  );
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  const upd = (id: string, patch: Partial<TesteProduto>) => {
    setSalvo(false);
    setTestes((t) => ({ ...t, [id]: { ...t[id], ...patch } }));
  };
  const salvar = () => {
    setErro(null); setSalvo(false);
    start(async () => {
      const itens = linhas.map((l) => ({ tipo: l.tipo, id: l.id, teste: testes[l.id] ?? {} }));
      const r = await salvarTestes(itens);
      if (r.error) setErro(r.error); else setSalvo(true);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-3xl text-[12.5px] text-text-muted">As funcionalidades aparecem agrupadas pela data de validação (aba Fases) — cada grupo é uma leva de testes. Preencha, por funcionalidade: beta testers, início e fim dos testes, modelo e valor se for pago.</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border text-left text-text-faint">
              <th className="py-2 pl-4 pr-2 font-medium">Funcionalidade</th>
              <th className="px-2 py-2 font-medium">Beta testers</th>
              <th className="px-2 py-2 font-medium">Início</th>
              <th className="px-2 py-2 font-medium">Fim</th>
              <th className="px-2 py-2 font-medium">Modelo</th>
              <th className="px-2 py-2 font-medium">Valor R$ (se pago)</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(([data, rows]) => (
              <Fragment key={`g-${data || "sem"}`}>
                <tr className="bg-surface-muted">
                  <td colSpan={6} className="px-4 py-1.5 text-[11.5px] font-medium text-text-muted">Validação: {fmtData(data)} · {rows.length} funcionalidade{rows.length > 1 ? "s" : ""}</td>
                </tr>
                {rows.map((l) => {
                  const t = testes[l.id] ?? {};
                  return (
                    <tr key={l.key} className="border-t border-border-soft">
                      <td className="py-1.5 pl-4 pr-2">{l.nome} <span className="text-[11px] text-text-faint">· {l.moduloNome}</span></td>
                      <td className="px-2 py-1.5"><input value={t.beta_testers ?? ""} onChange={(e) => upd(l.id, { beta_testers: num(e.target.value) })} className="input input-compacto w-20 text-right" inputMode="numeric" /></td>
                      <td className="px-2 py-1.5"><input type="date" value={t.inicio ?? ""} onChange={(e) => upd(l.id, { inicio: e.target.value || null })} className="input input-compacto" /></td>
                      <td className="px-2 py-1.5"><input type="date" value={t.fim ?? ""} onChange={(e) => upd(l.id, { fim: e.target.value || null })} className="input input-compacto" /></td>
                      <td className="px-2 py-1.5">
                        <select value={t.modelo ?? "gratuito"} onChange={(e) => upd(l.id, { modelo: e.target.value as "pago" | "gratuito" })} className="input input-compacto">
                          <option value="gratuito">Gratuito</option>
                          <option value="pago">Pago</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><input value={t.valor ?? ""} disabled={t.modelo !== "pago"} placeholder={t.modelo !== "pago" ? "—" : ""} onChange={(e) => upd(l.id, { valor: num(e.target.value) })} className="input input-compacto w-24 text-right disabled:opacity-40" inputMode="decimal" /></td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pendente} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">{pendente ? "Salvando…" : "Salvar testes"}</button>
        {salvo && <span className="text-[11.5px] text-success">Salvo.</span>}
        {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
      </div>
    </div>
  );
}
