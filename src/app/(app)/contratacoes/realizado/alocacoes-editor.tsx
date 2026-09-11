"use client";

import { useState } from "react";
import { LABEL_CATEGORIA_ALOCACAO, type CategoriaAlocacao } from "@/lib/custo-equipe";

type Produto = { id: string; nome: string };

export type AlocacaoEdit = { categoria: CategoriaAlocacao; produtoId: string | null; horasPorDia: number };

const CATEGORIAS: CategoriaAlocacao[] = ["pd", "sm", "ga", "cogs_suporte"];

function linhaVazia(): AlocacaoEdit {
  return { categoria: "ga", produtoId: null, horasPorDia: 8 };
}

/** Alocação de dedicação — categoria (P&D/Vendas/Adm/Suporte), produto (quando fizer sentido) e
 * horas por dia. Serve pra ratear o custo entre categorias/produtos tanto de CLT quanto de PJ. */
export function AlocacoesEditor({
  name,
  produtos,
  defaultValue,
}: {
  name: string;
  produtos: Produto[];
  defaultValue?: AlocacaoEdit[];
}) {
  const [linhas, setLinhas] = useState<AlocacaoEdit[]>(defaultValue && defaultValue.length > 0 ? defaultValue : [linhaVazia()]);

  function atualizar(idx: number, patch: Partial<AlocacaoEdit>) {
    setLinhas((atual) => atual.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function adicionar() {
    setLinhas((atual) => [...atual, linhaVazia()]);
  }
  function remover(idx: number) {
    setLinhas((atual) => atual.filter((_, i) => i !== idx));
  }

  const totalHoras = linhas.reduce((s, l) => s + (Number(l.horasPorDia) || 0), 0);

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(linhas)} />
      <div className="flex flex-col gap-2">
        {linhas.map((linha, idx) => (
          <div key={idx} className="flex items-center gap-2 rounded-lg border border-border-soft bg-bg p-2">
            <select
              value={linha.categoria}
              onChange={(e) => atualizar(idx, { categoria: e.target.value as CategoriaAlocacao })}
              className="input flex-1"
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {LABEL_CATEGORIA_ALOCACAO[c]}
                </option>
              ))}
            </select>
            <select
              value={linha.produtoId ?? ""}
              onChange={(e) => atualizar(idx, { produtoId: e.target.value || null })}
              className="input w-[160px]"
            >
              <option value="">Geral / empresa</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <div className="w-[90px]">
              <input
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={linha.horasPorDia}
                onChange={(e) => atualizar(idx, { horasPorDia: Number(e.target.value) })}
                className="input w-full"
                placeholder="h/dia"
              />
            </div>
            {linhas.length > 1 && (
              <button type="button" onClick={() => remover(idx)} className="text-[12px] text-danger">
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={adicionar} className="text-[12px] font-medium text-primary-deep">
          + Adicionar alocação
        </button>
        <span className={`text-[11px] ${totalHoras > 8 ? "text-danger" : "text-text-faint"}`}>
          {totalHoras.toLocaleString("pt-BR")}h/dia no total{totalHoras > 8 ? " — passou de um dia útil" : ""}
        </span>
      </div>
    </div>
  );
}
