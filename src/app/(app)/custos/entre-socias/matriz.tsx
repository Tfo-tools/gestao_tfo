"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarPago, alternarVarios, type MatrizEntreSocias } from "../entre-socias-actions";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const fmtData = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
  function marcarMes(devedora: string, mes: string) {
    const itens = linhas
      .filter((l) => l.devedora === devedora)
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

  return (
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
            <tr key={l.chave} className="border-b border-border-soft">
              <td className="sticky left-0 z-10 bg-surface px-3 py-2">
                <div className="font-medium">{l.descricao}</div>
                <div className="text-[10.5px] text-text-faint">{fmtData(l.dataGasto)} · pagou {cap(l.pagador)}</div>
              </td>
              {meses.map((m) => {
                const c = l.porMes[m];
                if (!c) return <td key={m} className="px-3 py-2 text-right text-text-faint">·</td>;
                return (
                  <td key={m} className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggle(c.despesaId, c.numeroParcela, !c.pago)}
                      className={c.pago ? "whitespace-nowrap text-success line-through decoration-success/50" : "whitespace-nowrap font-medium text-primary-deep underline decoration-dotted underline-offset-2"}
                      title={c.pago ? "Pago — clique pra desmarcar" : "Clique pra confirmar o depósito"}
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
                if (!v) return <td key={m} className="px-3 py-2 text-right text-text-faint">—</td>;
                return (
                  <td key={m} className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => marcarMes(s.devedora, m)}
                      className="whitespace-nowrap font-semibold text-wine-deep underline decoration-dotted underline-offset-2"
                      title="Confirmar todos os depósitos desse mês de uma vez"
                    >
                      {fmt(v)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}
