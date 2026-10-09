"use client";

import { calcularProposta, PERFIL_VAZIO, type ParametrosPrecificacao } from "@/lib/precificacao";
import type { PrazoPagamento } from "@/lib/taxas-pagamento";
import type { BasesProposta } from "@/lib/precificacao-bases";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const PRAZOS: { prazo: PrazoPagamento; label: string }[] = [
  { prazo: "avista", label: "À vista" },
  { prazo: "3x", label: "3x" },
  { prazo: "5x", label: "5x" },
];

/**
 * Prévia da margem da implantação (meio boleto): a partir do custo das etapas e da margem alvo, mostra
 * preço, margem resultante e o efeito do desconto máximo permitido, em à vista/3x/5x — para integração
 * nativa (etapas padrão) e não-nativa (soma as etapas marcadas). Mesma conta da proposta.
 */
export function ImplantacaoPreview({ params, bases }: { params: ParametrosPrecificacao; bases: BasesProposta }) {
  const descMax = params.tabela_comercial?.desconto_max_implantacao_pct ?? 0;
  const codigos = bases.modulos.filter((m) => m.ativo).map((m) => m.codigo);

  const calc = (integracaoPronta: boolean, prazo: PrazoPagamento, desc: number) =>
    calcularProposta({
      perfil: { ...PERFIL_VAZIO, faturamento_anual: 30e6, lojas: 5, integracao_pronta: integracaoPronta },
      selecao: { modulos: codigos, blocos: [], plano_pequeno: false },
      pagamento: { meio_mensalidade: "boleto", meio_implantacao: "boleto", prazo_implantacao: prazo },
      desconto: { mensalidade_pct: 0, implantacao_pct: desc, motivo: "" },
      modulos: bases.modulos, blocos: bases.blocos, params, bases: bases.bases,
    }).implantacao;

  const bloco = (integracaoPronta: boolean, titulo: string) => {
    const base = calc(integracaoPronta, "avista", 0);
    if (!base) return (
      <div className="rounded-lg border border-border-soft p-3">
        <h4 className="text-[12px] font-semibold">{titulo}</h4>
        <p className="mt-1 text-[11px] text-text-faint">Cadastre as etapas da implantação para ver a prévia.</p>
      </div>
    );
    return (
      <div className="rounded-lg border border-border-soft p-3">
        <div className="flex items-baseline justify-between">
          <h4 className="text-[12px] font-semibold">{titulo}</h4>
          <span className="text-[11px] text-text-muted">Custo (COGS): <b>{brl(base.custo)}</b></span>
        </div>
        <div className="mt-1.5 overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-left text-text-faint">
                <th className="py-1 pr-2 font-medium">Prazo</th>
                <th className="py-1 pr-2 text-right font-medium">Preço</th>
                <th className="py-1 pr-2 text-right font-medium">Parcela</th>
                <th className="py-1 pr-2 text-right font-medium">Margem</th>
                <th className="py-1 pr-2 text-right font-medium">Preço −{pct(descMax)}</th>
                <th className="py-1 pr-2 text-right font-medium">Margem c/ desc.</th>
              </tr>
            </thead>
            <tbody>
              {PRAZOS.map(({ prazo, label }) => {
                const r = calc(integracaoPronta, prazo, 0);
                const rd = calc(integracaoPronta, prazo, descMax);
                if (!r) return null;
                return (
                  <tr key={prazo} className="border-t border-border-soft">
                    <td className="py-1 pr-2">{label}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{brl(r.preco)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{r.parcelas > 1 ? `${r.parcelas}× ${brl(r.valor_parcela)}` : "—"}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{pct(r.margem_resultante)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{rd ? brl(rd.preco_com_desconto) : "—"}</td>
                    <td className={`py-1 pr-2 text-right tabular-nums ${rd && rd.margem_resultante < 0 ? "text-danger" : ""}`}>{rd ? pct(rd.margem_resultante) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border-soft p-3">
      <h3 className="text-[12.5px] font-medium">Prévia da margem da implantação (boleto)</h3>
      <p className="mb-2 mt-0.5 text-[11px] text-text-muted">Preço e margem a partir do custo das etapas e da margem alvo acima, no mesmo cálculo da proposta (taxa do boleto por parcela). A coluna de desconto usa o máximo permitido definido aqui.</p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {bloco(true, "Integração nativa")}
        {bloco(false, "Integração não-nativa")}
      </div>
    </div>
  );
}
