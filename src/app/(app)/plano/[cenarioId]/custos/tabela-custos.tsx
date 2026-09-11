"use client";

import { useMemo, useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";

/** Uma linha por mês, já consolidada entre produtos, com cada tipo de custo em coluna própria. */
export type LinhaCustos = {
  mes_referencia: string;
  receita: number;
  clientes: number;
  // Variáveis — escalam com clientes, receita ou vendas
  infra: number;
  llm: number;
  suporteCs: number;
  gateway: number;
  implementacao: number;
  /** Custos da empresa lançados em contas de COGS (1.1.x), ex: infra compartilhada. */
  empresaCogs: number;
  parceiros: number;
  midia: number;
  equipeVariavel: number;
  // Fixos — estrutura
  equipeFixa: number;
  empresaGa: number;
  empresaPd: number;
  empresaSm: number;
  impostos: number;
  // Marketing e vendas (S&M) — outra forma de ver os mesmos custos, por frente
  feiras: number;
  marketingLancado: number;
  equipeComercial: number;
  vendasLancado: number;
  marca: number;
};

type Coluna = { chave: keyof LinhaCustos; label: string; tooltip: string; foraDoTotal?: boolean };

const VARIAVEIS: Coluna[] = [
  { chave: "infra", label: "Infra", tooltip: "1.1.1 — base da plataforma em degraus + incremento por cliente (regras de COGS)." },
  { chave: "llm", label: "LLM", tooltip: "1.1.2 — tokens × preço, só clientes do nível com IA." },
  { chave: "suporteCs", label: "Suporte + CS", tooltip: "1.1.3 — horas por cliente × custo/hora, pelas regras de COGS." },
  { chave: "gateway", label: "Gateway", tooltip: "1.1.5 — Asaas: % + fixo por cobrança, no mix de meios do produto." },
  { chave: "implementacao", label: "Implantação", tooltip: "1.1.6 — custo das etapas de implementação por cliente novo (e outros COGS lançados no plano da fase)." },
  { chave: "empresaCogs", label: "COGS da empresa", tooltip: "Custos da empresa lançados em contas 1.1.x (ex: infra compartilhada no card CSP, modo Compartilhado)." },
  { chave: "parceiros", label: "Parceiros", tooltip: "S&M — fechamento, comissão e crédito ao parceiro (canais representante/associação)." },
  { chave: "midia", label: "Mídia", tooltip: "S&M — impulsionamento do self-service (testes × custo por teste)." },
  { chave: "equipeVariavel", label: "Equipe p/ demanda", tooltip: "Alocações PJ/agência/bot cobradas pelo volume do mês (SDR, vendedor). A alocação de Suporte não soma aqui: o custo de suporte vem das regras de COGS (coluna Suporte + CS)." },
];
const FIXOS: Coluna[] = [
  { chave: "equipeFixa", label: "Equipe CLT", tooltip: "Alocações CLT e pacote fechado — custo independe do volume." },
  { chave: "empresaGa", label: "G&A", tooltip: "Custos da empresa em G&A: jurídico, contador, filiações, software adm, assistente." },
  { chave: "empresaPd", label: "P&D", tooltip: "Custos da empresa em P&D: ferramentas e licenças." },
  { chave: "empresaSm", label: "S&M fixo", tooltip: "Custos da empresa em S&M lançados como fixos (ex: Linktree)." },
  { chave: "impostos", label: "Impostos", tooltip: "Simples Nacional sobre a receita do mês." },
];

const SM: Coluna[] = [
  { chave: "midia", label: "Mídia self-service", tooltip: "Impulsionamento do teste grátis (testes × custo por teste), dos canais self-service em Vendas." },
  { chave: "feiras", label: "Feiras e eventos", tooltip: "Feiras e eventos cadastrados no card Marketing do Plano de Custos." },
  { chave: "marketingLancado", label: "Marketing lançado", tooltip: "Custos lançados no card Marketing (contas 2.1.1 mídia, 2.1.2 agências, 2.1.3 conteúdo, 2.1.8 feiras, 2.1.9 RP)." },
  { chave: "parceiros", label: "Parceiros", tooltip: "Fechamento, comissão e crédito pagos a representantes e associações (Vendas → Canais)." },
  { chave: "equipeComercial", label: "Equipe comercial", tooltip: "SDR, vendedor e coordenador alocados em Necessidade de Contratação." },
  { chave: "vendasLancado", label: "Vendas lançado", tooltip: "Custos lançados no card Vendas (2.1.6 CRM, 2.1.7 parcerias, 2.1.4/2.1.5 pessoal e comissões) e outros S&M dos produtos." },
  { chave: "marca", label: "Marca (em G&A)", tooltip: "Custos de Marca (contas 2.4.x). No plano eles contam em G&A, não em S&M — por isso ficam fora do total e do CAC. Se for gasto de aquisição, lance numa conta 2.1.x.", foraDoTotal: true },
];

const brl = (v: number) => (v === 0 ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const mes = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

export function TabelaCustos({ linhas, cenarioId }: { linhas: LinhaCustos[]; cenarioId: string }) {
  const [aba, setAba] = useState<"variaveis" | "fixos" | "sm">("variaveis");
  const colunas = aba === "variaveis" ? VARIAVEIS : aba === "fixos" ? FIXOS : SM;

  // Fechamento de ano intercalado, como na tabela de vendas — com a contagem de meses.
  const comAnos = useMemo(() => {
    const out: ({ tipo: "mes"; l: LinhaCustos } | { tipo: "ano"; ano: string; meses: number; soma: LinhaCustos })[] = [];
    let acc: LinhaCustos[] = [];
    const fechar = () => {
      if (!acc.length) return;
      const soma = acc.reduce((s, l) => {
        const sr = s as unknown as Record<string, number>;
        for (const k of Object.keys(l) as (keyof LinhaCustos)[]) {
          if (k !== "mes_referencia") sr[k] = (sr[k] ?? 0) + (l[k] as number);
        }
        return s;
      }, { mes_referencia: acc[0].mes_referencia } as LinhaCustos);
      soma.clientes = acc[acc.length - 1].clientes;
      out.push({ tipo: "ano", ano: acc[0].mes_referencia.slice(0, 4), meses: acc.length, soma });
      acc = [];
    };
    for (const l of linhas) {
      if (acc.length && l.mes_referencia.slice(0, 4) !== acc[0].mes_referencia.slice(0, 4)) fechar();
      out.push({ tipo: "mes", l });
      acc.push(l);
    }
    fechar();
    return out;
  }, [linhas]);

  const total = (l: LinhaCustos) => colunas.filter((c) => !c.foraDoTotal).reduce((s, c) => s + (l[c.chave] as number), 0);
  const rotuloTotal = aba === "variaveis" ? "Total variável" : aba === "fixos" ? "Total fixo" : "Total S&M";

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center font-heading text-[13px] font-semibold">
          Projeção de custos
          <InfoTooltip texto="Mês a mês, consolidado entre produtos: a receita e cada tipo de custo em coluna própria. Variáveis escalam com clientes, receita ou vendas; fixos são estrutura. É aqui que a progressão configurada nos cards aparece acontecendo." />
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] text-text-faint">
            O que entra em:{" "}
            {(["cogs", "sm", "pd", "ga"] as const).map((g, i) => (
              <span key={g}>
                {i > 0 && " · "}
                <a href={`/plano/${cenarioId}/indicadores/${g}`} className="text-primary-deep underline decoration-dotted">
                  {{ cogs: "COGS", sm: "S&M", pd: "P&D", ga: "G&A" }[g]}
                </a>
              </span>
            ))}
          </span>
          <a href={`/plano/${cenarioId}/custos/export`} className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-primary-deep hover:bg-bg">
            Exportar Excel
          </a>
        <div className="flex gap-1 rounded-lg bg-bg p-1">
          {(["variaveis", "fixos", "sm"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAba(a)}
              className={`rounded-md px-3 py-1 text-[11.5px] font-medium ${aba === a ? "bg-surface shadow-sm" : "text-text-muted"}`}
            >
              {a === "variaveis" ? "Variáveis" : a === "fixos" ? "Fixos" : "Marketing e vendas"}
            </button>
          ))}
        </div>
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="text-[12px] text-text-faint">Sem projeção ainda — recalcule a simulação em Produtos.</p>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-[9.5px] uppercase tracking-wide text-text-faint">
                <th className="px-2 py-1.5 font-medium">Mês</th>
                <th className="px-2 py-1.5 text-right font-medium">Clientes</th>
                <th className="px-2 py-1.5 text-right font-medium">Receita</th>
                {colunas.filter((c) => !c.foraDoTotal).map((c) => (
                  <th key={c.chave} className="px-2 py-1.5 text-right font-medium">
                    <span className="flex items-center justify-end">
                      {c.label}
                      <InfoTooltip texto={c.tooltip} />
                    </span>
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right font-medium">{rotuloTotal}</th>
                <th className="px-2 py-1.5 text-right font-medium">% da receita</th>
                {colunas.filter((c) => c.foraDoTotal).map((c) => (
                  <th key={c.chave} className="border-l border-border-soft px-2 py-1.5 text-right font-medium text-text-faint">
                    <span className="flex items-center justify-end">
                      {c.label}
                      <InfoTooltip texto={c.tooltip} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comAnos.map((item) => {
                const l = item.tipo === "mes" ? item.l : item.soma;
                const t = total(l);
                const pct = l.receita > 0 ? (t / l.receita) * 100 : null;
                const ano = item.tipo === "ano";
                return (
                  <tr
                    key={ano ? `ano-${item.ano}` : l.mes_referencia}
                    className={ano ? "border-t-2 border-border bg-bg text-[11.5px] font-semibold" : "border-t border-border-soft text-[11.5px]"}
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 capitalize">
                      {ano ? (
                        <>
                          {item.ano}
                          {item.meses !== 12 && <span className="ml-1 text-[9px] font-normal text-text-faint">({item.meses} meses)</span>}
                        </>
                      ) : (
                        mes(l.mes_referencia)
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.clientes}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{brl(l.receita)}</td>
                    {colunas.filter((c) => !c.foraDoTotal).map((c) => (
                      <td key={c.chave} className="px-2 py-1.5 text-right font-mono text-text-muted">
                        {brl(l[c.chave] as number)}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-mono">{brl(t)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-text-muted">{pct != null ? `${pct.toFixed(0)}%` : "—"}</td>
                    {colunas.filter((c) => c.foraDoTotal).map((c) => (
                      <td key={c.chave} className="border-l border-border-soft px-2 py-1.5 text-right font-mono text-text-faint">
                        {brl(l[c.chave] as number)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
