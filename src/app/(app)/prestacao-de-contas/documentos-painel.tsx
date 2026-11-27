"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { anexarEvidencia, urlAnexo } from "./planilha-actions";
import type { Dossie, PagamentoDoc, DocRef } from "@/lib/prestacao-documentos";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmt0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ym: string) => `${MES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

/**
 * Dossiê (tela própria): parte 1 — entregas por atividade (evidência verde/pendente); parte 2 —
 * documentos de pagamento por serviço (boleto, NF, comprovante). É pra cá que o prestador é direcionado.
 */
export function DossiePainel({ dossie, podeEditar }: { dossie: Dossie; podeEditar: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { corte } = dossie;

  function anexar(despesaId: string, tipo: string, file: File) {
    const fd = new FormData();
    fd.set("despesaId", despesaId); fd.set("tipo", tipo); fd.set("arquivo", file);
    start(async () => { await anexarEvidencia(fd); router.refresh(); });
  }
  async function ver(id: string) { const url = await urlAnexo(id); if (url) window.open(url, "_blank"); }
  const prest = (ym: string) => (ym >= corte.finalIniMes ? "Final" : "Parcial");

  function Doc({ despesaId, tipo, anexo }: { despesaId: string; tipo: string; anexo: DocRef }) {
    if (anexo) return <span className="inline-flex items-center gap-1"><span className="rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-bold text-success">✓</span><button type="button" onClick={() => ver(anexo.id)} className="text-[11px] font-medium text-primary-deep">ver</button></span>;
    if (!podeEditar) return <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">falta</span>;
    return (
      <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-wine-deep">
        <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">falta</span> anexar
        <input type="file" className="hidden" disabled={pending} onChange={(e) => { const f = e.target.files?.[0]; if (f) anexar(despesaId, tipo, f); e.target.value = ""; }} />
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Parte 1 — entregas por atividade */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-heading text-[15px] font-semibold">Entregas por atividade</h2>
          <p className="text-[11.5px] text-text-muted">A evidência de cada entrega (fato gerador). <span className="text-success-deep">Verde</span> = anexada, no mês real; <span className="text-wine-deep">vinho</span> = prevista, pendente. Lança-se pela atividade no cronograma.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {dossie.atividades.map((a) => (
            <section key={a.id} className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="flex items-start justify-between gap-2 border-b border-border-soft bg-bg/60 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="grid h-5 w-7 shrink-0 place-items-center rounded bg-wine-soft text-[10px] font-bold text-wine-deep">{a.codigo}</span>
                    <span className="font-heading text-[13px] font-semibold leading-tight">{a.nome}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-text-faint">{a.responsavel}</div>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 px-4 py-3">
                {a.rubricas.map((r) => (
                  <div key={r.rubricaId}>
                    <div className="mb-1 flex items-center gap-1.5 text-[11.5px]">
                      <span className="min-w-0 truncate font-medium" title={r.nome}>{r.nome}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-px text-[8px] font-bold uppercase ${r.contrapartida ? "bg-wine-soft text-wine-deep" : "bg-primary-soft text-primary-deep"}`}>{r.contrapartida ? "contrap." : "subv."}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-text-muted">{fmt0(r.valorContrato)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.entregas.map((e, i) => (
                        <span key={`${e.mesPrevisto}-${i}`} title={(e.entregue ? "Entregue" : "Pendente") + (e.evidenciaNome ? ` · ${e.evidenciaNome}` : "")}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${e.entregue ? "border-success/40 bg-success-soft text-success-deep" : "border-wine/30 bg-wine-soft/50 text-wine-deep"}`}>
                          <span className={`inline-block h-2 w-2 rotate-45 rounded-[1px] ${e.entregue ? "bg-success" : "bg-wine opacity-60"}`} />
                          {e.entregue ? rotuloMes(e.mesReal ?? e.mesPrevisto) : rotuloMes(e.mesPrevisto)}
                          {e.entregue && e.mesReal && e.mesReal !== e.mesPrevisto && <span className="text-success/70">↔</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {a.rubricas.length === 0 && <p className="text-[11px] text-text-faint">Sem rúbrica vinculada.</p>}
              </div>
            </section>
          ))}
        </div>
      </section>

      {/* Parte 2 — documentos de pagamento por serviço */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-heading text-[15px] font-semibold">Documentos de pagamento por serviço</h2>
          <p className="text-[11.5px] text-text-muted">Cada pagamento do serviço, com boleto, nota fiscal e comprovante. A cotação (3 propostas) é do contrato. <span className="text-text-faint">Lance a despesa em Custos vinculada ao programa; ela aparece aqui para anexar.</span></p>
        </div>
        {dossie.servicos.map((r) => (
          <section key={r.rubricaId} className={`overflow-hidden rounded-xl border border-border bg-surface ${r.contrapartida ? "border-l-[3px] border-l-wine" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border-soft bg-bg/60 px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="font-heading text-[13px] font-semibold">{r.nome}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase ${r.contrapartida ? "bg-wine-soft text-wine-deep" : "bg-primary-soft text-primary-deep"}`}>{r.contrapartida ? "contrapartida" : "subvenção"}</span>
              </div>
              <div className="text-right">
                <div className="text-[9.5px] font-medium uppercase tracking-wide text-text-faint">Teto do contrato</div>
                <div className="font-mono text-[13px] font-semibold">{fmt(r.valorContrato)}</div>
              </div>
            </div>
            {r.pagamentos.length === 0 ? (
              <p className="px-4 py-3 text-[11.5px] text-text-muted">Nenhum pagamento lançado. Lance em <a href="/custos" className="font-medium text-primary-deep underline">Custos</a> vinculando ao programa e à rúbrica.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12px]">
                  <thead><tr className="text-left text-text-faint">
                    <th className="px-3 py-2 font-medium">Mês</th><th className="px-3 py-2 font-medium">Prestação</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                    <th className="px-3 py-2 font-medium">Boleto</th><th className="px-3 py-2 font-medium">Nota fiscal</th><th className="px-3 py-2 font-medium">Comprovante</th>
                  </tr></thead>
                  <tbody>
                    {r.pagamentos.map((p: PagamentoDoc) => (
                      <tr key={p.despesaId} className="border-t border-border-soft align-top">
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{rotuloMes(p.mes)}</td>
                        <td className="px-3 py-2"><span className={`rounded-full px-1.5 py-px text-[9px] font-bold uppercase ${p.mes >= corte.finalIniMes ? "bg-wine-soft text-wine-deep" : "bg-primary-soft text-primary-deep"}`}>{prest(p.mes)}</span></td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{fmt(p.valor)}</td>
                        <td className="px-3 py-2"><Doc despesaId={p.despesaId} tipo="boleto" anexo={p.boleto} /></td>
                        <td className="px-3 py-2"><Doc despesaId={p.despesaId} tipo="nota_fiscal" anexo={p.nf} /></td>
                        <td className="px-3 py-2"><Doc despesaId={p.despesaId} tipo="comprovante_pagamento" anexo={p.comprovante} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </section>
    </div>
  );
}
