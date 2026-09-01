"use client";

import { useState, useTransition } from "react";
import { excluirCustoEmpresa } from "./actions";
import { CustoEmpresaForm } from "./custo-empresa-form";
import type { ParametrosCustoEmpresa, TipoCustoEmpresa } from "@/lib/custos-empresa";

type PlanoContas = { id: string; codigo: string; conta: string };
type Produto = { id: string; nome: string };

type Custo = {
  id: string;
  item: string;
  tipo_custo: string;
  valor_mensal: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  plano_contas_id: string | null;
  parametros: ParametrosCustoEmpresa;
  observacoes: string | null;
  plano_contas: { codigo: string; conta: string } | null;
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TIPO_LABEL: Record<string, string> = {
  fixo: "Fixo",
  escalonado: "Escalonado por faixa",
  cronograma: "Cronograma mensal",
  variavel_receita: "% da receita",
  variavel_cliente: "Por cliente ativo",
};

function resumo(tipo: TipoCustoEmpresa, valorMensal: number | null, p: ParametrosCustoEmpresa, produtos: Produto[]): string {
  switch (tipo) {
    case "fixo":
      return `${formatBRL(valorMensal ?? 0)}/mês`;
    case "escalonado":
      if (p.baseado_em === "fase") {
        const nomeProduto = produtos.find((prod) => prod.id === p.produto_referencia_id)?.nome ?? "produto não encontrado";
        const faixas = p.faixasPorFase ?? [];
        const min = faixas.length > 0 ? Math.min(...faixas.map((f) => f.valor)) : 0;
        const max = faixas.length > 0 ? Math.max(...faixas.map((f) => f.valor)) : 0;
        return `${faixas.length} fase(s) · ${formatBRL(min)} a ${formatBRL(max)} · referência: ${nomeProduto}`;
      }
      return `${(p.faixas ?? []).length} faixa(s) por ${p.baseado_em === "clientes" ? "clientes ativos" : "faturamento"}`;
    case "cronograma":
      return `${(p.valores_mensais ?? []).length} meses, a partir de ${p.mes_inicio ? new Date(p.mes_inicio + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "?"} · total ${formatBRL((p.valores_mensais ?? []).reduce((a, b) => a + b, 0))}`;
    case "variavel_receita":
      return `${((p.percentual ?? 0) * 100).toFixed(2)}% da receita`;
    case "variavel_cliente":
      return `${formatBRL(p.valor_por_cliente ?? 0)} por cliente ativo/mês`;
  }
}

export function CustosEmpresaLista({
  custos,
  planoContas,
  produtos,
}: {
  custos: Custo[];
  planoContas: PlanoContas[];
  produtos: Produto[];
}) {
  const [isPending, startTransition] = useTransition();
  const [editandoId, setEditandoId] = useState<string | null>(null);

  if (custos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
        <p className="text-sm text-text-muted">Nenhum custo de empresa cadastrado ainda.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {custos.map((c) =>
        editandoId === c.id ? (
          <CustoEmpresaForm
            key={c.id}
            cenarioId=""
            planoContas={planoContas}
            produtos={produtos}
            custoExistente={{
              id: c.id,
              item: c.item,
              plano_contas_id: c.plano_contas_id,
              tipo_custo: c.tipo_custo as TipoCustoEmpresa,
              valor_mensal: c.valor_mensal,
              data_inicio: c.data_inicio,
              data_fim: c.data_fim,
              parametros: c.parametros,
              observacoes: c.observacoes,
            }}
            onSaved={() => setEditandoId(null)}
            onCancelar={() => setEditandoId(null)}
          />
        ) : (
          <div key={c.id} className="rounded-lg border border-border-soft bg-surface px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-semibold">{c.item}</span>
                  <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-primary-deep">
                    {TIPO_LABEL[c.tipo_custo] ?? c.tipo_custo}
                  </span>
                  {c.plano_contas && <span className="text-[9.5px] text-text-faint">{c.plano_contas.codigo} {c.plano_contas.conta}</span>}
                </div>
                <div className="mt-0.5 text-[10.5px] text-text-faint">
                  {resumo(c.tipo_custo as TipoCustoEmpresa, c.valor_mensal, c.parametros, produtos)}
                </div>
                {c.observacoes && <div className="mt-0.5 text-[10.5px] text-text-faint">{c.observacoes}</div>}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setEditandoId(c.id)} className="text-[11px] text-primary-deep">
                  Editar
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => excluirCustoEmpresa(c.id))}
                  className="text-[11px] text-danger"
                >
                  Remover
                </button>
              </div>
            </div>
          </div>
        ),
      )}
    </div>
  );
}
