import Link from "next/link";
import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function formatMes(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}
function formatPct(v: number | null) {
  return v != null ? `${(v * 100).toFixed(1)}%` : "—";
}

type LinhaProduto = {
  mes_referencia: string;
  novos_clientes: number;
  clientes_ativos: number;
  churn_pct: number | null;
  receita_bruta: number;
};

export default async function RelatoriosMensalPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string }>;
}) {
  const { cenario } = await searchParams;
  const supabase = await createClient();

  const { data: cenarios } = await supabase.from("cenarios").select("id, nome, is_base").order("created_at");
  const cenarioAtual = cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";

  const { data: produtos } = await supabase.from("produtos").select("id, nome").order("nome");

  const { data: simRaw } = cenarioAtual
    ? await supabase
        .from("simulacao_mensal")
        .select("produto_id, mes_referencia, novos_clientes, clientes_ativos, churn_pct, receita_bruta")
        .eq("cenario_id", cenarioAtual)
        .order("mes_referencia")
    : { data: [] };

  const porProduto = new Map<string, Map<string, LinhaProduto>>();
  const mesesSet = new Set<string>();
  for (const row of simRaw ?? []) {
    const mapaMes = porProduto.get(row.produto_id) ?? new Map<string, LinhaProduto>();
    mapaMes.set(row.mes_referencia, {
      mes_referencia: row.mes_referencia,
      novos_clientes: Number(row.novos_clientes),
      clientes_ativos: Number(row.clientes_ativos),
      churn_pct: row.churn_pct != null ? Number(row.churn_pct) : null,
      receita_bruta: Number(row.receita_bruta),
    });
    porProduto.set(row.produto_id, mapaMes);
    mesesSet.add(row.mes_referencia);
  }
  const meses = [...mesesSet].sort();

  const produtosComDados = (produtos ?? []).filter((p) => (porProduto.get(p.id)?.size ?? 0) > 0);

  const semDados = produtosComDados.length === 0;

  return (
    <div>
      <div className="mb-2">
        <Link href="/relatorios" className="text-[12.5px] text-text-muted">
          ← Relatórios
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Detalhamento Mensal</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Novos clientes, clientes ativos, churn e faturamento — por produto e consolidado
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <select name="cenario" defaultValue={cenarioAtual} className="input">
            {(cenarios ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
            Filtrar
          </button>
        </form>
      </div>

      {semDados ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-text-muted">
            Nenhuma projeção calculada nesse cenário ainda — recalcule em Produtos primeiro.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-text-muted">
                  <td rowSpan={2} className="px-2 py-1.5 align-bottom font-medium">
                    Mês
                  </td>
                  {produtosComDados.map((p) => (
                    <td key={p.id} colSpan={4} className="border-l border-border-soft px-2 py-1 text-center font-semibold text-text">
                      {p.nome}
                    </td>
                  ))}
                  <td colSpan={4} className="border-l-2 border-border px-2 py-1 text-center font-semibold text-primary-deep">
                    Consolidado
                  </td>
                </tr>
                <tr className="text-left text-text-muted">
                  {produtosComDados.map((p) => (
                    <Fragment key={p.id}>
                      <td className="border-l border-border-soft px-2 py-1 text-right">Novos</td>
                      <td className="px-2 py-1 text-right">Ativos</td>
                      <td className="px-2 py-1 text-right">Churn</td>
                      <td className="px-2 py-1 text-right">Faturamento</td>
                    </Fragment>
                  ))}
                  <td className="border-l-2 border-border px-2 py-1 text-right">Novos</td>
                  <td className="px-2 py-1 text-right">Ativos</td>
                  <td className="px-2 py-1 text-right">Churn</td>
                  <td className="px-2 py-1 text-right">Faturamento</td>
                </tr>
              </thead>
              <tbody>
                {meses.map((mes) => {
                  let novosCons = 0;
                  let ativosCons = 0;
                  let faturamentoCons = 0;
                  let churnPonderadoSoma = 0;
                  let churnPonderadoBase = 0;

                  const celulas = produtosComDados.map((p) => {
                    const l = porProduto.get(p.id)?.get(mes) ?? null;
                    if (l) {
                      novosCons += l.novos_clientes;
                      ativosCons += l.clientes_ativos;
                      faturamentoCons += l.receita_bruta;
                      if (l.churn_pct != null) {
                        churnPonderadoSoma += l.churn_pct * l.clientes_ativos;
                        churnPonderadoBase += l.clientes_ativos;
                      }
                    }
                    return { produtoId: p.id, l };
                  });

                  const churnCons = churnPonderadoBase > 0 ? churnPonderadoSoma / churnPonderadoBase : null;

                  return (
                    <tr key={mes} className="border-t border-border-soft">
                      <td className="px-2 py-1.5 capitalize">{formatMes(mes)}</td>
                      {celulas.map(({ produtoId, l }) => (
                        <Fragment key={produtoId}>
                          <td className="border-l border-border-soft px-2 py-1.5 text-right font-mono">
                            {l ? l.novos_clientes.toLocaleString("pt-BR") : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {l ? l.clientes_ativos.toLocaleString("pt-BR") : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">{l ? formatPct(l.churn_pct) : "—"}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{l ? formatBRL(l.receita_bruta) : "—"}</td>
                        </Fragment>
                      ))}
                      <td className="border-l-2 border-border px-2 py-1.5 text-right font-mono font-semibold">
                        {novosCons.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold">{ativosCons.toLocaleString("pt-BR")}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold">{formatPct(churnCons)}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold">{formatBRL(faturamentoCons)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
