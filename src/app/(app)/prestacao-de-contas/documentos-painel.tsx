"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { anexarEvidencia, urlAnexo } from "./planilha-actions";
import type { Documentos, PagamentoDoc, DocRef } from "@/lib/prestacao-documentos";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ym: string) => `${MES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const dataBR = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * Aba "Documentos": por rúbrica, uma linha por pagamento do mês com boleto, nota fiscal e comprovante
 * de pagamento (anexar/ver), e a atividade do cronograma vinculada com o status de entrega. É a tela
 * única de comprovação — a mesma pra onde o prestador é direcionado.
 */
export function DocumentosPainel({ documentos, podeEditar }: { documentos: Documentos; podeEditar: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function anexar(despesaId: string, tipo: string, file: File) {
    const fd = new FormData();
    fd.set("despesaId", despesaId);
    fd.set("tipo", tipo);
    fd.set("arquivo", file);
    start(async () => { await anexarEvidencia(fd); router.refresh(); });
  }
  async function ver(id: string) { const url = await urlAnexo(id); if (url) window.open(url, "_blank"); }

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

  if (documentos.rubricas.length === 0) return <p className="text-[12.5px] text-text-muted">Sem rúbricas de serviço para comprovar ainda.</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11.5px] text-text-muted">
        Por rúbrica, cada pagamento do mês e seus documentos. Clique <b>ver</b> pra abrir um anexo ou <b>anexar</b> pra subir boleto, nota fiscal ou comprovante.
        A evidência de entrega vem do cronograma. <span className="text-text-faint">Cotações no total do serviço e o lançamento direto pela célula entram na próxima etapa.</span>
      </p>

      {documentos.rubricas.map((r) => (
        <section key={r.id} className={`overflow-hidden rounded-xl border border-border bg-surface ${r.contrapartida ? "border-l-[3px] border-l-wine" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border-soft bg-bg/60 px-4 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-heading text-[13.5px] font-semibold">{r.nome}</span>
                {r.contrapartida && <span className="shrink-0 rounded-full bg-wine-soft px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-wine">contrapartida</span>}
              </div>
              {r.atividade && <div className="mt-0.5 text-[10.5px] text-text-faint">{r.atividade}</div>}
            </div>
            <div className="text-right">
              <div className="text-[9.5px] font-medium uppercase tracking-wide text-text-faint">{r.contrapartida ? "Total (contrapartida)" : "Total do serviço"}</div>
              <div className="font-mono text-[14px] font-semibold">{fmt(r.total)}</div>
            </div>
          </div>

          {r.pagamentos.length === 0 ? (
            <p className="px-4 py-3 text-[11.5px] text-text-muted">
              Nenhum pagamento lançado ainda. Lance a despesa em <a href="/custos" className="font-medium text-primary-deep underline">Custos</a>, vinculando ao programa — ela aparece aqui pra anexar os documentos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="text-left text-text-faint">
                    <th className="px-3 py-2 font-medium">Mês</th>
                    <th className="px-3 py-2 text-right font-medium">Valor pago</th>
                    <th className="px-3 py-2 font-medium">Boleto</th>
                    <th className="px-3 py-2 font-medium">Nota fiscal</th>
                    <th className="px-3 py-2 font-medium">Comprovante</th>
                    <th className="px-3 py-2 font-medium">Evidência de entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {r.pagamentos.map((p: PagamentoDoc) => (
                    <tr key={p.despesaId} className="border-t border-border-soft align-top">
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{rotuloMes(p.mes)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{fmt(p.valor)}</td>
                      <td className="px-3 py-2"><Doc despesaId={p.despesaId} tipo="boleto" anexo={p.boleto} /></td>
                      <td className="px-3 py-2"><Doc despesaId={p.despesaId} tipo="nota_fiscal" anexo={p.nf} /></td>
                      <td className="px-3 py-2"><Doc despesaId={p.despesaId} tipo="comprovante_pagamento" anexo={p.comprovante} /></td>
                      <td className="px-3 py-2">
                        {p.atividade ? (
                          <div className="flex flex-col">
                            <span className="text-[11.5px]">{p.atividade}</span>
                            <span className={`text-[10.5px] ${p.entregue ? "text-success" : "text-text-faint"}`}>{p.entregue ? `entregue${p.fimReal ? ` em ${dataBR(p.fimReal)}` : ""}` : "entrega pendente"}</span>
                          </div>
                        ) : (
                          <span className="text-[10.5px] text-text-faint">vincule a atividade no cronograma</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
