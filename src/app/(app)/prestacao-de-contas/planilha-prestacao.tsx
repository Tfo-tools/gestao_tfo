"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atribuirRubrica, anexarEvidencia, removerEvidencia, urlAnexo } from "./planilha-actions";
import type { Prestacao, RubricaLinha, StatusCel } from "@/lib/prestacao";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ym: string) => `${MES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const dataBR = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

const COR: Record<StatusCel, string> = {
  ok: "bg-[#DCFCE7] text-[#166534] hover:bg-[#bbf7d0]",
  parcial: "bg-[#FEF9C3] text-[#854D0E] hover:bg-[#fdf0a4]",
  atrasado: "bg-[#FEE2E2] text-[#991B1B] hover:bg-[#fecaca]",
  vazio: "bg-[#F3F4F6] text-[#9CA3AF] hover:bg-[#e8eaed]",
};
const ROTULO_STATUS: Record<StatusCel, string> = { ok: "comprovado", parcial: "falta evidência", atrasado: "atrasado", vazio: "previsto / nada lançado" };

export function PlanilhaPrestacao({ prestacao, rubricasOpcoes }: { prestacao: Prestacao; rubricasOpcoes: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [abertaKey, setAbertaKey] = useState<{ rubricaId: string; mes: string } | null>(null);
  const { meses, rubricas, bolsa, naoAtribuidas } = prestacao;

  const refresh = () => router.refresh();
  const rubAberta = abertaKey ? [...rubricas, ...bolsa].find((r) => r.id === abertaKey.rubricaId) ?? null : null;
  const celAberta = rubAberta && abertaKey ? rubAberta.porMes[abertaKey.mes] ?? null : null;

  function subir(despesaId: string, tipo: string, file: File) {
    const fd = new FormData();
    fd.set("despesaId", despesaId);
    fd.set("tipo", tipo);
    fd.set("arquivo", file);
    start(async () => { await anexarEvidencia(fd); refresh(); });
  }
  function remover(anexoId: string) {
    start(async () => { await removerEvidencia(anexoId); refresh(); });
  }
  async function abrir(anexoId: string) {
    const url = await urlAnexo(anexoId);
    if (url) window.open(url, "_blank");
  }
  function classificar(despesaId: string, rubricaId: string) {
    start(async () => { await atribuirRubrica(despesaId, rubricaId || null); refresh(); });
  }

  const linha = (r: RubricaLinha) => (
    <tr key={r.id} className="border-b border-border-soft">
      <td className="sticky left-0 z-10 max-w-[200px] bg-surface px-2 py-1.5">
        <div className="font-medium leading-tight">{r.nome}</div>
      </td>
      {meses.map((m) => {
        const c = r.porMes[m];
        if (!c) return <td key={m} className="px-1 py-1 text-center text-text-faint">·</td>;
        return (
          <td key={m} className="px-1 py-1">
            <button
              type="button"
              onClick={() => setAbertaKey({ rubricaId: r.id, mes: m })}
              className={`w-full rounded px-1.5 py-1 text-right font-mono text-[11px] ${COR[c.status]}`}
              title={`${ROTULO_STATUS[c.status]} · previsto ${fmt(c.previsto)}${c.realizado ? ` · lançado ${fmt(c.realizado)}` : ""}`}
            >
              {fmt(c.previsto || c.realizado)}
            </button>
          </td>
        );
      })}
      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono font-semibold">{fmt(r.totalPrevisto)}</td>
    </tr>
  );

  const tabela = (grupo: RubricaLinha[]) => (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-border text-text-muted">
            <th className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-medium">Rubrica</th>
            {meses.map((m) => (
              <th key={m} className="whitespace-nowrap px-1 py-2 text-center font-medium">{rotuloMes(m)}</th>
            ))}
            <th className="whitespace-nowrap px-2 py-2 text-right font-semibold">Previsto</th>
          </tr>
        </thead>
        <tbody>{grupo.map(linha)}</tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
        <span>Clique numa célula pra comprovar.</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#DCFCE7]" /> comprovado</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#FEF9C3]" /> falta evidência</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#FEE2E2]" /> atrasado</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#F3F4F6]" /> previsto</span>
      </div>

      {tabela(rubricas)}

      {bolsa.length > 0 && (
        <div className="border-t border-border pt-4">
          <h3 className="mb-0.5 text-[12.5px] font-semibold">Bolsa — à parte</h3>
          <p className="mb-2 text-[11px] text-text-muted">Ainda sem instrução da FAPES sobre a comprovação da bolsa.</p>
          {tabela(bolsa)}
        </div>
      )}

      {naoAtribuidas.length > 0 && (
        <div className="rounded-xl border border-wine/30 bg-wine-soft/40 p-4">
          <h3 className="mb-1 text-[12.5px] font-semibold text-wine-deep">Despesas a classificar ({naoAtribuidas.length})</h3>
          <p className="mb-2 text-[11px] text-text-muted">Despesas que comprovam o programa mas ainda não têm rubrica — escolha a rubrica pra elas entrarem na planilha.</p>
          <div className="flex flex-col gap-1.5">
            {naoAtribuidas.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-[12px]">
                <span className="min-w-0"><span className="font-medium">{d.descricao}</span> <span className="text-text-faint">· {dataBR(d.data_gasto)} · {fmt(d.valor)}</span></span>
                <select disabled={pending} defaultValue="" onChange={(e) => classificar(d.id, e.target.value)} className="input input-compacto w-[200px]">
                  <option value="">Escolher rubrica…</option>
                  {rubricasOpcoes.map((r) => (<option key={r.id} value={r.id}>{r.nome}</option>))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {rubAberta && celAberta && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setAbertaKey(null)}>
          <div className="mt-8 mb-8 w-full max-w-xl rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-sm font-semibold">{rubAberta.nome}</h3>
                <p className="text-[11.5px] text-text-muted">{rotuloMes(celAberta.mes)} · previsto {fmt(celAberta.previsto)}{celAberta.realizado ? ` · lançado ${fmt(celAberta.realizado)}` : ""}</p>
              </div>
              <button type="button" onClick={() => setAbertaKey(null)} className="rounded-md px-2 py-1 text-[16px] leading-none text-text-muted hover:bg-bg">✕</button>
            </div>

            {celAberta.despesas.length === 0 ? (
              <p className="py-4 text-[12.5px] text-text-muted">Nenhuma despesa classificada nessa rubrica/mês ainda. Lance a despesa no Custos vinculando ao programa, ou classifique-a na lista &ldquo;a classificar&rdquo;.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {celAberta.despesas.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border-soft p-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="font-medium">{d.descricao}</span>
                      <span className="font-mono">{fmt(d.valor)}</span>
                    </div>
                    {d.evidencias.length === 0 ? (
                      <p className="text-[11px] text-text-faint">Sem checklist de evidência (natureza sem exigência por nota).</p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {d.evidencias.map((e) => (
                          <li key={e.key} className="flex items-center justify-between gap-2 text-[11.5px]">
                            <span className={e.presente ? "text-success" : "text-text-muted"}>{e.presente ? "✓" : "○"} {e.label}</span>
                            {e.presente && e.anexoId ? (
                              <span className="flex items-center gap-2">
                                <button type="button" onClick={() => abrir(e.anexoId!)} className="text-[11px] text-primary-deep">ver</button>
                                <button type="button" disabled={pending} onClick={() => remover(e.anexoId!)} className="text-[11px] text-danger">remover</button>
                              </span>
                            ) : (
                              <label className="cursor-pointer text-[11px] font-medium text-primary-deep">
                                anexar
                                <input type="file" className="hidden" disabled={pending} onChange={(ev) => { const f = ev.target.files?.[0]; if (f) subir(d.id, e.key, f); ev.target.value = ""; }} />
                              </label>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 text-right">
                      <button type="button" disabled={pending} onClick={() => classificar(d.id, "")} className="text-[10.5px] text-text-faint underline">tirar desta rubrica</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {pending && <p className="mt-2 text-[11px] text-text-faint">salvando…</p>}
          </div>
        </div>
      )}
    </div>
  );
}
