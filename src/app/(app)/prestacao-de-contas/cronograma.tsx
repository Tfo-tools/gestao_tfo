import { createClient } from "@/lib/supabase/server";

/**
 * Cronograma físico-financeiro de um programa: rubricas nas linhas, meses nas colunas, valor previsto
 * por mês. O sistema guarda o TOTAL de cada rubrica e o período (início→fim) — a distribuição mensal
 * é LINEAR no período (o total dividido pelos meses). Pras rubricas de parcela mensal (bolsa,
 * pró-labore, contábil, jurídica) isso bate com o projeto; pros serviços por hora é uma estimativa.
 */

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ym: string) => `${MES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const r2 = (v: number) => Math.round(v * 100) / 100;

function mesesEntre(ini: string, fim: string): string[] {
  const out: string[] = [];
  let y = Number(ini.slice(0, 4));
  let m = Number(ini.slice(5, 7));
  const fy = Number(fim.slice(0, 4));
  const fm = Number(fim.slice(5, 7));
  let guard = 0;
  while ((y < fy || (y === fy && m <= fm)) && guard++ < 240) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Distribui um valor igualmente pelos meses; o arredondamento sobra pro último mês. */
function distribui(valor: number, meses: string[]): Record<string, number> {
  const n = meses.length;
  if (n === 0) return {};
  const base = r2(valor / n);
  const out: Record<string, number> = {};
  let acc = 0;
  meses.forEach((m, i) => {
    const v = i === n - 1 ? r2(valor - acc) : base;
    out[m] = v;
    acc = r2(acc + v);
  });
  return out;
}

export async function CronogramaPrograma({ programaId }: { programaId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("programa_linhas_previstas")
    .select("valor, data_inicio, data_fim, rubrica:programa_rubricas(nome)")
    .eq("programa_id", programaId)
    .order("data_inicio");

  type Linha = { valor: number; data_inicio: string | null; data_fim: string | null; rubrica: { nome: string } | null };
  const linhas = (data ?? []) as unknown as Linha[];
  if (linhas.length === 0) return null;

  // Agrupa por rubrica, espalhando cada linha pelos seus meses.
  const porRubrica = new Map<string, { total: number; porMes: Record<string, number>; inicio: string }>();
  const mesesSet = new Set<string>();
  for (const l of linhas) {
    if (!l.data_inicio || !l.data_fim) continue;
    const nome = l.rubrica?.nome ?? "—";
    const meses = mesesEntre(l.data_inicio, l.data_fim);
    meses.forEach((m) => mesesSet.add(m));
    const parcelas = distribui(Number(l.valor), meses);
    const atual = porRubrica.get(nome) ?? { total: 0, porMes: {}, inicio: l.data_inicio };
    atual.total = r2(atual.total + Number(l.valor));
    for (const [m, v] of Object.entries(parcelas)) atual.porMes[m] = r2((atual.porMes[m] ?? 0) + v);
    if (l.data_inicio < atual.inicio) atual.inicio = l.data_inicio;
    porRubrica.set(nome, atual);
  }

  const meses = [...mesesSet].sort();
  const rubricas = [...porRubrica.entries()].sort((a, b) => a[1].inicio.localeCompare(b[1].inicio) || a[0].localeCompare(b[0]));
  const totalMes = (m: string) => r2(rubricas.reduce((s, [, r]) => s + (r.porMes[m] ?? 0), 0));
  const totalGeral = r2(rubricas.reduce((s, [, r]) => s + r.total, 0));

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-sm font-semibold">Cronograma físico-financeiro</h2>
      <p className="mb-4 text-[11.5px] text-text-muted">
        Previsto por rubrica e mês. Distribuição <strong>linear no período</strong> de cada rubrica — exata nas parcelas mensais
        (bolsa, pró-labore, contábil, jurídica); estimada nos serviços por hora.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-medium">Rubrica</th>
              {meses.map((m) => (
                <th key={m} className="whitespace-nowrap px-2 py-2 text-right font-medium">{rotuloMes(m)}</th>
              ))}
              <th className="whitespace-nowrap px-2 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rubricas.map(([nome, r]) => (
              <tr key={nome} className="border-b border-border-soft">
                <td className="sticky left-0 z-10 max-w-[220px] bg-surface px-2 py-2">{nome}</td>
                {meses.map((m) => (
                  <td key={m} className="whitespace-nowrap px-2 py-2 text-right font-mono">
                    {r.porMes[m] ? fmt(r.porMes[m]) : <span className="text-text-faint">·</span>}
                  </td>
                ))}
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono font-semibold">{fmt(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-bg font-semibold">
              <td className="sticky left-0 z-10 bg-bg px-2 py-2">Total por mês</td>
              {meses.map((m) => (
                <td key={m} className="whitespace-nowrap px-2 py-2 text-right font-mono">{fmt(totalMes(m))}</td>
              ))}
              <td className="whitespace-nowrap px-2 py-2 text-right font-mono">{fmt(totalGeral)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
