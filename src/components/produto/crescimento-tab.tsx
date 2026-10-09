"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { FASES_CRESCIMENTO, type CrescimentoFases, type FaseLancKey } from "@/lib/fases-lancamento";
import { projetarPlataforma, mesesEntre, type FaseCrescimento } from "@/lib/projecao-clientes";
import { montarLinhas, COR_MODULO, COR_MODULO_FALLBACK, type ModuloRow, type BlocoRow, type LinhaProduto } from "./linhas";
import { salvarCrescimentoFases } from "@/app/(app)/produtos/produto-actions";

const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")) || 0);
const HORIZONTE = 36;

/** Monta a curva (duração de cada fase pelas datas; a Maturidade segue até o horizonte). */
function curvaDaLinha(l: LinhaProduto, cres: CrescimentoFases): FaseCrescimento[] {
  const fds = l.fases_datas ?? {};
  const ordem: FaseLancKey[] = ["pmf", "tracao", "escala", "maturidade"];
  const curva: FaseCrescimento[] = [];
  for (let i = 0; i < ordem.length; i++) {
    const k = ordem[i];
    const prox = ordem[i + 1];
    const ini = fds[k] as string | null | undefined;
    const fim = prox ? (fds[prox] as string | null | undefined) : null;
    const meses = i === ordem.length - 1 ? 0 : ini && fim ? mesesEntre(ini, fim) : 6; // fallback 6m por fase sem datas
    const c = cres[k] ?? {};
    curva.push({ nome: k, meses, novos_mes: Number(c.novos_mes) || 0, churn_pct: Number(c.churn_pct) || 0 });
  }
  return curva;
}

/**
 * Aba 4 — crescimento e churn por fase, da PMF em diante (a PMF começa no lançamento previsto).
 * Linhas = funcionalidades; para cada fase, novos clientes/mês e churn %/mês. A projeção soma tudo
 * respeitando a data de PMF de cada funcionalidade.
 */
export function CrescimentoTab({ modulos, blocos }: { modulos: ModuloRow[]; blocos: BlocoRow[] }) {
  const linhas = useMemo(() => montarLinhas(modulos, blocos), [modulos, blocos]);
  const leafs = useMemo(() => linhas.filter((l) => !l.header), [linhas]);
  const [cres, setCres] = useState<Record<string, CrescimentoFases>>(() =>
    Object.fromEntries(leafs.map((l) => [l.id, { ...l.crescimento_fases }])),
  );
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  const upd = (id: string, fase: FaseLancKey, campo: "novos_mes" | "churn_pct", v: string) => {
    setSalvo(false);
    setCres((c) => ({ ...c, [id]: { ...c[id], [fase]: { ...c[id]?.[fase], [campo]: num(v) } } }));
  };

  const proj = useMemo(() => {
    const datasPmf = leafs.map((l) => l.fases_datas?.pmf as string | null).filter(Boolean) as string[];
    const base = datasPmf.length ? datasPmf.sort()[0] : null;
    return projetarPlataforma(
      leafs.map((l) => ({
        codigo: l.id, nome: l.nome,
        fases: curvaDaLinha(l, cres[l.id] ?? {}),
        offsetMes: mesesEntre(base, (l.fases_datas?.pmf as string | null) ?? null),
      })),
      HORIZONTE,
    );
  }, [leafs, cres]);

  const totalEm = (m: number) => Math.round(proj.total[Math.min(HORIZONTE - 1, m)] ?? 0);

  const salvar = () => {
    setErro(null); setSalvo(false);
    start(async () => {
      const itens = leafs.map((l) => ({ tipo: l.tipo, id: l.id, crescimento_fases: cres[l.id] ?? {} }));
      const r = await salvarCrescimentoFases(itens);
      if (r.error) setErro(r.error); else setSalvo(true);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border bg-wine-deep p-4 text-white">
        <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">Projeção de clientes ativos (soma das funcionalidades)</p>
        <div className="mt-1 flex flex-wrap gap-x-8 gap-y-1">
          <span className="text-[13px]">12 meses: <b className="text-[18px]">{totalEm(11)}</b></span>
          <span className="text-[13px]">24 meses: <b className="text-[18px]">{totalEm(23)}</b></span>
          <span className="text-[13px]">36 meses: <b className="text-[18px]">{totalEm(35)}</b></span>
        </div>
        <p className="mt-1 text-[11px] text-white/70">Começa na PMF de cada funcionalidade; a duração de cada fase vem das datas da aba Fases (sem datas, usa 6 meses por fase).</p>
      </div>
      <p className="max-w-3xl text-[12.5px] text-text-muted">Da PMF em diante — antes do PMF não há cliente pagante. Para cada fase: novos clientes por mês e churn %/mês. A Maturidade segue até o fim do horizonte.</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border text-left text-text-faint">
              <th className="py-2 pl-4 pr-2 font-medium">Funcionalidade</th>
              {FASES_CRESCIMENTO.map((f) => (
                <th key={f.key} className="px-2 py-2 text-center font-medium" colSpan={2}>{f.label}</th>
              ))}
            </tr>
            <tr className="border-b border-border text-left text-text-faint">
              <th className="py-1 pl-4 pr-2" />
              {FASES_CRESCIMENTO.map((f) => (
                <Fragment key={f.key}>
                  <th className="px-2 py-1 text-[10.5px] font-normal">novos/mês</th>
                  <th className="px-2 py-1 text-[10.5px] font-normal">churn %</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) =>
              l.header ? (
                <tr key={l.key} className={COR_MODULO[l.moduloCodigo] ?? COR_MODULO_FALLBACK}>
                  <td colSpan={1 + FASES_CRESCIMENTO.length * 2} className="px-4 py-1.5 font-heading text-[12.5px] font-semibold">{l.moduloNome}</td>
                </tr>
              ) : (
                <tr key={l.key} className="border-t border-border-soft">
                  <td className="py-1.5 pl-4 pr-2">{l.nome}</td>
                  {FASES_CRESCIMENTO.map((f) => {
                    const c = cres[l.id]?.[f.key] ?? {};
                    return (
                      <Fragment key={f.key}>
                        <td className="px-2 py-1.5"><input value={c.novos_mes ?? ""} onChange={(e) => upd(l.id, f.key, "novos_mes", e.target.value)} className="input input-compacto w-14 text-right" inputMode="decimal" /></td>
                        <td className="px-2 py-1.5"><input value={c.churn_pct ?? ""} onChange={(e) => upd(l.id, f.key, "churn_pct", e.target.value)} className="input input-compacto w-14 text-right" inputMode="decimal" /></td>
                      </Fragment>
                    );
                  })}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pendente} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">{pendente ? "Salvando…" : "Salvar crescimento"}</button>
        {salvo && <span className="text-[11.5px] text-success">Salvo.</span>}
        {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
      </div>
    </div>
  );
}
