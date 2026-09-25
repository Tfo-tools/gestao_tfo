"use client";

import { useActionState } from "react";
import { aplicarSimulacoes, type ResultadoSimulacao } from "./actions";

type Linha = { nome: string; indice: number; churnPct: number | null; vendedor: "manter" | "degraus" | "pj"; marcado: boolean };

export function SimulacoesForm({ linhas }: { linhas: Linha[] }) {
  const [resultado, acao, pendente] = useActionState<ResultadoSimulacao, FormData>(aplicarSimulacoes, null);

  return (
    <form action={acao} className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-[12.5px]">
          <thead className="bg-surface-muted text-left text-[11px] uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-3 py-2">Cenário</th>
              <th className="px-3 py-2">Índice × clientes do FUNSES 1</th>
              <th className="px-3 py-2">Churn médio do período (% ao mês)</th>
              <th className="px-3 py-2">Vendedor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.nome} className="border-t border-border">
                <td className="px-3 py-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="cenario" value={l.nome} defaultChecked={l.marcado} />
                    <span className="font-medium">{l.nome}</span>
                  </label>
                </td>
                <td className="px-3 py-2">
                  <input
                    name={`indice:${l.nome}`}
                    defaultValue={String(l.indice).replace(".", ",")}
                    inputMode="decimal"
                    className="w-20 rounded border border-border px-2 py-1 tabular-nums"
                  />
                  <span className="ml-2 text-text-muted">0,7 = 30% abaixo · 0,5 = metade · 1,3 = 30% acima</span>
                </td>
                <td className="px-3 py-2">
                  <input
                    name={`churn:${l.nome}`}
                    defaultValue={l.churnPct != null ? String(l.churnPct).replace(".", ",") : ""}
                    placeholder="= FUNSES 1"
                    inputMode="decimal"
                    className="w-24 rounded border border-border px-2 py-1 tabular-nums"
                  />
                  <span className="ml-2 text-text-muted">FUNSES 1 ≈ 2,1 · vazio = igual</span>
                </td>
                <td className="px-3 py-2">
                  <select name={`vendedor:${l.nome}`} defaultValue={l.vendedor} className="rounded border border-border px-2 py-1">
                    <option value="pj">100% PJ proporcional à demanda</option>
                    <option value="degraus">PJ até 1,4 → CLT em degraus</option>
                    <option value="manter">Como está no cenário</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="rounded-lg bg-primary px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
        >
          {pendente ? "Aplicando… (pode levar 1–2 min)" : "Aplicar simulações"}
        </button>
        <span className="text-[11.5px] text-text-muted">
          Reescreve plano de receita, projeção e alocação de vendedor dos cenários marcados. O FUNSES 1 não muda.
        </span>
      </div>

      {resultado && !resultado.ok && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{resultado.erro}</p>
      )}
      {resultado && resultado.ok && (
        <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-surface-muted p-3 text-[11.5px] leading-relaxed whitespace-pre-wrap">
          {resultado.log.join("\n")}
        </pre>
      )}
    </form>
  );
}
