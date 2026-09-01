"use client";

import { useState, useTransition } from "react";
import { excluirComboProduto } from "./actions";

type Plano = { id: string; produto_id: string; nome_plano: string; tipo_cobranca: string; preco: number };
type ComboItem = { produto_id: string; produto_nome: string };
type Combo = { id: string; nome: string; desconto_pct: number; observacoes: string | null; itens: ComboItem[] };

const CICLOS: { chave: "mensal" | "semestral" | "anual"; label: string; divisor: number }[] = [
  { chave: "mensal", label: "Mensal", divisor: 1 },
  { chave: "semestral", label: "Semestral", divisor: 6 },
  { chave: "anual", label: "Anual", divisor: 12 },
];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ComboProdutoCard({ combo, planos }: { combo: Combo; planos: Plano[] }) {
  const [ciclo, setCiclo] = useState<"mensal" | "semestral" | "anual">("mensal");
  const [isPending, startTransition] = useTransition();

  const cicloAtual = CICLOS.find((c) => c.chave === ciclo)!;

  const planosDoCiclo = combo.itens.map((item) => ({
    ...item,
    plano: planos.find((p) => p.produto_id === item.produto_id && p.tipo_cobranca === ciclo) ?? null,
  }));

  const faltaPlano = planosDoCiclo.some((p) => !p.plano);
  const somaCiclo = planosDoCiclo.reduce((acc, p) => acc + Number(p.plano?.preco ?? 0), 0);
  const somaMensal = somaCiclo / cicloAtual.divisor;
  const descontadoMensal = (somaCiclo * (1 - combo.desconto_pct)) / cicloAtual.divisor;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="font-heading text-[13.5px] font-semibold">{combo.nome}</h3>
          {combo.observacoes && <p className="mt-0.5 text-[11px] text-text-muted">{combo.observacoes}</p>}
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => excluirComboProduto(combo.id))}
          className="text-[11px] text-danger"
        >
          Remover
        </button>
      </div>

      <div className="mb-3 flex gap-1.5 rounded-lg bg-bg p-1">
        {CICLOS.map((c) => (
          <button
            key={c.chave}
            type="button"
            onClick={() => setCiclo(c.chave)}
            className={`flex-1 rounded-md py-1.5 text-[11px] font-medium uppercase tracking-wide ${
              ciclo === c.chave ? "bg-surface shadow-sm text-primary-deep" : "text-text-muted"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {faltaPlano ? (
        <p className="text-[12px] text-text-faint">
          Algum produto do combo não tem plano <strong>{ciclo}</strong> cadastrado — cadastre em Produtos para ver o preço aqui.
        </p>
      ) : (
        <>
          <div className="text-center">
            <div className="text-[12px] text-text-faint line-through">de {formatBRL(somaMensal)}/mês</div>
            <div className="font-mono text-[26px] font-bold text-primary-deep">
              {formatBRL(descontadoMensal)}
              <span className="text-[13px] font-normal text-text-muted">/mês</span>
            </div>
          </div>
          <p className="mt-2 text-center text-[11.5px] text-text-muted">
            {planosDoCiclo.map((p, i) => (
              <span key={p.produto_id}>
                {i > 0 && " + "}
                {formatBRL(Number(p.plano!.preco) / cicloAtual.divisor)} no {p.produto_nome}
              </span>
            ))}
            , {(combo.desconto_pct * 100).toFixed(0)}% off {planosDoCiclo.length > 1 ? "em todos" : ""}
          </p>
        </>
      )}
    </div>
  );
}
