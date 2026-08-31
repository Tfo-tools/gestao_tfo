function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function buildPath(values: number[], width: number, height: number, min: number, max: number) {
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

type Linha = {
  mes_referencia: string;
  clientes_ativos: number;
  receita_bruta: number;
  ebitda: number;
  cac_all_in: number | null;
  ltv: number | null;
};

export function SimulacaoResultado({ linhas }: { linhas: Linha[] }) {
  if (linhas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
        <p className="text-sm text-text-muted">
          Nenhuma projeção calculada ainda — preencha as fases e clique em &quot;Recalcular projeção&quot;.
        </p>
      </div>
    );
  }

  const receitas = linhas.map((l) => l.receita_bruta);
  const ebitdas = linhas.map((l) => l.ebitda);
  const width = 1050;
  const height = 170;
  const min = Math.min(0, ...receitas, ...ebitdas);
  const max = Math.max(1, ...receitas, ...ebitdas);

  const clientesFinal = linhas[linhas.length - 1]?.clientes_ativos ?? 0;
  const cacsValidos = linhas.map((l) => l.cac_all_in).filter((v): v is number => v != null && v > 0);
  const ltvsValidos = linhas.map((l) => l.ltv).filter((v): v is number => v != null && v > 0);
  const cacMedio = cacsValidos.length ? cacsValidos.reduce((a, b) => a + b, 0) / cacsValidos.length : null;
  const ltvMedio = ltvsValidos.length ? ltvsValidos.reduce((a, b) => a + b, 0) / ltvsValidos.length : null;

  const primeiro = linhas[0]?.mes_referencia?.slice(0, 7);
  const ultimo = linhas[linhas.length - 1]?.mes_referencia?.slice(0, 7);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">Projeção — Receita &amp; EBITDA</h2>
        <span className="text-[11px] text-text-faint">
          {primeiro} → {ultimo}
        </span>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <Legenda cor="var(--color-primary-fill)" texto="Receita" />
        <Legenda cor="var(--color-wine)" texto="EBITDA" />
      </div>

      <svg viewBox={`0 0 ${width} ${height + 20}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
        <line x1="0" y1={height * (max / (max - min))} x2={width} y2={height * (max / (max - min))} stroke="var(--color-border)" strokeWidth={1} />
        <path d={buildPath(receitas, width, height, min, max)} fill="none" stroke="var(--color-primary-fill)" strokeWidth={2.5} />
        <path d={buildPath(ebitdas, width, height, min, max)} fill="none" stroke="var(--color-wine)" strokeWidth={2} />
      </svg>

      <div className="mt-5 grid grid-cols-4 gap-3">
        <Stat label="Clientes ativos (fim)" valor={clientesFinal.toLocaleString("pt-BR")} />
        <Stat label="Receita no último mês" valor={formatBRL(receitas[receitas.length - 1] ?? 0)} />
        <Stat label="CAC all-in médio" valor={cacMedio != null ? formatBRL(cacMedio) : "—"} />
        <Stat label="LTV médio" valor={ltvMedio != null ? formatBRL(ltvMedio) : "—"} />
      </div>
    </div>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-[2px] w-3.5" style={{ background: cor }} />
      <span className="text-[11px] text-text-muted">{texto}</span>
    </div>
  );
}

function Stat({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg bg-bg px-3.5 py-3">
      <div className="text-[10.5px] text-text-faint">{label}</div>
      <div className="mt-1 font-mono text-[14px] font-semibold">{valor}</div>
    </div>
  );
}
