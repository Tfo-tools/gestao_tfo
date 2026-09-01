"use client";

import { useTransition } from "react";
import { excluirModeloContratacao } from "./actions";
import { TIPO_MODELO_LABEL, type TipoModelo, type ParametrosModelo } from "@/lib/modelos-contratacao";

type Modelo = {
  id: string;
  cargo: string;
  tipo_modelo: string;
  nome: string;
  categoria: string;
  parametros: ParametrosModelo;
  observacoes: string | null;
  ativo: boolean;
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function resumoParametros(tipo: TipoModelo, p: ParametrosModelo): string {
  switch (tipo) {
    case "clt":
      return `${formatBRL(p.salario_bruto ?? 0)}/mês + ${((p.aliquota_encargos ?? 0) * 100).toFixed(0)}% encargos · ${p.horas_semanais ?? "?"}h/semana · cobre ${p.capacidade_unidade_mes ?? "?"}/mês`;
    case "pj":
    case "empresa_fixo_escopo":
      return `${formatBRL(p.valor_mensal ?? 0)}/mês · cobre ${p.capacidade_unidade_mes ?? "?"}/mês`;
    case "empresa_hibrido":
      return `${formatBRL(p.valor_fixo_mensal ?? 0)} fixo + ${formatBRL(p.valor_por_unidade_convertida ?? 0)} por resultado`;
    case "empresa_creditos":
      return `${formatBRL(p.valor_por_credito ?? 0)}/crédito · ${p.creditos_por_unidade ?? 1} crédito(s) por contato`;
  }
}

export function ModelosLista({ modelos }: { modelos: Modelo[] }) {
  const [isPending, startTransition] = useTransition();

  const porCargo = new Map<string, Modelo[]>();
  for (const m of modelos) {
    const atual = porCargo.get(m.cargo) ?? [];
    atual.push(m);
    porCargo.set(m.cargo, atual);
  }

  if (modelos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
        <p className="text-sm text-text-muted">Nenhum modelo cadastrado ainda.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {[...porCargo.entries()].map(([cargo, itens]) => (
        <div key={cargo} className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-3 font-heading text-[13px] font-semibold">{cargo}</h2>
          <div className="flex flex-col gap-2">
            {itens.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border border-border-soft px-3 py-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-semibold">{m.nome}</span>
                    <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-primary-deep">
                      {TIPO_MODELO_LABEL[m.tipo_modelo as TipoModelo] ?? m.tipo_modelo}
                    </span>
                    <span className="text-[9.5px] uppercase text-text-faint">{m.categoria}</span>
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-text-faint">
                    {resumoParametros(m.tipo_modelo as TipoModelo, m.parametros)}
                  </div>
                  {m.observacoes && <div className="mt-0.5 text-[10.5px] text-text-faint">{m.observacoes}</div>}
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => excluirModeloContratacao(m.id))}
                  className="text-[11px] text-danger"
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
