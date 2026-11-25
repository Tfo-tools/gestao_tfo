"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { anexarEvidencia, removerEvidencia, urlAnexo, atribuirRubrica } from "./planilha-actions";
import type { DespesaCel } from "@/lib/prestacao";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Dossiê de uma célula (rúbrica × mês): as despesas daquele mês e, por despesa, o checklist de
 * evidências (cotações, NF, comprovante…) para ver/anexar/remover. Se não houver despesa no mês, é
 * um pagamento ainda não executado — orienta a lançar. Leitura pura quando podeEditar é falso.
 */
export function DossieCelula({
  titulo,
  subtitulo,
  despesas,
  podeEditar,
  onClose,
}: {
  titulo: string;
  subtitulo: string;
  despesas: DespesaCel[];
  podeEditar: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const refresh = () => router.refresh();

  function subir(despesaId: string, tipo: string, file: File) {
    const fd = new FormData();
    fd.set("despesaId", despesaId);
    fd.set("tipo", tipo);
    fd.set("arquivo", file);
    start(async () => { await anexarEvidencia(fd); refresh(); });
  }
  function remover(anexoId: string) { start(async () => { await removerEvidencia(anexoId); refresh(); }); }
  async function ver(anexoId: string) { const url = await urlAnexo(anexoId); if (url) window.open(url, "_blank"); }
  function desclassificar(despesaId: string) { start(async () => { await atribuirRubrica(despesaId, null); refresh(); }); }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="mt-8 mb-8 w-full max-w-xl rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-sm font-semibold">{titulo}</h3>
            <p className="text-[11.5px] text-text-muted">{subtitulo}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[16px] leading-none text-text-muted hover:bg-bg">✕</button>
        </div>

        {despesas.length === 0 ? (
          <p className="py-4 text-[12.5px] text-text-muted">
            Nenhum pagamento lançado nesse mês ainda. Lance a despesa no Custos vinculando ao programa (ou classifique-a na lista
            &ldquo;a classificar&rdquo;) pra anexar aqui as cotações, a nota fiscal e o comprovante.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {despesas.map((d) => (
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
                            <button type="button" onClick={() => ver(e.anexoId!)} className="text-[11px] text-primary-deep">ver</button>
                            {podeEditar && <button type="button" disabled={pending} onClick={() => remover(e.anexoId!)} className="text-[11px] text-danger">remover</button>}
                          </span>
                        ) : podeEditar ? (
                          <label className="cursor-pointer text-[11px] font-medium text-primary-deep">
                            anexar
                            <input type="file" className="hidden" disabled={pending} onChange={(ev) => { const f = ev.target.files?.[0]; if (f) subir(d.id, e.key, f); ev.target.value = ""; }} />
                          </label>
                        ) : (
                          <span className="text-[11px] text-text-faint">pendente</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {podeEditar && (
                  <div className="mt-2 text-right">
                    <button type="button" disabled={pending} onClick={() => desclassificar(d.id)} className="text-[10.5px] text-text-faint underline">tirar desta rubrica</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {pending && <p className="mt-2 text-[11px] text-text-faint">salvando…</p>}
      </div>
    </div>
  );
}
