"use client";

import { useMemo, useState } from "react";
import { calcularProposta, PERFIL_VAZIO, type PerfilCliente } from "@/lib/precificacao";
import type { BasesProposta } from "@/lib/precificacao-bases";

/**
 * Simulador para DECIDIR o teto de desconto: a sócia digita o desconto que pensa em liberar e vê,
 * em perfis representativos, o preço com desconto e a margem resultante. Serve também para ver o
 * efeito do piso de preço por faturamento no atacado. Tudo no cliente, com as mesmas funções puras
 * do motor; não salva nada (o teto em si é salvo no formulário de parâmetros acima).
 */
const PRESETS: { nome: string; p: Partial<PerfilCliente> }[] = [
  { nome: "Varejo R$ 30 mi · 12 lojas", p: { faturamento_anual: 30e6, lojas: 12, ecommerce: true, preco_medio: 140 } },
  { nome: "Varejo R$ 80 mi · 42 lojas", p: { faturamento_anual: 80e6, lojas: 42, ecommerce: true, preco_medio: 140 } },
  { nome: "Varejo R$ 140 mi · 75 lojas", p: { faturamento_anual: 140e6, lojas: 75, ecommerce: true, preco_medio: 140 } },
  { nome: "Atacado R$ 120 mi · sem lojas", p: { faturamento_anual: 120e6, lojas: 0, atacado: true, preco_medio: 140 } },
];

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function SimuladorDesconto({ bases }: { bases: BasesProposta }) {
  const tetoSalvo = Math.round((bases.params.tabela_comercial?.desconto_max_mensalidade_pct ?? 0) * 100);
  const [desc, setDesc] = useState(tetoSalvo);

  const linhas = useMemo(() => {
    const calc = (perfil: PerfilCliente, d: number) =>
      calcularProposta({
        perfil,
        selecao: { modulos: ["mind", "skills_completo", "price"], blocos: [], plano_pequeno: false },
        pagamento: { meio_mensalidade: "boleto", meio_implantacao: null, prazo_implantacao: null },
        desconto: { mensalidade_pct: d / 100, implantacao_pct: 0, motivo: "" },
        modulos: bases.modulos, blocos: bases.blocos, params: bases.params, bases: bases.bases,
      });
    return PRESETS.map((pr) => {
      const perfil = { ...PERFIL_VAZIO, ...pr.p } as PerfilCliente;
      const r0 = calc(perfil, 0);
      const rd = calc(perfil, desc);
      return {
        nome: pr.nome,
        lista: r0.mensalidade,
        comDesc: rd.mensalidade_com_desconto,
        margem0: r0.margem_resultante_mensalidade,
        margemD: rd.margem_resultante_mensalidade,
        piso: r0.piso_mensalidade,
        situacao: rd.desconto_situacao,
      };
    });
  }, [desc, bases]);

  const rotuloSit: Record<string, string> = { sem_desconto: "sem desconto", dentro_da_tabela: "dentro da tabela", precisa_aprovacao: "precisa aprovação", bloqueado: "abaixo do piso" };

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-sm font-semibold">Simulador de desconto</h2>
          <p className="mt-0.5 text-[12px] text-text-muted">Digite o desconto que pensa em liberar e veja a margem resultante por perfil. Ajuda a decidir o teto. O teto que vale na proposta é o salvo acima, em tabela comercial.</p>
        </div>
        <label className="flex items-center gap-2 text-[12.5px]">
          Desconto a simular
          <input value={desc} onChange={(e) => setDesc(Math.max(0, Math.min(95, Number(e.target.value.replace(",", ".")) || 0)))} className="input input-compacto w-20 text-right" inputMode="decimal" /> %
        </label>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="py-1.5 pr-2 font-medium">Perfil</th>
              <th className="py-1.5 pr-2 text-right font-medium">Lista</th>
              <th className="py-1.5 pr-2 text-right font-medium">Margem na lista</th>
              <th className="py-1.5 pr-2 text-right font-medium">Com {desc}%</th>
              <th className="py-1.5 pr-2 text-right font-medium">Margem com desconto</th>
              <th className="py-1.5 pr-2 text-right font-medium">Piso (custo)</th>
              <th className="py-1.5 pr-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.nome} className="border-t border-border-soft">
                <td className="py-1.5 pr-2">{l.nome}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{brl(l.lista)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-text-muted">{pct(l.margem0)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{brl(l.comDesc)}</td>
                <td className={`py-1.5 pr-2 text-right tabular-nums font-medium ${l.margemD < 0 ? "text-danger" : l.margemD < 0.5 ? "text-warning" : "text-success"}`}>{pct(l.margemD)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-text-faint">{brl(l.piso)}</td>
                <td className="py-1.5 pr-2 text-[11px]">{rotuloSit[l.situacao] ?? l.situacao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-text-faint">A margem resultante é sobre o preço com desconto, já descontados imposto e taxa. Verde ≥ 50%, amarelo abaixo de 50%, vermelho significa preço abaixo do custo. O piso é o preço com margem zero.</p>
    </div>
  );
}
