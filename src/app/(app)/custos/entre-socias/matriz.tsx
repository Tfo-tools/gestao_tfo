"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarPago, alternarVarios, type MatrizEntreSocias } from "../entre-socias-actions";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const rotuloMesLongo = (ym: string) => `${MESES_LONGO[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;
const fmtData = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const r2 = (v: number) => Math.round(v * 100) / 100;

export function Matriz({ matriz }: { matriz: MatrizEntreSocias }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { meses, linhas, subtotais } = matriz;

  function toggle(despesaId: string, numeroParcela: number, pago: boolean) {
    start(async () => {
      await alternarPago(despesaId, numeroParcela, pago);
      router.refresh();
    });
  }
  function confirmarMes(mes: string) {
    const itens = linhas
      .map((l) => l.porMes[mes])
      .filter((c): c is NonNullable<typeof c> => !!c && !c.pago)
      .map((c) => ({ despesaId: c.despesaId, numeroParcela: c.numeroParcela }));
    if (itens.length === 0) return;
    start(async () => {
      await alternarVarios(itens, true);
      router.refresh();
    });
  }

  if (linhas.length === 0) {
    return <p className="rounded-xl border border-border bg-surface p-5 text-[13px] text-text-muted">Nenhuma despesa dividida ainda. Divida uma despesa (botão “Dividir” no lançamento) pra ela aparecer aqui.</p>;
  }

  const nomes = subtotais.map((s) => s.devedora);
  const grossMes = (dev: string, m: string) => subtotais.find((s) => s.devedora === dev)?.porMes[m] ?? 0;

  // Líquido por mês: compensa as duas direções; sobra um depósito só.
  const tarjas = meses
    .map((m) => {
      const itensMes = linhas
        .map((l) => l.porMes[m])
        .filter((c): c is NonNullable<typeof c> => !!c && !c.pago)
        .map((c) => ({ despesaId: c.despesaId, numeroParcela: c.numeroParcela }));
      let net = 0;
      if (nomes.length === 2) net = r2(grossMes(nomes[0], m) - grossMes(nomes[1], m));
      const depositante = net > 0 ? nomes[0] : net < 0 ? nomes[1] : null;
      const credora = net > 0 ? nomes[1] : nomes[0];
      return { mes: m, valor: Math.abs(net), depositante, credora, itensMes };
    })
    .filter((t) => t.itensMes.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="sticky left-0 z-10 bg-surface px-3 py-2.5 text-left font-medium">Despesa</th>
              {meses.map((m) => (
                <th key={m} className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{rotuloMes(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className="border-b border-border-soft align-top">
                <td className="sticky left-0 z-10 bg-surface px-3 py-2">
                  <div className="font-medium">{l.descricao}</div>
                  <div className="text-[10.5px] text-text-faint">{fmtData(l.dataGasto)} · pagou {cap(l.pagador)}</div>
                </td>
                {meses.map((m) => {
                  const c = l.porMes[m];
                  if (!c) return <td key={m} className="px-3 py-2 text-right text-text-faint">·</td>;
                  const temCheio = r2(c.cheio) !== r2(c.valor);
                  return (
                    <td key={m} className="px-3 py-2 text-right">
                      {temCheio && <div className="text-[10px] text-text-faint">{fmt(c.cheio)}</div>}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggle(c.despesaId, c.numeroParcela, !c.pago)}
                        className={c.pago ? "whitespace-nowrap text-success line-through decoration-success/50" : "whitespace-nowrap font-medium text-primary-deep underline decoration-dotted underline-offset-2"}
                        title={c.pago ? "Pago — clique pra desmarcar" : `Confirmar depósito (parte de ${cap(l.devedora)})`}
                      >
                        {fmt(c.valor)}{c.pago ? " ✓" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {subtotais.map((s) => (
              <tr key={s.devedora} className="border-t-2 border-border bg-bg">
                <td className="sticky left-0 z-10 bg-bg px-3 py-2.5 font-semibold">{cap(s.devedora)} deposita</td>
                {meses.map((m) => {
                  const v = s.porMes[m];
                  return (
                    <td key={m} className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
                      {v ? fmt(v) : <span className="font-normal text-text-faint">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>

      {/* Líquido por mês (compensado): o depósito que realmente sai. Confirma o mês inteiro de uma vez. */}
      {tarjas.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-faint">Depósito do mês (já compensado)</div>
          {tarjas.map((t) => (
            <div key={t.mes} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-wine/25 bg-wine-soft/30 px-4 py-2.5">
              <div className="text-[12.5px]">
                <span className="font-semibold">{cap(rotuloMesLongo(t.mes))}:</span>{" "}
                {t.depositante ? (
                  <>
                    {cap(t.depositante)} deposita <span className="font-mono font-semibold">{fmt(t.valor)}</span> para {cap(t.credora)}
                  </>
                ) : (
                  "as partes se compensam — ninguém deposita"
                )}
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => confirmarMes(t.mes)}
                className="shrink-0 rounded-lg bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60"
              >
                Confirmar pago
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
