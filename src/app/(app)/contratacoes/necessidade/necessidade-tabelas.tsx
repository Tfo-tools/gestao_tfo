"use client";

import { useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import { HORAS_MES_PADRAO, type MesNecessidadeCargo } from "@/lib/necessidade-contratacao";

function formatMes(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

export function NecessidadeTabelas({ dados }: { dados: { cargo: string; linhas: MesNecessidadeCargo[] }[] }) {
  const [ativo, setAtivo] = useState(dados[0]?.cargo ?? "");
  const atual = dados.find((d) => d.cargo === ativo) ?? dados[0];

  // Só mostra a partir do primeiro mês com demanda, até o último mês com demanda ou gap.
  const linhasRelevantes = atual
    ? (() => {
        const primeiro = atual.linhas.findIndex((l) => l.horas_demandadas > 0);
        if (primeiro === -1) return [];
        let ultimo = atual.linhas.length - 1;
        while (ultimo > primeiro && atual.linhas[ultimo].horas_demandadas === 0 && atual.linhas[ultimo].gap <= 0) ultimo--;
        return atual.linhas.slice(primeiro, ultimo + 1);
      })()
    : [];

  const proximoAlerta = linhasRelevantes.find((l) => l.gap > 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        {dados.map((d) => {
          const temAlerta = d.linhas.some((l) => l.gap > 0);
          return (
            <button
              key={d.cargo}
              type="button"
              onClick={() => setAtivo(d.cargo)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-medium capitalize ${
                ativo === d.cargo ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border text-text-muted"
              }`}
            >
              {d.cargo}
              {temAlerta && <span className="ml-1.5 text-danger">●</span>}
            </button>
          );
        })}
      </div>

      {atual && (
        <>
          <div className="mb-4 flex items-center gap-4 text-[11px] text-text-muted">
            <span className="flex items-center">
              Capacidade por pessoa: {HORAS_MES_PADRAO.toFixed(0)}h/mês
              <InfoTooltip texto="Baseado em 44 horas semanais (carga máxima CLT no Brasil), convertidas em média mensal (44 × 52 semanas ÷ 12 meses)." />
            </span>
            {proximoAlerta && (
              <span className="flex items-center gap-1 rounded bg-danger-soft px-2 py-1 font-medium text-danger">
                Faltam {proximoAlerta.gap} pessoa(s) a partir de {formatMes(proximoAlerta.mes_referencia)}
              </span>
            )}
          </div>

          {linhasRelevantes.length === 0 ? (
            <p className="text-[12px] text-text-faint">Sem horas alocadas para este cargo em nenhum produto.</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-left text-text-muted">
                    <td className="px-2 py-1.5 font-medium">Mês</td>
                    <td className="px-2 py-1.5 text-right font-medium">Horas demandadas</td>
                    <td className="px-2 py-1.5 text-right font-medium">Pessoas necessárias</td>
                    <td className="px-2 py-1.5 text-right font-medium">Contratadas</td>
                    <td className="px-2 py-1.5 text-right font-medium">Situação</td>
                  </tr>
                </thead>
                <tbody>
                  {linhasRelevantes.map((l) => (
                    <tr key={l.mes_referencia} className="border-t border-border-soft">
                      <td className="px-2 py-1.5 capitalize">{formatMes(l.mes_referencia)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{l.horas_demandadas.toFixed(0)}h</td>
                      <td className="px-2 py-1.5 text-right font-mono">{l.pessoas_necessarias}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{l.pessoas_contratadas}</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${l.gap > 0 ? "text-danger" : "text-success"}`}>
                        {l.gap > 0 ? `contratar +${l.gap}` : "ok"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
