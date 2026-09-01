"use client";

import { useMemo, useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";

type Plano = { id: string; produto_id: string; nome_plano: string; tipo_cobranca: string; preco: number };
type Produto = { id: string; nome: string };
type Tier = { quantidade_produtos: number; desconto_pct: number };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const CICLO_LABEL: Record<string, string> = { mensal: "mês", semestral: "semestre", anual: "ano" };

export function ComboSimulador({ produtos, planos, tiers }: { produtos: Produto[]; planos: Plano[]; tiers: Tier[] }) {
  const [selecionados, setSelecionados] = useState<Record<string, string>>({});

  const planosPorProduto = useMemo(() => {
    const m = new Map<string, Plano[]>();
    for (const p of planos) {
      const atual = m.get(p.produto_id) ?? [];
      atual.push(p);
      m.set(p.produto_id, atual);
    }
    return m;
  }, [planos]);

  function toggleProduto(produtoId: string) {
    setSelecionados((prev) => {
      const next = { ...prev };
      if (next[produtoId] != null) {
        delete next[produtoId];
      } else {
        const primeiroPlano = planosPorProduto.get(produtoId)?.[0];
        next[produtoId] = primeiroPlano?.id ?? "";
      }
      return next;
    });
  }

  const produtosSelecionados = Object.keys(selecionados);
  const planosEscolhidos = produtosSelecionados
    .map((pid) => planos.find((p) => p.id === selecionados[pid]))
    .filter((p): p is Plano => Boolean(p));

  const somaPrecos = planosEscolhidos.reduce((acc, p) => acc + Number(p.preco), 0);
  const tier = tiers.find((t) => t.quantidade_produtos === produtosSelecionados.length);
  const desconto = tier ? somaPrecos * tier.desconto_pct : 0;
  const precoFinal = somaPrecos - desconto;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 flex items-center font-heading text-[13px] font-semibold">
        Simulador de combo
        <InfoTooltip texto="Selecione 2 ou mais produtos e o plano de cada um para ver o preço combinado com o desconto do pacote aplicado — útil para montar exemplos de precificação em apresentações." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">Escolha os produtos e planos para calcular o preço do combo</p>

      <div className="mb-4 flex flex-col gap-2">
        {produtos.map((produto) => {
          const ativo = selecionados[produto.id] != null;
          const planosDoProduto = planosPorProduto.get(produto.id) ?? [];
          return (
            <div
              key={produto.id}
              className={`rounded-lg border px-3 py-2.5 ${ativo ? "border-primary-fill bg-primary-soft/40" : "border-border-soft"}`}
            >
              <label className="flex items-center gap-2 text-[12.5px] font-semibold">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={() => toggleProduto(produto.id)}
                  disabled={planosDoProduto.length === 0}
                  className="h-4 w-4 rounded border-border"
                />
                {produto.nome}
                {planosDoProduto.length === 0 && <span className="text-[10.5px] font-normal text-text-faint">(sem plano cadastrado)</span>}
              </label>
              {ativo && planosDoProduto.length > 0 && (
                <select
                  value={selecionados[produto.id]}
                  onChange={(e) => setSelecionados((prev) => ({ ...prev, [produto.id]: e.target.value }))}
                  className="input mt-2 w-full"
                >
                  {planosDoProduto.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome_plano} · {p.tipo_cobranca} · {formatBRL(Number(p.preco))}/{CICLO_LABEL[p.tipo_cobranca] ?? p.tipo_cobranca}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {produtosSelecionados.length >= 2 ? (
        <div className="rounded-lg bg-bg px-4 py-3.5">
          <div className="flex items-center justify-between text-[12px] text-text-muted">
            <span>Soma dos preços ({produtosSelecionados.length} produtos)</span>
            <span className="font-mono">{formatBRL(somaPrecos)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[12px] text-text-muted">
            <span>
              {tier ? `Desconto do pacote (${(tier.desconto_pct * 100).toFixed(0)}%)` : "Sem pacote de desconto para essa quantidade"}
            </span>
            <span className="font-mono text-danger">{tier ? `- ${formatBRL(desconto)}` : "—"}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border-soft pt-2">
            <span className="text-[13px] font-semibold">Preço do combo</span>
            <span className="font-mono text-[16px] font-bold text-primary-deep">{formatBRL(precoFinal)}</span>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-text-faint">Selecione pelo menos 2 produtos para ver o preço do combo.</p>
      )}
    </div>
  );
}
