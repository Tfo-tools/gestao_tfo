import Link from "next/link";
import { InfoTooltip } from "@/components/info-tooltip";

export type CustoDerivado = {
  /** Card de lançamento onde a linha aparece (csp, vendas, taxas...). */
  categoria: string;
  rotulo: string;
  grupo: string;
  total: number;
  detalhe: string;
  href: string;
  ondeEditar: string;
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/**
 * Custos que o motor calcula sozinho a partir de outras telas (canais, implementação) e que por
 * isso nunca aparecem nos cards de lançamento abaixo — eles não estão em plano_custos_fixos nem
 * em custos_empresa. Sem este painel a tela parece zerada enquanto o CAC lá em cima já conta com
 * eles, que é exatamente a divergência que motivou este bloco.
 */
export function CustosDerivados({ itens, cenarioId }: { itens: CustoDerivado[]; cenarioId: string }) {
  const comValor = itens.filter((i) => i.total > 0);
  if (comValor.length === 0) return null;
  const total = comValor.reduce((s, i) => s + i.total, 0);

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center font-heading text-[13px] font-semibold">
          Custos calculados automaticamente
          <InfoTooltip texto="Estes custos não são lançados aqui: o motor os deriva do que você configurou em outras telas e já os soma no EBITDA, no CAC e na margem. Este painel existe pra você ver que eles estão na conta — pra mudar o valor, use o link de cada linha." />
        </h2>
        <span className="font-mono text-[12px] font-semibold">{formatBRL(total)}</span>
      </div>
      <p className="mb-3 text-[11px] text-text-muted">
        Vêm de outras telas e já entram no CAC e no EBITDA — não são editáveis nos cards abaixo.
      </p>

      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-[9.5px] uppercase tracking-wide text-text-faint">
            <th className="px-2 py-1.5 font-medium">Custo</th>
            <th className="px-2 py-1.5 font-medium">Entra em</th>
            <th className="px-2 py-1.5 font-medium">Como é calculado</th>
            <th className="px-2 py-1.5 text-right font-medium">Total no período</th>
            <th className="px-2 py-1.5 font-medium">Onde ajustar</th>
          </tr>
        </thead>
        <tbody>
          {comValor.map((i) => (
            <tr key={i.rotulo} className="border-t border-border-soft text-[11.5px]">
              <td className="px-2 py-1.5 font-medium">{i.rotulo}</td>
              <td className="px-2 py-1.5 text-text-muted">{i.grupo}</td>
              <td className="px-2 py-1.5 text-text-muted">{i.detalhe}</td>
              <td className="px-2 py-1.5 text-right font-mono">{formatBRL(i.total)}</td>
              <td className="px-2 py-1.5">
                <Link href={i.href.replace("{cenarioId}", cenarioId)} className="text-primary-deep underline">
                  {i.ondeEditar}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
