"use client";

import { useMemo, useState } from "react";
import { calcularProposta, PERFIL_VAZIO, type PerfilCliente } from "@/lib/precificacao";
import type { BasesProposta } from "@/lib/precificacao-bases";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Projeção de custo médio e margem (etapa 4). Usa os clientes previstos no 1º ano (das curvas de
 * crescimento) e um perfil médio de referência, editável, com todos os módulos ativos. Mostra o
 * custo médio por cliente, a mensalidade média e a margem resultante. É referência, não é por cliente.
 */
export function CustoMedioPanel({ bases, clientesAno1 }: { bases: BasesProposta; clientesAno1: number }) {
  const [fatMi, setFatMi] = useState(50);
  const [lojas, setLojas] = useState(25);
  const codigos = useMemo(() => bases.modulos.filter((m) => m.ativo).map((m) => m.codigo), [bases.modulos]);

  const r = useMemo(() => {
    const perfil = { ...PERFIL_VAZIO, faturamento_anual: fatMi * 1e6, lojas, atacado: true, ecommerce: true, preco_medio: 200 } as PerfilCliente;
    return calcularProposta({
      perfil,
      selecao: { modulos: codigos, blocos: [], plano_pequeno: false },
      pagamento: { meio_mensalidade: "boleto", meio_implantacao: null, prazo_implantacao: null },
      desconto: { mensalidade_pct: 0, implantacao_pct: 0, motivo: "" },
      modulos: bases.modulos, blocos: bases.blocos, params: bases.params, bases: bases.bases,
    });
  }, [fatMi, lojas, codigos, bases]);

  return (
    <div className="rounded-xl border border-border bg-wine-deep p-4 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">Projeção de custo médio e margem</p>
          <div className="mt-1 flex flex-wrap gap-x-8 gap-y-1">
            <span className="text-[13px]">Clientes no 1º ano: <b className="text-[18px]">{Math.round(clientesAno1)}</b></span>
            <span className="text-[13px]">Custo médio/cliente: <b className="text-[18px]">{brl(r.custo_total_mes)}</b></span>
            <span className="text-[13px]">Mensalidade média: <b className="text-[18px]">{brl(r.mensalidade)}</b></span>
            <span className="text-[13px]">Margem: <b className="text-[18px]">{(r.margem_resultante_mensalidade * 100).toFixed(0)}%</b></span>
          </div>
        </div>
        <div className="flex items-end gap-2 text-[11.5px]">
          <label className="flex flex-col gap-0.5">Perfil médio (R$ mi)<input value={fatMi} onChange={(e) => setFatMi(Number(e.target.value.replace(",", ".")) || 0)} className="input input-compacto w-20 text-right text-text" inputMode="decimal" /></label>
          <label className="flex flex-col gap-0.5">Lojas<input value={lojas} onChange={(e) => setLojas(Math.max(0, Math.round(Number(e.target.value) || 0)))} className="input input-compacto w-16 text-right text-text" inputMode="numeric" /></label>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-white/70">Perfil médio de referência com todos os módulos ativos. Ajuste os parâmetros abaixo e veja o efeito aqui.</p>
    </div>
  );
}
