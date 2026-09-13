"use client";

import { Fragment, useMemo, useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";

/** Uma linha por mês, já consolidada entre produtos, com cada tipo de custo em coluna própria. */
export type CogsProduto = {
  receita: number;
  clientes: number;
  infra: number;
  llm: number;
  suporteCs: number;
  gateway: number;
  implementacao: number;
};

export type LinhaCustos = {
  mes_referencia: string;
  receita: number;
  clientes: number;
  /** COGS de cada produto no mês (chave = produto_id) — pra aba COGS filtrar por produto. */
  cogsPorProduto?: Record<string, CogsProduto>;
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
  /** Alavancagem do produto: mídia do self-service + feiras/eventos/campanhas + marketing lançado. */
  marketing: number;
  equipeVariavel: number;
  // Fixos — estrutura
  equipeFixa: number;
  empresaGa: number;
  empresaPd: number;
  empresaSm: number;
  /** S&M fixo da empresa sem o que é marketing (esse vai pra coluna Marketing dos variáveis). */
  vendasFixo: number;
  impostos: number;
  // Marketing e vendas (S&M) — outra forma de ver os mesmos custos, por frente
  feiras: number;
  marketingLancado: number;
  equipeComercial: number;
  equipeSdr: number;
  equipeVendedor: number;
  equipeCoordenador: number;
  vendasLancado: number;
  marca: number;
};

type Coluna = {
  chave: keyof LinhaCustos;
  label: string;
  tooltip: string;
  foraDoTotal?: boolean;
};

const VARIAVEIS: Coluna[] = [
  {
    chave: "infra",
    label: "Infra",
    tooltip:
      "1.1.1 — base da plataforma em degraus + incremento por cliente (regras de COGS).",
  },
  {
    chave: "llm",
    label: "LLM",
    tooltip: "1.1.2 — tokens × preço, só clientes do nível com IA.",
  },
  {
    chave: "suporteCs",
    label: "Suporte + CS",
    tooltip: "1.1.3 — horas por cliente × custo/hora, pelas regras de COGS.",
  },
  {
    chave: "gateway",
    label: "Gateway",
    tooltip:
      "1.1.5 — Asaas: % + fixo por cobrança, no mix de meios do produto.",
  },
  {
    chave: "implementacao",
    label: "Implantação",
    tooltip:
      "1.1.6 — custo das etapas de implementação por cliente novo (e outros COGS lançados no plano da fase).",
  },
  {
    chave: "empresaCogs",
    label: "COGS da empresa",
    tooltip:
      "Custos da empresa lançados em contas 1.1.x (ex: infra compartilhada no card CSP, modo Compartilhado).",
  },
  {
    chave: "parceiros",
    label: "Parceiros",
    tooltip:
      "S&M — fechamento, comissão e crédito ao parceiro (canais representante/associação).",
  },
  {
    chave: "marketing",
    label: "Marketing",
    tooltip:
      "Investimento em alavancagem do produto: mídia do self-service + feiras, eventos e campanhas + custos lançados no card Marketing (2.1.1 mídia, 2.1.2 agências, 2.1.3 conteúdo, 2.1.8 feiras, 2.1.9 RP). O detalhe por frente está na aba Marketing e vendas.",
  },
  {
    chave: "equipeVariavel",
    label: "Equipe p/ demanda",
    tooltip:
      "Alocações PJ/agência/bot cobradas pelo volume do mês (SDR, vendedor). A alocação de Suporte não soma aqui: o custo de suporte vem das regras de COGS (coluna Suporte + CS).",
  },
];
const FIXOS: Coluna[] = [
  {
    chave: "equipeFixa",
    label: "Equipe CLT",
    tooltip: "Alocações CLT e pacote fechado — custo independe do volume.",
  },
  {
    chave: "empresaGa",
    label: "G&A",
    tooltip:
      "Custos da empresa em G&A: jurídico, contador, filiações, software adm, assistente.",
  },
  {
    chave: "empresaPd",
    label: "P&D",
    tooltip: "Custos da empresa em P&D: ferramentas e licenças.",
  },
  {
    chave: "vendasFixo",
    label: "Vendas fixo",
    tooltip:
      "Custos fixos de vendas lançados pela empresa (CRM, ferramentas, parcerias — ex: Linktree). Marketing, feiras e eventos saem na coluna Marketing dos variáveis.",
  },
  {
    chave: "impostos",
    label: "Impostos",
    tooltip:
      "Impostos sobre a receita: DAS enquanto está no Simples; depois de passar de R$ 4,8 mi/ano, ISS + PIS/COFINS ou CBS/IBS líquidos de crédito. IRPJ/CSLL do lucro presumido ficam fora (abaixo do EBITDA).",
  },
];

const SM: Coluna[] = [
  {
    chave: "midia",
    label: "Mídia self-service",
    tooltip:
      "Impulsionamento do teste grátis (testes × custo por teste), dos canais self-service em Vendas.",
  },
  {
    chave: "feiras",
    label: "Feiras e eventos",
    tooltip:
      "Feiras e eventos cadastrados no card Marketing do Plano de Custos.",
  },
  {
    chave: "marketingLancado",
    label: "Marketing lançado",
    tooltip:
      "Custos lançados no card Marketing (contas 2.1.1 mídia, 2.1.2 agências, 2.1.3 conteúdo, 2.1.8 feiras, 2.1.9 RP).",
  },
  {
    chave: "parceiros",
    label: "Parceiros",
    tooltip:
      "Fechamento, comissão e crédito pagos a representantes e associações (Vendas → Canais).",
  },
  {
    chave: "equipeSdr",
    label: "SDR",
    tooltip:
      "SDR alocado em Necessidade de Contratação — ex: SDR PJ no Mind (por reunião) e SDR as a Service (bot) no Price e no Skills (por lead).",
  },
  {
    chave: "equipeVendedor",
    label: "Vendedor",
    tooltip:
      "Vendedor alocado: fixo por pessoa + valor por venda + comissão, só sobre as vendas que passam por reunião.",
  },
  {
    chave: "equipeCoordenador",
    label: "Coordenador e outros",
    tooltip:
      "Coordenador comercial e outros cargos de S&M alocados em Necessidade de Contratação.",
  },
  {
    chave: "vendasLancado",
    label: "Vendas lançado",
    tooltip:
      "Custos lançados no card Vendas (2.1.6 CRM, 2.1.7 parcerias, 2.1.4/2.1.5 pessoal e comissões) e outros S&M dos produtos.",
  },
  {
    chave: "marca",
    label: "Marca (em G&A)",
    tooltip:
      "Custos de Marca (contas 2.4.x). No plano eles contam em G&A, não em S&M — por isso ficam fora do total e do CAC. Se for gasto de aquisição, lance numa conta 2.1.x.",
    foraDoTotal: true,
  },
];

const brl = (v: number) =>
  v === 0
    ? "—"
    : v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      });
const mes = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });

const COGS: Coluna[] = VARIAVEIS.filter((c) =>
  [
    "infra",
    "llm",
    "suporteCs",
    "gateway",
    "implementacao",
    "empresaCogs",
  ].includes(c.chave),
);
const PD: Coluna[] = [
  {
    chave: "empresaPd",
    label: "P&D",
    tooltip:
      "Custos da empresa em P&D (2.2.x): equipe técnica, Centelha, ferramentas e licenças.",
  },
];
const GA: Coluna[] = [
  {
    chave: "empresaGa",
    label: "G&A",
    tooltip:
      "Custos da empresa em G&A (2.3.x): pró-labore, contador, jurídico, filiações, software adm, assistente.",
  },
  {
    chave: "marca",
    label: "Marca",
    tooltip: "Custos de Marca (2.4.x) — contam em G&A no plano.",
  },
];

type Aba = "resumo" | "cogs" | "sm" | "pd" | "ga" | "variaveis" | "fixos";
const ABAS: { id: Aba; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "cogs", label: "COGS" },
  { id: "sm", label: "S&M" },
  { id: "pd", label: "P&D" },
  { id: "ga", label: "G&A" },
  { id: "variaveis", label: "Variáveis" },
  { id: "fixos", label: "Fixos" },
];

const somaColunas = (l: LinhaCustos, cols: Coluna[]) =>
  cols
    .filter((c) => !c.foraDoTotal)
    .reduce((s, c) => s + (l[c.chave] as number), 0);

/** Totais por grupo do plano de contas — é a aba Resumo e o "% da receita" de cada grupo. */
function grupos(l: LinhaCustos) {
  const cogs = somaColunas(l, COGS);
  const sm = somaColunas(l, SM);
  const pd = l.empresaPd;
  const ga = l.empresaGa + l.marca;
  return {
    cogs,
    sm,
    pd,
    ga,
    impostos: l.impostos,
    total: cogs + sm + pd + ga + l.impostos,
  };
}

const RESUMO: {
  chave: keyof ReturnType<typeof grupos>;
  label: string;
  tooltip: string;
}[] = [
  {
    chave: "cogs",
    label: "COGS",
    tooltip: "Infra, LLM, suporte/CS, gateway, implantação e COGS da empresa.",
  },
  {
    chave: "sm",
    label: "S&M",
    tooltip:
      "Mídia, feiras, marketing lançado, parceiros, equipe comercial e vendas lançado.",
  },
  { chave: "pd", label: "P&D", tooltip: "Custos da empresa em P&D." },
  { chave: "ga", label: "G&A", tooltip: "Custos da empresa em G&A e Marca." },
  {
    chave: "impostos",
    label: "Impostos",
    tooltip:
      "Impostos sobre a receita (DAS; depois ISS + PIS/COFINS ou CBS/IBS).",
  },
];

/** Soma um ano de linhas; clientes = fim do ano. */
function somarAno(acc: LinhaCustos[]): LinhaCustos {
  const soma = acc.reduce(
    (s, l) => {
      const sr = s as unknown as Record<string, number>;
      for (const k of Object.keys(l) as (keyof LinhaCustos)[]) {
        if (k === "mes_referencia" || k === "cogsPorProduto") continue;
        sr[k] = (sr[k] ?? 0) + (l[k] as number);
      }
      return s;
    },
    { mes_referencia: acc[0].mes_referencia } as LinhaCustos,
  );
  soma.clientes = acc[acc.length - 1].clientes;
  // COGS por produto também soma no ano (clientes = fim do ano).
  const porProduto: Record<string, CogsProduto> = {};
  for (const l of acc) {
    for (const [pid, c] of Object.entries(l.cogsPorProduto ?? {})) {
      const p = porProduto[pid] ?? {
        receita: 0,
        clientes: 0,
        infra: 0,
        llm: 0,
        suporteCs: 0,
        gateway: 0,
        implementacao: 0,
      };
      p.receita += c.receita;
      p.infra += c.infra;
      p.llm += c.llm;
      p.suporteCs += c.suporteCs;
      p.gateway += c.gateway;
      p.implementacao += c.implementacao;
      p.clientes = c.clientes;
      porProduto[pid] = p;
    }
  }
  soma.cogsPorProduto = porProduto;
  return soma;
}

/** Aba COGS filtrada num produto: a linha passa a carregar só o que é dele. */
function filtrarProduto(l: LinhaCustos, produtoId: string): LinhaCustos {
  const c = l.cogsPorProduto?.[produtoId];
  return {
    ...l,
    receita: c?.receita ?? 0,
    clientes: c?.clientes ?? 0,
    infra: c?.infra ?? 0,
    llm: c?.llm ?? 0,
    suporteCs: c?.suporteCs ?? 0,
    gateway: c?.gateway ?? 0,
    implementacao: c?.implementacao ?? 0,
    empresaCogs: 0,
  };
}

/**
 * Ano a ano por padrão; o ano abre pra mostrar os meses. Abas por grupo do plano de contas,
 * com a aba COGS filtrável por produto — o mesmo desenho da projeção de vendas.
 */
export function TabelaCustos({
  linhas,
  cenarioId,
  produtos = [],
}: {
  linhas: LinhaCustos[];
  cenarioId: string;
  produtos?: { id: string; nome: string }[];
}) {
  const [aba, setAba] = useState<Aba>("resumo");
  const [produtoCogs, setProdutoCogs] = useState<string>("todos");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const colunas: Coluna[] =
    aba === "cogs"
      ? produtoCogs === "todos"
        ? COGS
        : COGS.filter((c) => c.chave !== "empresaCogs")
      : aba === "sm"
        ? SM
        : aba === "pd"
          ? PD
          : aba === "ga"
            ? GA
            : aba === "variaveis"
              ? VARIAVEIS
              : aba === "fixos"
                ? FIXOS
                : [];

  const anos = useMemo(() => {
    const base =
      aba === "cogs" && produtoCogs !== "todos"
        ? linhas.map((l) => filtrarProduto(l, produtoCogs))
        : linhas;
    const out: { ano: string; meses: LinhaCustos[]; soma: LinhaCustos }[] = [];
    let acc: LinhaCustos[] = [];
    const fechar = () => {
      if (!acc.length) return;
      out.push({
        ano: acc[0].mes_referencia.slice(0, 4),
        meses: acc,
        soma: somarAno(acc),
      });
      acc = [];
    };
    for (const l of base) {
      if (
        acc.length &&
        l.mes_referencia.slice(0, 4) !== acc[0].mes_referencia.slice(0, 4)
      )
        fechar();
      acc.push(l);
    }
    fechar();
    return out;
  }, [linhas, aba, produtoCogs]);

  const alternarAno = (ano: string) =>
    setAbertos((prev) => {
      const n = new Set(prev);
      if (n.has(ano)) n.delete(ano);
      else n.add(ano);
      return n;
    });
  const todosAbertos = anos.length > 0 && anos.every((a) => abertos.has(a.ano));

  const total = (l: LinhaCustos) =>
    aba === "resumo" ? grupos(l).total : somaColunas(l, colunas);
  const rotuloTotal = {
    resumo: "Total",
    cogs: "Total COGS",
    sm: "Total S&M",
    pd: "Total P&D",
    ga: "Total G&A",
    variaveis: "Total variável",
    fixos: "Total fixo",
  }[aba];
  const cabecalhos: { label: string; tooltip: string; faint?: boolean }[] =
    aba === "resumo"
      ? RESUMO.map((c) => ({ label: c.label, tooltip: c.tooltip }))
      : colunas
          .filter((c) => !c.foraDoTotal)
          .map((c) => ({ label: c.label, tooltip: c.tooltip }));
  const valores = (l: LinhaCustos): number[] =>
    aba === "resumo"
      ? RESUMO.map((c) => grupos(l)[c.chave])
      : colunas.filter((c) => !c.foraDoTotal).map((c) => l[c.chave] as number);
  const foraDoTotal = colunas.filter((c) => c.foraDoTotal);

  const celulas = (l: LinhaCustos, ano: boolean) => {
    const t = total(l);
    const pct = l.receita > 0 ? (t / l.receita) * 100 : null;
    return (
      <>
        <td className="px-2 py-1.5 text-right font-mono">{l.clientes}</td>
        <td className="px-2 py-1.5 text-right font-mono">{brl(l.receita)}</td>
        {valores(l).map((v, i) => (
          <td
            key={i}
            className={`px-2 py-1.5 text-right font-mono ${ano ? "" : "text-text-muted"}`}
          >
            {brl(v)}
          </td>
        ))}
        <td className="px-2 py-1.5 text-right font-mono font-semibold">
          {brl(t)}
        </td>
        <td
          className={`px-2 py-1.5 text-right font-mono ${pct != null && pct > 100 ? "text-danger" : "text-text-muted"}`}
        >
          {pct != null ? `${pct.toFixed(0)}%` : "—"}
        </td>
        {foraDoTotal.map((c) => (
          <td
            key={c.chave}
            className="border-l border-border-soft px-2 py-1.5 text-right font-mono text-text-faint"
          >
            {brl(l[c.chave] as number)}
          </td>
        ))}
      </>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <h2 className="flex items-center font-heading text-[13px] font-semibold">
          Custos ano a ano
          <InfoTooltip texto="Consolidado entre produtos, por grupo do plano de contas. Clique no ano pra abrir os meses. A aba COGS filtra por produto; Variáveis e Fixos são a mesma conta vista por natureza (escala com clientes/receita × estrutura)." />
          <button
            type="button"
            onClick={() =>
              setAbertos(
                todosAbertos ? new Set() : new Set(anos.map((a) => a.ano)),
              )
            }
            className="ml-3 text-[11px] font-normal text-primary-deep underline decoration-dotted"
          >
            {todosAbertos ? "recolher meses" : "abrir todos os meses"}
          </button>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {aba === "cogs" && produtos.length > 0 && (
            <div className="flex gap-1 rounded-lg bg-bg p-1">
              {[{ id: "todos", nome: "Todos" }, ...produtos].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProdutoCogs(p.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${produtoCogs === p.id ? "bg-surface shadow-sm" : "text-text-muted"}`}
                >
                  {p.nome}
                </button>
              ))}
            </div>
          )}
          <a
            href={`/plano/${cenarioId}/custos/export`}
            className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-primary-deep hover:bg-bg"
          >
            Exportar Excel
          </a>
          <div className="flex gap-1 rounded-lg bg-bg p-1">
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAba(a.id)}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium ${aba === a.id ? "bg-surface shadow-sm" : "text-text-muted"}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="px-4 pb-4 text-[12px] text-text-faint">
          Sem projeção ainda — recalcule a simulação em Produtos.
        </p>
      ) : (
        <div className="max-h-[600px] overflow-auto border-t border-border-soft">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-[1] bg-surface">
              <tr className="text-left text-[9.5px] uppercase tracking-wide text-text-faint">
                <th className="px-2 py-1.5 font-medium">Ano / mês</th>
                <th className="px-2 py-1.5 text-right font-medium">Clientes</th>
                <th className="px-2 py-1.5 text-right font-medium">Receita</th>
                {cabecalhos.map((c) => (
                  <th
                    key={c.label}
                    className="px-2 py-1.5 text-right font-medium"
                  >
                    <span className="flex items-center justify-end">
                      {c.label}
                      <InfoTooltip texto={c.tooltip} />
                    </span>
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right font-medium">
                  {rotuloTotal}
                </th>
                <th className="px-2 py-1.5 text-right font-medium">
                  % da receita
                </th>
                {foraDoTotal.map((c) => (
                  <th
                    key={c.chave}
                    className="border-l border-border-soft px-2 py-1.5 text-right font-medium text-text-faint"
                  >
                    <span className="flex items-center justify-end">
                      {c.label}
                      <InfoTooltip texto={c.tooltip} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {anos.map((a) => {
                const aberto = abertos.has(a.ano);
                return (
                  <Fragment key={a.ano}>
                    <tr
                      onClick={() => alternarAno(a.ano)}
                      className="cursor-pointer border-t-2 border-border bg-bg text-[11.5px] font-semibold hover:bg-primary-soft/40"
                    >
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <span className="mr-1.5 inline-block text-[9px] text-text-faint">
                          {aberto ? "▼" : "▶"}
                        </span>
                        {a.ano}
                        {a.meses.length !== 12 && (
                          <span className="ml-1 text-[9px] font-normal text-text-faint">
                            ({a.meses.length} meses)
                          </span>
                        )}
                      </td>
                      {celulas(a.soma, true)}
                    </tr>
                    {aberto &&
                      a.meses.map((l) => (
                        <tr
                          key={l.mes_referencia}
                          className="border-t border-border-soft text-[11.5px]"
                        >
                          <td className="whitespace-nowrap px-2 py-1.5 pl-6 capitalize">
                            {mes(l.mes_referencia)}
                          </td>
                          {celulas(l, false)}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
