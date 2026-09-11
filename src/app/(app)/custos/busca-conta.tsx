"use client";

import { useMemo, useState } from "react";
import { categoriaDeConta, labelCategoriaNegocio, CATEGORIAS_LANCAMENTO } from "@/lib/categoria-negocio";

type PlanoContas = { id: string; codigo: string; conta: string; tipo: string };

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Busca por texto livre em vez dos dois selects (categoria → conta) — o usuário digita o que
 * acha que é o gasto ("evento", "software", "contador") e o sistema acha as contas que batem,
 * mostrando a categoria de negócio de cada uma pra dar contexto. */
export function BuscaConta({
  planoContas,
  usoPorConta,
  name = "plano_contas_id",
}: {
  planoContas: PlanoContas[];
  usoPorConta: Record<string, number>;
  name?: string;
}) {
  const [selecionada, setSelecionada] = useState<{ id: string; conta: string } | null>(null);
  const [termo, setTermo] = useState("");

  const resultados = useMemo(() => {
    const q = normalizar(termo.trim());
    if (!q) return [];
    return planoContas
      .map((c) => ({ conta: c, categoria: categoriaDeConta(c) }))
      .filter((r): r is { conta: PlanoContas; categoria: NonNullable<typeof r.categoria> } => !!r.categoria && CATEGORIAS_LANCAMENTO.includes(r.categoria))
      .filter(({ conta, categoria }) => normalizar(conta.conta).includes(q) || normalizar(labelCategoriaNegocio(categoria)).includes(q))
      .sort((a, b) => (usoPorConta[b.conta.id] ?? 0) - (usoPorConta[a.conta.id] ?? 0))
      .slice(0, 10);
  }, [termo, planoContas, usoPorConta]);

  if (selecionada) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary-fill bg-primary-soft px-3 py-2.5 text-[12.5px] text-primary-deep">
        <input type="hidden" name={name} value={selecionada.id} />
        <span className="flex-1">{selecionada.conta}</span>
        <button
          type="button"
          onClick={() => {
            setSelecionada(null);
            setTermo("");
          }}
          className="shrink-0 text-[11px] font-medium underline"
        >
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        type="text"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Digite o que foi o gasto: evento, software, contador, viagem…"
        className="input"
        autoComplete="off"
      />
      {termo.trim() && (
        <div className="mt-1.5 max-h-[220px] overflow-y-auto rounded-lg border border-border bg-surface shadow-sm">
          {resultados.length === 0 ? (
            <p className="px-3 py-2.5 text-[12px] text-text-muted">Nenhuma conta encontrada — tente outra palavra.</p>
          ) : (
            resultados.map(({ conta, categoria }) => (
              <button
                key={conta.id}
                type="button"
                onClick={() => {
                  setSelecionada({ id: conta.id, conta: conta.conta });
                  setTermo("");
                }}
                className="flex w-full items-center justify-between gap-2 border-b border-border-soft px-3 py-2 text-left text-[12.5px] last:border-0 hover:bg-primary-soft/40"
              >
                <span>{conta.conta}</span>
                <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[10px] text-text-faint">{labelCategoriaNegocio(categoria)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
