"use client";

import { useState, useTransition } from "react";
import { aplicarModeloMercado, excluirModeloMercado } from "./actions";
import type { ParametrosCustoEmpresa } from "@/lib/custos-empresa";

export type ModeloMercado = {
  id: string;
  nome: string;
  tipo_custo: string;
  valor_mensal: number | null;
  parametros: ParametrosCustoEmpresa;
  fonte: string | null;
  observacoes: string | null;
  plano_contas: { codigo: string; conta: string } | null;
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function resumoFaixas(m: ModeloMercado): string {
  const p = m.parametros;
  if (m.tipo_custo === "fixo") return `${brl(m.valor_mensal ?? 0)}/mês`;
  if (m.tipo_custo === "escalonado" && p.faixas?.length) {
    const base = p.baseado_em === "clientes" ? "clientes" : "receita/mês";
    return p.faixas
      .map(
        (f) =>
          `${f.maximo == null ? `> ${brl(f.minimo)}` : `até ${brl(f.maximo)}`} → ${brl(f.valor)}`,
      )
      .join(" · ")
      .concat(` (por ${base})`);
  }
  if (m.tipo_custo === "variavel_receita")
    return `${((p.percentual ?? 0) * 100).toFixed(2)}% da receita`;
  if (m.tipo_custo === "variavel_cliente")
    return `${brl(p.valor_por_cliente ?? 0)} por cliente/mês`;
  return m.tipo_custo;
}

/**
 * Preços padrão de mercado, fora dos cenários. "Aplicar" copia o modelo pro cenário atual como um
 * custo comum — é lá que se ajusta quando a cotação real vier diferente. O modelo não muda.
 */
export function ModelosMercado({
  modelos,
  cenarioId,
}: {
  modelos: ModeloMercado[];
  cenarioId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [inicio, setInicio] = useState<Record<string, string>>({});

  return (
    <details className="group rounded-xl border border-border bg-surface">
      <summary className="flex cursor-pointer items-center gap-2 px-5 py-3.5 font-heading text-[13px] font-semibold">
        <span className="text-[10px] text-text-faint transition-transform group-open:rotate-90">
          ▶
        </span>
        Modelos de custo de mercado
        <span className="ml-2 text-[11px] font-normal text-text-muted">
          {modelos.length} modelo{modelos.length === 1 ? "" : "s"} · preço
          pesquisado, aplicado ao cenário e editável lá
        </span>
      </summary>
      <div className="border-t border-border-soft p-5">
        <p className="mb-3 text-[11px] text-text-muted">
          Ponto de partida quando ainda não há cotação. Ao aplicar, o custo
          entra no cenário selecionado e pode ser editado sem alterar o modelo.
          Para atualizar um modelo, edite o custo no cenário e use &quot;Salvar
          como modelo&quot;.
        </p>
        {modelos.length === 0 && (
          <p className="text-[12px] text-text-faint">
            Nenhum modelo cadastrado ainda.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {modelos.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-border-soft px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-semibold">
                      {m.nome}
                    </span>
                    {m.plano_contas && (
                      <span className="text-[9.5px] text-text-faint">
                        {m.plano_contas.codigo} {m.plano_contas.conta}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-text-muted">
                    {resumoFaixas(m)}
                  </div>
                  {m.observacoes && (
                    <div className="mt-1 text-[10.5px] text-text-faint">
                      {m.observacoes}
                    </div>
                  )}
                  {m.fonte && (
                    <div className="mt-1 text-[10px] text-text-faint">
                      Fonte: {m.fonte}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={inicio[m.id] ?? ""}
                      onChange={(e) =>
                        setInicio({ ...inicio, [m.id]: e.target.value })
                      }
                      className="input campo-data text-[11px]"
                      title="Início no cenário (opcional)"
                    />
                    <button
                      type="button"
                      disabled={pending || !cenarioId}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await aplicarModeloMercado(
                            m.id,
                            cenarioId,
                            inicio[m.id] ?? null,
                          );
                          setErro(r.error);
                        })
                      }
                      className="rounded-lg bg-wine-deep px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-60"
                    >
                      Aplicar neste cenário
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (
                        confirm(
                          `Remover o modelo "${m.nome}"? Os custos já aplicados nos cenários continuam.`,
                        )
                      ) {
                        startTransition(() => excluirModeloMercado(m.id));
                      }
                    }}
                    className="text-[10.5px] text-danger"
                  >
                    Remover modelo
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {erro && <p className="mt-3 text-[11px] text-danger">{erro}</p>}
      </div>
    </details>
  );
}
