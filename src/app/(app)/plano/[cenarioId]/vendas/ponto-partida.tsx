"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PontoPartida } from "@/lib/ponto-partida";
import { recarregarPontoPartida, salvarPontoPartida } from "./actions";

function formatMesAno(iso: string) {
  return new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/**
 * Clientes com que o cenário abre no primeiro mês do período — herdados do cenário de origem e
 * editáveis. Salvar recalcula a projeção de todos os produtos a partir desse saldo.
 */
export function PontoPartidaCard({
  cenarioId,
  ponto,
  produtos,
}: {
  cenarioId: string;
  ponto: PontoPartida;
  produtos: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(ponto.produtos).map(([pid, p]) => [pid, String(p.clientes)])),
  );

  const linhas = produtos.filter((p) => ponto.produtos[p.id]);
  const editado = linhas.some((p) => ponto.produtos[p.id].clientes !== ponto.produtos[p.id].clientes_origem);

  function executar(acao: () => Promise<{ error: string | null }>, sucesso: string) {
    setMensagem(null);
    startTransition(async () => {
      const r = await acao();
      setMensagem(r.error ? { tipo: "erro", texto: r.error } : { tipo: "ok", texto: sucesso });
      router.refresh();
    });
  }

  return (
    <details className="group rounded-xl border border-border bg-surface" open={editado}>
      <summary className="flex cursor-pointer items-center gap-2 px-5 py-3.5 text-[13px] font-semibold">
        <span className="text-[10px] text-text-faint transition-transform group-open:rotate-90">▶</span>
        Ponto de partida
        <span className="ml-2 text-[11px] font-normal text-text-muted">
          abre em {formatMesAno(ponto.mes)} com os clientes de &quot;{ponto.origem_nome}&quot;{editado ? " · editado" : ""}
        </span>
      </summary>
      <div className="border-t border-border-soft p-5">
        <p className="mb-3 max-w-3xl text-[11.5px] text-text-muted">
          O cenário é calculado e apresentado a partir de {formatMesAno(ponto.mes)}. No primeiro mês ele parte da base de clientes
          que &quot;{ponto.origem_nome}&quot; tinha acumulado até ali — daí em diante valem as premissas deste cenário. Ajuste
          abaixo se quiser partir de outro número; a projeção é recalculada ao salvar.
        </p>
        <table className="mb-3 border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="px-2 py-1.5 font-medium">Produto</th>
              <th className="px-2 py-1.5 text-right font-medium">No cenário de origem</th>
              <th className="px-2 py-1.5 text-right font-medium">MRR de origem</th>
              <th className="px-2 py-1.5 text-right font-medium">Clientes de abertura</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((p) => {
              const ref = ponto.produtos[p.id];
              return (
                <tr key={p.id} className="border-t border-border-soft">
                  <td className="px-2 py-1.5">{p.nome}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-text-muted">{ref.clientes_origem.toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-text-muted">{formatBRL(ref.mrr_origem)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={valores[p.id] ?? ""}
                      onChange={(e) => setValores((v) => ({ ...v, [p.id]: e.target.value }))}
                      className="input w-24 text-right"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              executar(
                () => salvarPontoPartida(cenarioId, Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, Number(v)]))),
                "Ponto de partida salvo e projeção recalculada.",
              )
            }
            className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
          >
            {isPending ? "Recalculando…" : "Salvar e recalcular"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!confirm(`Buscar de novo os clientes de "${ponto.origem_nome}"? As edições acima serão descartadas.`)) return;
              executar(() => recarregarPontoPartida(cenarioId), `Ponto de partida atualizado a partir de "${ponto.origem_nome}".`);
            }}
            className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-medium text-primary-deep disabled:opacity-60"
          >
            Buscar de novo em &quot;{ponto.origem_nome}&quot;
          </button>
          {mensagem && (
            <span className={`text-[11.5px] ${mensagem.tipo === "ok" ? "text-success" : "text-danger"}`}>{mensagem.texto}</span>
          )}
        </div>
      </div>
    </details>
  );
}
