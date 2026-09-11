function formatBRL(v: number | null) {
  return v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—";
}

/** Só os indicadores que não dependem de custo — ROI, TIR, margem e EBITDA ficam em Custos. */
export function VendasKpiBar({
  receitaMensal,
  cac,
  ltv,
  pmv,
}: {
  receitaMensal: number | null;
  cac: number | null;
  ltv: number | null;
  pmv: number | null;
}) {
  return (
    <div className="mb-5 grid grid-cols-4 gap-0 overflow-hidden rounded-xl bg-wine-deep text-white">
      <Item label="Receita mensal" valor={formatBRL(receitaMensal)} />
      <Item label="CAC" valor={formatBRL(cac)} />
      <Item label="LTV" valor={formatBRL(ltv)} />
      <Item label="PMV (preço médio de venda)" valor={formatBRL(pmv)} />
    </div>
  );
}

function Item({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="border-r border-white/10 px-4 py-3 last:border-r-0">
      <div className="text-[9.5px] uppercase tracking-wide text-white/55">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold">{valor}</div>
    </div>
  );
}
