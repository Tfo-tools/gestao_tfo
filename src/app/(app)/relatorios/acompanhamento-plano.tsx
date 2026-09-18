import Link from "next/link";
import { somar, type MesAcompanhamento, type Valores } from "@/lib/acompanhamento-plano";
import { SecaoRecolhivel } from "@/components/secao-recolhivel";

/**
 * Realizado × plano, mês a mês. Mês fechado no Extrato = realizado, comparado com o plano guardado
 * no fechamento; mês que já começou mas não fechou = "em aberto" (realizado parcial); futuro = plano.
 * Os anos depois dos próximos meses aparecem resumidos, só com o plano — o que importa acompanhar
 * de perto é o que está acontecendo agora.
 */

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
const custos = (v: Valores) => v.impostos + v.cogs + v.sm + v.pd + v.ga;

function Delta({ real, plano, maiorPior }: { real: number; plano: number; maiorPior: boolean }) {
  const d = real - plano;
  if (Math.abs(d) < 1) return <span className="text-text-faint">—</span>;
  const ruim = maiorPior ? d > 0 : d < 0;
  return (
    <span className={ruim ? "text-danger" : "text-success"}>
      {d > 0 ? "+" : "−"}
      {brl(Math.abs(d))}
    </span>
  );
}

const SELO: Record<MesAcompanhamento["status"], { texto: string; classe: string }> = {
  realizado: { texto: "realizado", classe: "bg-success-soft text-success" },
  aberto: { texto: "em aberto", classe: "bg-warning-soft text-warning" },
  plano: { texto: "plano", classe: "bg-bg text-text-muted" },
};

export function AcompanhamentoPlano({
  nomeCenario,
  meses,
  ultimoFechado,
  mesAtual,
  seletor,
}: {
  nomeCenario: string;
  meses: MesAcompanhamento[];
  ultimoFechado: string | null;
  /** AAAA-MM-01 */
  mesAtual: string;
  /** Opcional: seletor de cenário (Prestação de Contas). Em Relatórios é sempre o Base. */
  seletor?: React.ReactNode;
}) {
  const fechados = meses.filter((m) => m.status === "realizado");
  const planoFechados = somar(fechados.map((m) => m.plano));
  const realFechados = somar(fechados.map((m) => m.real!));

  // Mês a mês até o mês atual + 3; depois, um total por ano (só plano).
  const limiteDetalhe = (() => {
    const [a, m] = mesAtual.split("-").map(Number);
    const alvo = m + 3;
    return `${a + Math.floor((alvo - 1) / 12)}-${String(((alvo - 1) % 12) + 1).padStart(2, "0")}-01`;
  })();
  const detalhados = meses.filter((m) => m.mes <= limiteDetalhe);
  const futurosPorAno = new Map<string, Valores[]>();
  for (const m of meses.filter((m) => m.mes > limiteDetalhe)) {
    const ano = m.mes.slice(0, 4);
    futurosPorAno.set(ano, [...(futurosPorAno.get(ano) ?? []), m.plano]);
  }

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-semibold">Acompanhamento do plano — {nomeCenario}</h2>
        {seletor}
      </div>
      <p className="mb-4 text-[11px] text-text-muted">
        {ultimoFechado
          ? `Realizado até ${rotuloMes(ultimoFechado)} (meses fechados no Extrato); plano daí em diante.`
          : "Nenhum mês fechado ainda — "}
        {!ultimoFechado && (
          <>
            feche os meses em{" "}
            <Link href="/custos/extrato" className="underline">
              Custos → Extrato
            </Link>{" "}
            para virarem realizado.
          </>
        )}{" "}
        Mês fechado é comparado com o plano guardado no fechamento, mesmo que o plano seja revisado depois.
      </p>

      {fechados.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Resumo rotulo="Custos realizados" valor={brl(custos(realFechados))} detalhe={`plano ${brl(custos(planoFechados))}`} />
          <Resumo
            rotulo="Diferença nos custos"
            valor={<Delta real={custos(realFechados)} plano={custos(planoFechados)} maiorPior />}
            detalhe={`${fechados.length} ${fechados.length === 1 ? "mês fechado" : "meses fechados"}`}
          />
          <Resumo rotulo="EBITDA realizado" valor={brl(realFechados.ebitda)} detalhe={`plano ${brl(planoFechados.ebitda)}`} />
          <Resumo rotulo="Diferença no EBITDA" valor={<Delta real={realFechados.ebitda} plano={planoFechados.ebitda} maiorPior={false} />} detalhe="realizado − plano" />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[10.5px] text-text-faint">
              <th className="px-2 pb-1.5 font-medium">Mês</th>
              <th className="px-2 pb-1.5 text-right font-medium">Receita plano</th>
              <th className="px-2 pb-1.5 text-right font-medium">Receita real</th>
              <th className="px-2 pb-1.5 text-right font-medium">Custos plano</th>
              <th className="px-2 pb-1.5 text-right font-medium">Custos real</th>
              <th className="px-2 pb-1.5 text-right font-medium">Δ custos</th>
              <th className="px-2 pb-1.5 text-right font-medium">EBITDA plano</th>
              <th className="px-2 pb-1.5 text-right font-medium">EBITDA real</th>
            </tr>
          </thead>
          <tbody>
            {detalhados.map((m) => (
              <tr key={m.mes} className={`border-t border-border-soft ${m.mes === mesAtual ? "bg-bg" : ""}`}>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <span className="font-mono">{rotuloMes(m.mes)}</span>
                  <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${SELO[m.status].classe}`}>{SELO[m.status].texto}</span>
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-text-muted">{brl(m.plano.receita)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{m.real ? brl(m.real.receita) : ""}</td>
                <td className="px-2 py-1.5 text-right font-mono text-text-muted">{brl(custos(m.plano))}</td>
                <td className="px-2 py-1.5 text-right font-mono">{m.real ? brl(custos(m.real)) : ""}</td>
                <td className="px-2 py-1.5 text-right font-mono">{m.real ? <Delta real={custos(m.real)} plano={custos(m.plano)} maiorPior /> : ""}</td>
                <td className="px-2 py-1.5 text-right font-mono text-text-muted">{brl(m.plano.ebitda)}</td>
                <td className={`px-2 py-1.5 text-right font-mono ${m.real && m.real.ebitda < 0 ? "text-danger" : ""}`}>{m.real ? brl(m.real.ebitda) : ""}</td>
              </tr>
            ))}
            {[...futurosPorAno.entries()].map(([ano, lista]) => {
              const s = somar(lista);
              return (
                <tr key={ano} className="border-t border-border-soft text-text-muted">
                  <td className="px-2 py-1.5">
                    <span className="font-mono">{ano}</span>
                    <span className="ml-1.5 rounded bg-bg px-1.5 py-0.5 text-[9.5px] font-semibold">plano · {lista.length} meses</span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{brl(s.receita)}</td>
                  <td />
                  <td className="px-2 py-1.5 text-right font-mono">{brl(custos(s))}</td>
                  <td />
                  <td />
                  <td className="px-2 py-1.5 text-right font-mono">{brl(s.ebitda)}</td>
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {fechados.length > 0 && (
        <div className="mt-4">
          <SecaoRecolhivel titulo="Por grupo, nos meses fechados" resumo="onde o realizado se afastou do plano">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] text-text-faint">
                  <th className="px-4 py-1.5 font-medium">Grupo</th>
                  <th className="px-2 py-1.5 text-right font-medium">Plano</th>
                  <th className="px-2 py-1.5 text-right font-medium">Realizado</th>
                  <th className="px-4 py-1.5 text-right font-medium">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Receita", "receita", false],
                    ["Impostos sobre a receita", "impostos", true],
                    ["COGS", "cogs", true],
                    ["Vendas e marketing (S&M)", "sm", true],
                    ["Produto e tecnologia (P&D)", "pd", true],
                    ["Geral e administrativo (G&A) — inclui Marca", "ga", true],
                  ] as [string, keyof Valores, boolean][]
                ).map(([rotulo, k, maiorPior]) => (
                  <tr key={k} className="border-t border-border-soft">
                    <td className="px-4 py-1.5">{rotulo}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-text-muted">{brl(planoFechados[k])}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{brl(realFechados[k])}</td>
                    <td className="px-4 py-1.5 text-right font-mono">
                      <Delta real={realFechados[k]} plano={planoFechados[k]} maiorPior={maiorPior} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 pb-3 pt-1 text-[10.5px] text-text-faint">
              Marca (contas 2.4) entra em G&amp;A aqui porque é onde o plano a coloca — a simulação ainda não tem linha própria de Marca.
              Receita real aparece quando a integração com o site estiver ligada.
            </p>
          </SecaoRecolhivel>
        </div>
      )}
    </div>
  );
}

function Resumo({ rotulo, valor, detalhe }: { rotulo: string; valor: React.ReactNode; detalhe: string }) {
  return (
    <div className="rounded-lg bg-bg px-3 py-2.5">
      <div className="text-[10.5px] text-text-faint">{rotulo}</div>
      <div className="font-mono text-[15px] font-semibold">{valor}</div>
      <div className="text-[10.5px] text-text-faint">{detalhe}</div>
    </div>
  );
}
