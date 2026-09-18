import type { ExecucaoPrograma } from "@/lib/execucao-programa";

/**
 * Para o quê foi direcionado cada programa, por conta do plano de contas (não por rubrica — as
 * rubricas ficam na prestação de contas). Não é temporal: cada barra é o previsto da conta, e o
 * pedaço que já entrou na despesa fica em vinho apagado, o que falta usar fica no azul.
 *
 * Forma de ÊNFASE, não de categorias: o disponível em destaque, o consumido recolhido — por isso o
 * vinho é propositalmente dessaturado. Cada barra leva o rótulo "usado x%", então a cor nunca é a
 * única pista. Regra de "usado": a mesma da Prestação de Contas (execucao-programa.ts).
 */

const COR_A_USAR = "#3f6fc4";
const COR_USADO = "#a57a8a";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

export function DestinacaoPorConta({ programas }: { programas: { nome: string; tipo: string; execucao: ExecucaoPrograma }[] }) {
  const comOrcamento = programas.filter((p) => p.execucao.porConta.length > 0);
  if (comOrcamento.length === 0) return null;

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-6">
      <h2 className="font-heading text-sm font-semibold">Destinação do recurso</h2>
      <p className="mb-3 text-[11px] text-text-muted">
        Por conta do plano de contas, conforme o orçamento proposto de cada programa. O pedaço em vinho já entrou na despesa.
      </p>
      <div className="mb-4 flex flex-wrap gap-4 text-[11px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: COR_A_USAR }} /> A usar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: COR_USADO }} /> Já usado (entrou na despesa)
        </span>
      </div>

      <div className="flex flex-col gap-6">
        {comOrcamento.map(({ nome, tipo, execucao }) => {
          const maior = Math.max(...execucao.porConta.map((c) => c.previsto));
          const usadoTotal = Math.min(execucao.totalRealizado, execucao.totalPrevisto);
          return (
            <div key={nome}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold">
                  {nome} <span className="font-normal text-text-faint">· {tipo === "fomento" ? "fomento" : "investimento"}</span>
                </span>
                <span className="text-[11.5px] text-text-muted">
                  <span className="font-mono text-text">{brl(execucao.totalPrevisto)}</span> previstos ·{" "}
                  {execucao.totalPrevisto > 0 ? pct((usadoTotal / execucao.totalPrevisto) * 100) : "—"} usado
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {execucao.porConta.map((c) => {
                  const usado = Math.min(c.realizado, c.previsto);
                  const larguraTotal = maior > 0 ? (c.previsto / maior) * 100 : 0;
                  const fracUsado = c.previsto > 0 ? usado / c.previsto : 0;
                  const acima = c.realizado > c.previsto + 0.5;
                  return (
                    <div key={c.id} className="grid grid-cols-[minmax(0,260px)_1fr_150px] items-center gap-3 text-[11.5px]">
                      <span className="truncate text-text" title={c.conta}>
                        {c.conta}
                      </span>
                      <div className="h-4">
                        <div className="flex h-full gap-[2px]" style={{ width: `${larguraTotal}%` }}>
                          {fracUsado > 0 && (
                            <div
                              className={`h-full rounded-l-[4px] ${fracUsado >= 1 ? "rounded-r-[4px]" : ""}`}
                              style={{ width: `${fracUsado * 100}%`, background: COR_USADO }}
                              title={`Já usado: ${brl(usado)}`}
                            />
                          )}
                          {fracUsado < 1 && (
                            <div
                              className={`h-full rounded-r-[4px] ${fracUsado <= 0 ? "rounded-l-[4px]" : ""}`}
                              style={{ width: `${(1 - fracUsado) * 100}%`, background: COR_A_USAR }}
                              title={`A usar: ${brl(c.previsto - usado)}`}
                            />
                          )}
                        </div>
                      </div>
                      <span className="text-right font-mono text-text-muted">
                        {brl(c.previsto)} <span className="font-sans text-[10.5px]">· usado {pct(fracUsado * 100)}</span>
                        {acima && <span className="block font-sans text-[10px] text-danger">gasto acima do previsto: {brl(c.realizado)}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
