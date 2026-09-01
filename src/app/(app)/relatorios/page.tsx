import { createClient } from "@/lib/supabase/server";
import { InfoTooltip } from "@/components/info-tooltip";
import { AlocacaoInvestimento } from "./alocacao-investimento";
import { custoEmpresaNoMes, type CustoEmpresaInput } from "@/lib/custos-empresa";
import { custoMensalModelo, type ParametrosModelo, type TipoModelo } from "@/lib/modelos-contratacao";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatMes(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function buildPath(values: number[], width: number, height: number, min: number, max: number) {
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");
}

type Agregado = { mes_referencia: string; receita: number; ebitdaProdutos: number; clientes: number; custosEmpresa: number; ebitda: number };

type ResumoCenario = {
  linhas: Agregado[];
  cacMedio: number | null;
  breakEvenMes: string | null;
  totalInvestido: number;
  ebitdaAcumulado: number;
};

function ativaNoMes(mesIso: string, dataInicio: string | null, dataFim: string | null): boolean {
  const mes = new Date(mesIso + "T00:00:00");
  const inicio = dataInicio ? new Date(dataInicio + "T00:00:00") : null;
  const fim = dataFim ? new Date(dataFim + "T00:00:00") : null;
  const iniciouAntes = !inicio || new Date(inicio.getFullYear(), inicio.getMonth(), 1) <= mes;
  const aindaAtiva = !fim || fim >= mes;
  return iniciouAntes && aindaAtiva;
}

async function agregarPorCenario(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cenarioId: string,
): Promise<ResumoCenario> {
  if (!cenarioId) return { linhas: [], cacMedio: null, breakEvenMes: null, totalInvestido: 0, ebitdaAcumulado: 0 };

  const [{ data: simRows }, { data: vinculos }, { data: custosEmpresaRaw }, { data: alocacoesRaw }, { data: modelosRaw }] = await Promise.all([
    supabase
      .from("simulacao_mensal")
      .select("mes_referencia, receita_bruta, ebitda, clientes_ativos, cac_all_in, novos_clientes")
      .eq("cenario_id", cenarioId)
      .order("mes_referencia"),
    supabase.from("cenario_programas").select("programa_id").eq("cenario_id", cenarioId),
    supabase.from("custos_empresa").select("*").eq("cenario_id", cenarioId),
    supabase.from("alocacao_modelo_contratacao").select("*").eq("cenario_id", cenarioId),
    supabase.from("modelos_contratacao").select("*"),
  ]);

  const porMes = new Map<string, Agregado>();
  let somaCacPonderado = 0;
  let somaNovosClientes = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (simRows ?? []) as any[]) {
    const atual = porMes.get(row.mes_referencia) ?? { mes_referencia: row.mes_referencia, receita: 0, ebitdaProdutos: 0, clientes: 0, custosEmpresa: 0, ebitda: 0 };
    atual.receita += Number(row.receita_bruta);
    atual.ebitdaProdutos += Number(row.ebitda);
    atual.clientes += Number(row.clientes_ativos);
    porMes.set(row.mes_referencia, atual);

    const novos = Number(row.novos_clientes ?? 0);
    if (row.cac_all_in != null && novos > 0) {
      somaCacPonderado += Number(row.cac_all_in) * novos;
      somaNovosClientes += novos;
    }
  }

  // Custos compartilhados da empresa (não ligados a um produto) — entram uma vez no EBITDA
  // consolidado, sem ratear entre produtos.
  const modeloById = new Map(((modelosRaw ?? []) as { id: string; tipo_modelo: string; parametros: ParametrosModelo }[]).map((m) => [m.id, m]));
  for (const atual of porMes.values()) {
    const mesDate = new Date(atual.mes_referencia + "T00:00:00");

    let custosEmpresa = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (custosEmpresaRaw ?? []) as any[]) {
      custosEmpresa += custoEmpresaNoMes(c as CustoEmpresaInput, mesDate, atual.receita, atual.clientes);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (alocacoesRaw ?? []) as any[]) {
      if (!ativaNoMes(atual.mes_referencia, a.data_inicio, a.data_fim)) continue;
      const modelo = modeloById.get(a.modelo_id);
      if (!modelo) continue;
      const tipo = modelo.tipo_modelo as TipoModelo;
      const quantidade = Number(a.quantidade);
      const demandaEquivalente =
        tipo === "clt" || tipo === "pj" || tipo === "empresa_fixo_escopo"
          ? quantidade * (modelo.parametros.capacidade_unidade_mes ?? 1)
          : quantidade;
      custosEmpresa += custoMensalModelo(tipo, modelo.parametros, demandaEquivalente).custoMensal;
    }

    atual.custosEmpresa = custosEmpresa;
    atual.ebitda = atual.ebitdaProdutos - custosEmpresa;
  }

  const linhas = [...porMes.values()].sort((a, b) => (a.mes_referencia < b.mes_referencia ? -1 : 1));
  const cacMedio = somaNovosClientes > 0 ? somaCacPonderado / somaNovosClientes : null;

  let acumulado = 0;
  let breakEvenMes: string | null = null;
  for (const l of linhas) {
    acumulado += l.ebitda;
    if (breakEvenMes === null && acumulado >= 0 && l.mes_referencia !== linhas[0]?.mes_referencia) {
      breakEvenMes = l.mes_referencia;
    }
  }
  const ebitdaAcumulado = linhas.reduce((s, l) => s + l.ebitda, 0);

  const programaIds = ((vinculos ?? []) as { programa_id: string }[]).map((v) => v.programa_id);
  let totalInvestido = 0;
  if (programaIds.length > 0) {
    const { data: programas } = await supabase
      .from("programas_investimento")
      .select("valor_total")
      .in("id", programaIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    totalInvestido = ((programas ?? []) as any[]).reduce((s, p) => s + Number(p.valor_total ?? 0), 0);
  }

  return { linhas, cacMedio, breakEvenMes, totalInvestido, ebitdaAcumulado };
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

  const [resumoA, resumoB] = await Promise.all([agregarPorCenario(supabase, cenarioA), agregarPorCenario(supabase, cenarioB)]);

  const nomeA = (cenarios ?? []).find((c) => c.id === cenarioA)?.nome ?? "—";
  const nomeB = (cenarios ?? []).find((c) => c.id === cenarioB)?.nome ?? "—";

  const [{ data: alocacoesA }, { data: alocacoesB }] = await Promise.all([
    cenarioA ? supabase.from("alocacao_investimento").select("*").eq("cenario_id", cenarioA).order("created_at") : Promise.resolve({ data: [] }),
    cenarioB ? supabase.from("alocacao_investimento").select("*").eq("cenario_id", cenarioB).order("created_at") : Promise.resolve({ data: [] }),
  ]);

  const receitasA = resumoA.linhas.map((l) => l.receita);
  const receitasB = resumoB.linhas.map((l) => l.receita);
  const width = 1050;
  const height = 200;
  const min = 0;
  const max = Math.max(1, ...receitasA, ...receitasB);

  const totalReceitaA = receitasA.reduce((s, v) => s + v, 0);
  const totalReceitaB = receitasB.reduce((s, v) => s + v, 0);
  const clientesFinalA = resumoA.linhas[resumoA.linhas.length - 1]?.clientes ?? 0;
  const clientesFinalB = resumoB.linhas[resumoB.linhas.length - 1]?.clientes ?? 0;

  const semDados = resumoA.linhas.length === 0 && resumoB.linhas.length === 0;

  const mesesUnificados = [...new Set([...resumoA.linhas.map((l) => l.mes_referencia), ...resumoB.linhas.map((l) => l.mes_referencia)])].sort();
  const linhaAPorMes = new Map(resumoA.linhas.map((l) => [l.mes_referencia, l]));
  const linhaBPorMes = new Map(resumoB.linhas.map((l) => [l.mes_referencia, l]));

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

          <div className="mb-5 rounded-xl border border-border bg-surface p-6">
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
                <LinhaComparativa label="Receita acumulada" a={totalReceitaA} b={totalReceitaB} formato="brl" />
                <LinhaComparativa
                  label="EBITDA dos produtos (soma, antes dos custos da empresa)"
                  a={resumoA.linhas.reduce((s, l) => s + l.ebitdaProdutos, 0)}
                  b={resumoB.linhas.reduce((s, l) => s + l.ebitdaProdutos, 0)}
                  formato="brl"
                />
                <tr className="border-t border-border-soft">
                  <td className="flex items-center px-2 py-2.5">
                    (–) Custos compartilhados da empresa
                    <InfoTooltip texto="Contador, jurídico, escritório, cloud, equipe comercial etc. — cadastrados em Plano de Custos > Custos da Empresa e nas alocações de Necessidade de Contratação. Entram uma única vez aqui, sem ratear entre produtos." />
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-danger">
                    − {formatBRL(resumoA.linhas.reduce((s, l) => s + l.custosEmpresa, 0))}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-danger">
                    − {formatBRL(resumoB.linhas.reduce((s, l) => s + l.custosEmpresa, 0))}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-text-faint">—</td>
                </tr>
                <LinhaComparativa label="(=) EBITDA consolidado da empresa" a={resumoA.ebitdaAcumulado} b={resumoB.ebitdaAcumulado} formato="brl" />
                <tr className="border-t border-border-soft">
                  <td className="px-2 py-2.5">Clientes ativos (fim do período)</td>
                  <td className="px-2 py-2.5 text-right font-mono">{clientesFinalA.toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-2.5 text-right font-mono">{clientesFinalB.toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-2.5 text-right font-mono">
                    {clientesFinalB - clientesFinalA >= 0 ? "+" : ""}
                    {(clientesFinalB - clientesFinalA).toLocaleString("pt-BR")}
                  </td>
                </tr>
                <tr className="border-t border-border-soft">
                  <td className="flex items-center px-2 py-2.5">
                    CAC médio (all-in)
                    <InfoTooltip texto="CAC ponderado pelos clientes novos de cada mês — quanto custou, em média, adquirir cada cliente ao longo de todo o período simulado." />
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono">{resumoA.cacMedio != null ? formatBRL(resumoA.cacMedio) : "—"}</td>
                  <td className="px-2 py-2.5 text-right font-mono">{resumoB.cacMedio != null ? formatBRL(resumoB.cacMedio) : "—"}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-text-faint">—</td>
                </tr>
                <tr className="border-t border-border-soft">
                  <td className="flex items-center px-2 py-2.5">
                    Ponto de equilíbrio
                    <InfoTooltip texto="Break-even: primeiro mês em que o EBITDA acumulado (desde o início da simulação) deixa de ser negativo — a partir dali, o negócio já gerou de volta tudo o que consumiu antes." />
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono">{resumoA.breakEvenMes ? formatMes(resumoA.breakEvenMes) : "não atingido no período"}</td>
                  <td className="px-2 py-2.5 text-right font-mono">{resumoB.breakEvenMes ? formatMes(resumoB.breakEvenMes) : "não atingido no período"}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-text-faint">—</td>
                </tr>
                <tr className="border-t border-border-soft">
                  <td className="flex items-center px-2 py-2.5">
                    Retorno sobre o investimento
                    <InfoTooltip texto="EBITDA acumulado no período simulado dividido pelo total captado (fomento + investimento) vinculado a este cenário. Ex: 3,2x significa que o resultado operacional gerado equivale a 3,2 vezes o capital investido." />
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono">
                    {resumoA.totalInvestido > 0 ? `${(resumoA.ebitdaAcumulado / resumoA.totalInvestido).toFixed(1)}x` : "sem captação vinculada"}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono">
                    {resumoB.totalInvestido > 0 ? `${(resumoB.ebitdaAcumulado / resumoB.totalInvestido).toFixed(1)}x` : "sem captação vinculada"}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-text-faint">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mb-5 grid grid-cols-2 items-start gap-5">
            <AlocacaoInvestimento cenarioId={cenarioA} itens={alocacoesA ?? []} nomeCenario={nomeA} />
            <AlocacaoInvestimento cenarioId={cenarioB} itens={alocacoesB ?? []} nomeCenario={nomeB} />
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="mb-1 font-heading text-sm font-semibold">Clientes e faturamento mês a mês</h2>
            <p className="mb-4 text-[11px] text-text-muted">Pronto para levar às apresentações de investimento</p>
            <div className="max-h-[420px] overflow-y-auto overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-left text-text-muted">
                    <td className="px-2 py-1.5 font-medium">Mês</td>
                    <td className="px-2 py-1.5 text-right font-medium">Clientes ({nomeA})</td>
                    <td className="px-2 py-1.5 text-right font-medium">Faturamento ({nomeA})</td>
                    <td className="px-2 py-1.5 text-right font-medium">Clientes ({nomeB})</td>
                    <td className="px-2 py-1.5 text-right font-medium">Faturamento ({nomeB})</td>
                  </tr>
                </thead>
                <tbody>
                  {mesesUnificados.map((mes) => {
                    const la = linhaAPorMes.get(mes);
                    const lb = linhaBPorMes.get(mes);
                    return (
                      <tr key={mes} className="border-t border-border-soft">
                        <td className="px-2 py-1.5 capitalize">{formatMes(mes)}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{la ? la.clientes.toLocaleString("pt-BR") : "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{la ? formatBRL(la.receita) : "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{lb ? lb.clientes.toLocaleString("pt-BR") : "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{lb ? formatBRL(lb.receita) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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

function LinhaComparativa({ label, a, b, formato }: { label: string; a: number; b: number; formato: "brl" }) {
  const diff = b - a;
  const fmt = formato === "brl" ? formatBRL : (v: number) => v.toString();
  return (
    <tr className="border-t border-border-soft">
      <td className="px-2 py-2.5">{label}</td>
      <td className="px-2 py-2.5 text-right font-mono">{fmt(a)}</td>
      <td className="px-2 py-2.5 text-right font-mono">{fmt(b)}</td>
      <td className={`px-2 py-2.5 text-right font-mono ${diff >= 0 ? "text-success" : "text-danger"}`}>
        {diff >= 0 ? "+" : ""}
        {fmt(diff)}
      </td>
    </tr>
  );
}
