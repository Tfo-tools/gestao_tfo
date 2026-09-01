"use client";

import { useTransition } from "react";
import { excluirCustoEmpresa } from "./actions";
import type { ParametrosCustoEmpresa, TipoCustoEmpresa } from "@/lib/custos-empresa";

type Custo = {
  id: string;
  item: string;
  tipo_custo: string;
  valor_mensal: number | null;
  data_inicio: string | null;
  data_fim: string | null;
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

function resumo(tipo: TipoCustoEmpresa, valorMensal: number | null, p: ParametrosCustoEmpresa): string {
  switch (tipo) {
    case "fixo":
      return `${formatBRL(valorMensal ?? 0)}/mês`;
    case "escalonado":
      return `${(p.faixas ?? []).length} faixa(s) por ${p.baseado_em === "clientes" ? "clientes ativos" : "faturamento"}`;
    case "cronograma":
      return `${(p.valores_mensais ?? []).length} meses, a partir de ${p.mes_inicio ? new Date(p.mes_inicio + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "?"} · total ${formatBRL((p.valores_mensais ?? []).reduce((a, b) => a + b, 0))}`;
    case "variavel_receita":
      return `${((p.percentual ?? 0) * 100).toFixed(2)}% da receita`;
    case "variavel_cliente":
      return `${formatBRL(p.valor_por_cliente ?? 0)} por cliente ativo/mês`;
  }
}

export function CustosEmpresaLista({ custos }: { custos: Custo[] }) {
  const [isPending, startTransition] = useTransition();

  if (custos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
        <p className="text-sm text-text-muted">Nenhum custo de empresa cadastrado ainda.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {custos.map((c) => (
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
              <div className="mt-0.5 text-[10.5px] text-text-faint">{resumo(c.tipo_custo as TipoCustoEmpresa, c.valor_mensal, c.parametros)}</div>
              {c.observacoes && <div className="mt-0.5 text-[10.5px] text-text-faint">{c.observacoes}</div>}
            </div>
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
      ))}
    </div>
  );
}
