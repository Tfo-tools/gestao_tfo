function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function formatPct(v: number) {
  return `${v.toFixed(1)}%`;
}

export type MetasCenario = {
  meta_receita_mensal: number | null;
  meta_cac: number | null;
  meta_ltv: number | null;
  meta_roi_pct: number | null;
  meta_tir_pct: number | null;
};

export type IndicadoresAtuais = {
  receitaMensal: number | null;
  cac: number | null;
  ltv: number | null;
  roiPct: number | null;
  tirPct: number | null;
};

/** Fica fixo no topo enquanto a tela rola — mostra o quanto o plano já construído está perto (ou
 * longe) da meta definida no início, sempre visível, do jeito que o Fashion Mind faz. */
export function MetasHeader({ metas, atuais }: { metas: MetasCenario; atuais: IndicadoresAtuais }) {
  const temAlgumaMeta = [metas.meta_receita_mensal, metas.meta_cac, metas.meta_ltv, metas.meta_roi_pct, metas.meta_tir_pct].some(
    (v) => v != null,
  );
  if (!temAlgumaMeta) return null;

  return (
    <div className="sticky top-0 z-10 mb-5 rounded-xl border border-border bg-surface/95 p-4 shadow-sm backdrop-blur">
      <div className="grid grid-cols-5 gap-3">
        <Indicador label="Receita mensal" atual={atuais.receitaMensal} meta={metas.meta_receita_mensal} formatar={formatBRL} maiorMelhor />
        <Indicador label="CAC" atual={atuais.cac} meta={metas.meta_cac} formatar={formatBRL} maiorMelhor={false} />
        <Indicador label="LTV" atual={atuais.ltv} meta={metas.meta_ltv} formatar={formatBRL} maiorMelhor />
        <Indicador label="ROI" atual={atuais.roiPct} meta={metas.meta_roi_pct} formatar={formatPct} maiorMelhor />
        <Indicador label="TIR" atual={atuais.tirPct} meta={metas.meta_tir_pct} formatar={formatPct} maiorMelhor />
      </div>
    </div>
  );
}

function Indicador({
  label,
  atual,
  meta,
  formatar,
  maiorMelhor,
}: {
  label: string;
  atual: number | null;
  meta: number | null;
  formatar: (v: number) => string;
  maiorMelhor: boolean;
}) {
  if (meta == null) {
    return (
      <div className="rounded-lg bg-bg px-3 py-2.5">
        <div className="text-[10px] text-text-faint">{label}</div>
        <div className="mt-0.5 text-[13px] text-text-faint">sem meta definida</div>
      </div>
    );
  }

  const temAtual = atual != null;
  const atingiu = temAtual && (maiorMelhor ? atual! >= meta : atual! <= meta);
  const diferenca = temAtual ? atual! - meta : null;

  return (
    <div className={`rounded-lg px-3 py-2.5 ${atingiu ? "bg-success-soft" : "bg-bg"}`}>
      <div className="text-[10px] text-text-faint">
        {label} <span className="text-text-faint">· meta {formatar(meta)}</span>
      </div>
      <div className={`mt-0.5 font-mono text-[15px] font-semibold ${atingiu ? "text-success" : "text-text"}`}>
        {temAtual ? formatar(atual!) : "—"}
      </div>
      {temAtual && diferenca != null && (
        <div className={`mt-0.5 text-[10.5px] ${atingiu ? "text-success" : "text-danger"}`}>
          {atingiu
            ? "✓ meta atingida"
            : maiorMelhor
              ? `faltam ${formatar(Math.abs(diferenca))}`
              : `${formatar(Math.abs(diferenca))} acima da meta`}
        </div>
      )}
    </div>
  );
}
