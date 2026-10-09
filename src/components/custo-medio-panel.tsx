"use client";

import { useMemo } from "react";
import Link from "next/link";
import { calcularProposta, PERFIL_VAZIO, type PerfilCliente } from "@/lib/precificacao";
import type { BasesProposta } from "@/lib/precificacao-bases";
import { clienteMedioPonderado, type PerfilSimulado } from "@/lib/perfis";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Projeção de custo médio e margem. O "cliente médio" vem da ponderação dos perfis (Produto → Perfis)
 * pela participação de cada um. Mostra o custo médio por cliente, a mensalidade média e a margem. Sem
 * perfis cadastrados, cai num perfil de referência (50 mi, 25 lojas).
 */
export function CustoMedioPanel({ bases, clientesAno1, perfis }: { bases: BasesProposta; clientesAno1: number; perfis: PerfilSimulado[] }) {
  const codigos = useMemo(() => bases.modulos.filter((m) => m.ativo).map((m) => m.codigo), [bases.modulos]);
  const { perfil: medio, participacaoTotal } = useMemo(() => clienteMedioPonderado(perfis), [perfis]);
  const temPerfis = participacaoTotal > 0;

  const perfil: PerfilCliente = temPerfis
    ? { ...medio, preco_medio: medio.preco_medio || 200 }
    : { ...PERFIL_VAZIO, faturamento_anual: 50e6, lojas: 25, atacado: true, ecommerce: true, preco_medio: 200 };

  const r = useMemo(
    () =>
      calcularProposta({
        perfil,
        selecao: { modulos: codigos, blocos: [], plano_pequeno: false },
        pagamento: { meio_mensalidade: "boleto", meio_implantacao: null, prazo_implantacao: null },
        desconto: { mensalidade_pct: 0, implantacao_pct: 0, motivo: "" },
        modulos: bases.modulos, blocos: bases.blocos, params: bases.params, bases: bases.bases,
      }),
    [perfil, codigos, bases],
  );

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
        <Link href="/realizado/produtos" className="rounded-lg border border-white/30 px-2.5 py-1 text-[11.5px] text-white/90 hover:bg-white/10">Editar perfis →</Link>
      </div>
      <p className="mt-1 text-[11px] text-white/70">
        {temPerfis
          ? <>Cliente médio ponderado pelos perfis: faturamento {brl(perfil.faturamento_anual ?? 0)}, {Math.round(perfil.lojas)} lojas{perfil.atacado ? ", atacado" : ""}. Participação somada {(participacaoTotal * 100).toFixed(0)}%.</>
          : <>Sem perfis cadastrados — usando perfil de referência (50 mi, 25 lojas). Cadastre os perfis em Produto → Perfis para o cálculo seguir o seu mix.</>}
      </p>
    </div>
  );
}
