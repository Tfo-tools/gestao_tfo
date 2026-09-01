import { createClient } from "@/lib/supabase/server";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function buildPath(values: number[], width: number, height: number, min: number, max: number) {
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");
}

type Agregado = { mes_referencia: string; receita: number; ebitda: number; clientes: number };

async function agregarPorCenario(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cenarioId: string,
): Promise<Agregado[]> {
  if (!cenarioId) return [];
  const { data } = await supabase
    .from("simulacao_mensal")
    .select("mes_referencia, receita_bruta, ebitda, clientes_ativos")
    .eq("cenario_id", cenarioId)
    .order("mes_referencia");

  const porMes = new Map<string, Agregado>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    const atual = porMes.get(row.mes_referencia) ?? { mes_referencia: row.mes_referencia, receita: 0, ebitda: 0, clientes: 0 };
    atual.receita += Number(row.receita_bruta);
    atual.ebitda += Number(row.ebitda);
    atual.clientes += Number(row.clientes_ativos);
    porMes.set(row.mes_referencia, atual);
  }
  return [...porMes.values()].sort((a, b) => (a.mes_referencia < b.mes_referencia ? -1 : 1));
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  const supabase = await createClient();

  const { data: cenarios } = await supabase.from("cenarios").select("id, nome, is_base").order("created_at");

  const cenarioA = a ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";
  const cenarioB = b ?? (cenarios ?? []).find((c) => c.id !== cenarioA)?.id ?? "";

  const [linhasA, linhasB] = await Promise.all([agregarPorCenario(supabase, cenarioA), agregarPorCenario(supabase, cenarioB)]);

  const nomeA = (cenarios ?? []).find((c) => c.id === cenarioA)?.nome ?? "—";
  const nomeB = (cenarios ?? []).find((c) => c.id === cenarioB)?.nome ?? "—";

  const receitasA = linhasA.map((l) => l.receita);
  const receitasB = linhasB.map((l) => l.receita);
  const width = 1050;
  const height = 200;
  const min = 0;
  const max = Math.max(1, ...receitasA, ...receitasB);

  const totalReceitaA = receitasA.reduce((s, v) => s + v, 0);
  const totalReceitaB = receitasB.reduce((s, v) => s + v, 0);
  const totalEbitdaA = linhasA.reduce((s, l) => s + l.ebitda, 0);
  const totalEbitdaB = linhasB.reduce((s, l) => s + l.ebitda, 0);
  const clientesFinalA = linhasA[linhasA.length - 1]?.clientes ?? 0;
  const clientesFinalB = linhasB[linhasB.length - 1]?.clientes ?? 0;

  const semDados = linhasA.length === 0 && linhasB.length === 0;

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-heading text-[22px] font-semibold">Relatório Comparativo</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Resultado consolidado (todos os produtos) de um cenário contra outro
        </p>
      </div>

      <form method="get" className="mb-6 grid grid-cols-[1fr_auto_1fr] items-end gap-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-text-muted">Cenário A</label>
          <select name="a" defaultValue={cenarioA} className="input w-full">
            {(cenarios ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="pb-2.5 text-[11px] uppercase tracking-wide text-text-faint">vs.</div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-text-muted">Cenário B</label>
          <select name="b" defaultValue={cenarioB} className="input w-full">
            {(cenarios ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="col-span-3 rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white">
          Comparar
        </button>
      </form>

      {semDados ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-text-muted">
            Nenhum dos dois cenários tem projeção calculada ainda — recalcule em Produtos primeiro.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-xl border border-border bg-surface p-6">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-heading text-sm font-semibold">Receita consolidada — {nomeA} x {nomeB}</h2>
            </div>
            <div className="mb-3 flex items-center gap-4">
              <Legenda cor="var(--color-text-faint)" texto={nomeA} />
              <Legenda cor="var(--color-primary-fill)" texto={nomeB} />
            </div>
            <svg viewBox={`0 0 ${width} ${height + 10}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
              <line x1="0" y1={height} x2={width} y2={height} stroke="var(--color-border)" strokeWidth={1} />
              <path d={buildPath(receitasA, width, height, min, max)} fill="none" stroke="var(--color-text-faint)" strokeWidth={2.5} />
              <path d={buildPath(receitasB, width, height, min, max)} fill="none" stroke="var(--color-primary-fill)" strokeWidth={2.5} />
            </svg>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="mb-4 font-heading text-sm font-semibold">Indicadores acumulados</h2>
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="text-left text-text-muted">
                  <td className="px-2 py-1.5 font-medium">Indicador</td>
                  <td className="px-2 py-1.5 text-right font-medium">{nomeA}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{nomeB}</td>
                  <td className="px-2 py-1.5 text-right font-medium">Diferença</td>
                </tr>
              </thead>
              <tbody>
                <LinhaComparativa label="Receita acumulada" a={totalReceitaA} b={totalReceitaB} />
                <LinhaComparativa label="EBITDA acumulado" a={totalEbitdaA} b={totalEbitdaB} />
                <tr className="border-t border-border-soft">
                  <td className="px-2 py-2.5">Clientes ativos (fim do período)</td>
                  <td className="px-2 py-2.5 text-right font-mono">{clientesFinalA.toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-2.5 text-right font-mono">{clientesFinalB.toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-2.5 text-right font-mono">
                    {clientesFinalB - clientesFinalA >= 0 ? "+" : ""}
                    {(clientesFinalB - clientesFinalA).toLocaleString("pt-BR")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
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

function LinhaComparativa({ label, a, b }: { label: string; a: number; b: number }) {
  const diff = b - a;
  return (
    <tr className="border-t border-border-soft">
      <td className="px-2 py-2.5">{label}</td>
      <td className="px-2 py-2.5 text-right font-mono">{formatBRL(a)}</td>
      <td className="px-2 py-2.5 text-right font-mono">{formatBRL(b)}</td>
      <td className={`px-2 py-2.5 text-right font-mono ${diff >= 0 ? "text-success" : "text-danger"}`}>
        {diff >= 0 ? "+" : ""}
        {formatBRL(diff)}
      </td>
    </tr>
  );
}
