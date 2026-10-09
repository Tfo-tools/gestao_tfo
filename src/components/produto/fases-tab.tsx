"use client";

import { useMemo, useState, useTransition } from "react";
import { FASES_LANCAMENTO, type FasesDatas, type FaseLancKey } from "@/lib/fases-lancamento";
import { montarLinhas, COR_MODULO, COR_MODULO_FALLBACK, type ModuloRow, type BlocoRow } from "./linhas";
import { salvarFases } from "@/app/(app)/produtos/produto-actions";

/**
 * Aba 1 — fases de lançamento. Linhas = funcionalidades; colunas = as 6 fases, cada uma com a data de
 * início. O fim de uma fase é o início da próxima; Maturidade só tem início.
 */
export function FasesTab({ modulos, blocos }: { modulos: ModuloRow[]; blocos: BlocoRow[] }) {
  const linhasBase = useMemo(() => montarLinhas(modulos, blocos), [modulos, blocos]);
  const [datas, setDatas] = useState<Record<string, FasesDatas>>(() =>
    Object.fromEntries(linhasBase.filter((l) => !l.header).map((l) => [l.id, { ...l.fases_datas }])),
  );
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  const editar = (id: string, fase: FaseLancKey, valor: string) => {
    setSalvo(false);
    setDatas((d) => ({ ...d, [id]: { ...d[id], [fase]: valor || null } }));
  };
  const salvar = () => {
    setErro(null); setSalvo(false);
    start(async () => {
      const itens = linhasBase.filter((l) => !l.header).map((l) => ({ tipo: l.tipo, id: l.id, fases_datas: datas[l.id] ?? {} }));
      const r = await salvarFases(itens);
      if (r.error) setErro(r.error); else setSalvo(true);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-3xl text-[12.5px] text-text-muted">A data de início de cada fase, por funcionalidade. O fim de uma fase é o começo da próxima; a Maturidade só tem início. A Validação alimenta o plano de testes (aba Testes) e a PMF é o lançamento previsto (aba Crescimento).</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border text-left text-text-faint">
              <th className="py-2 pl-4 pr-2 font-medium">Funcionalidade</th>
              {FASES_LANCAMENTO.map((f) => (
                <th key={f.key} className="px-2 py-2 font-medium">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhasBase.map((l) =>
              l.header ? (
                <tr key={l.key} className={COR_MODULO[l.moduloCodigo] ?? COR_MODULO_FALLBACK}>
                  <td colSpan={1 + FASES_LANCAMENTO.length} className="px-4 py-1.5 font-heading text-[12.5px] font-semibold">{l.moduloNome}</td>
                </tr>
              ) : (
                <tr key={l.key} className="border-t border-border-soft">
                  <td className="py-1.5 pl-4 pr-2">{l.nome}</td>
                  {FASES_LANCAMENTO.map((f) => (
                    <td key={f.key} className="px-2 py-1.5">
                      <input type="date" value={(datas[l.id]?.[f.key] as string) ?? ""} onChange={(e) => editar(l.id, f.key, e.target.value)} className="input input-compacto" />
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pendente} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">{pendente ? "Salvando…" : "Salvar fases"}</button>
        {salvo && <span className="text-[11.5px] text-success">Salvo.</span>}
        {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
      </div>
    </div>
  );
}
