import { InfoTooltip } from "@/components/info-tooltip";

export type LinhaCobertura = {
  ano: string;
  produto: string;
  /** Clientes diretos que a projeção espera no ano (crescimento das fases). */
  meta: number;
  /** Clientes que as ações de marketing prevêem trazer no ano. */
  previstos: number;
  /** Custo das ações atribuído ao produto (pelos clientes que cada ação traz a ele). */
  custo: number;
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function num(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/**
 * Quanto da meta de clientes diretos as ações de marketing explicam — e quanto de verba faltaria,
 * no mesmo custo por cliente, pra cobrir o resto. É a pergunta do investidor: que verba traz esses
 * clientes?
 */
export function CoberturaCanalDireto({ linhas, semRetornoPorAno }: { linhas: LinhaCobertura[]; semRetornoPorAno: Record<string, number> }) {
  const anos = [...new Set([...linhas.map((l) => l.ano), ...Object.keys(semRetornoPorAno)])].sort();
  if (anos.length === 0) return null;
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <h3 className="flex items-center font-heading text-[13px] font-semibold">
        Cobertura do canal direto
        <InfoTooltip texto="Meta = clientes que a projeção espera pelo canal direto (crescimento de cada fase). Previstos = clientes que as ações de marketing cadastradas trazem. A diferença é o que ainda não tem uma ação por trás — ou é trabalho da equipe comercial (SDR), ou falta verba. Verba que faltaria = clientes descobertos × custo por cliente das ações do produto." />
      </h3>
      <p className="mb-3 mt-0.5 text-[11px] text-text-muted">
        Quanto da meta de clientes diretos as ações de marketing explicam. O que ficar descoberto precisa de outra origem: equipe comercial
        (SDR) ou mais verba.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="px-2 py-1.5 font-medium">Ano</th>
              <th className="px-2 py-1.5 font-medium">Produto</th>
              <th className="px-2 py-1.5 text-right font-medium">Meta (clientes diretos)</th>
              <th className="px-2 py-1.5 text-right font-medium">Previstos pelas ações</th>
              <th className="px-2 py-1.5 text-right font-medium">Cobertura</th>
              <th className="px-2 py-1.5 text-right font-medium">Custo das ações</th>
              <th className="px-2 py-1.5 text-right font-medium">Custo por cliente</th>
              <th className="px-2 py-1.5 text-right font-medium">Verba que faltaria</th>
            </tr>
          </thead>
          <tbody>
            {anos.map((ano) => {
              const doAno = linhas.filter((l) => l.ano === ano && (l.meta > 0.5 || l.previstos > 0));
              return [
                ...doAno.map((l, i) => {
                  const cobertura = l.meta > 0 ? l.previstos / l.meta : null;
                  const cpc = l.previstos > 0 ? l.custo / l.previstos : null;
                  const falta = Math.max(0, l.meta - l.previstos);
                  const cor = cobertura == null ? "" : cobertura >= 0.8 ? "text-success" : cobertura >= 0.3 ? "text-warning" : "text-danger";
                  return (
                    <tr key={`${ano}-${l.produto}`} className={i === 0 ? "border-t border-border" : "border-t border-border-soft"}>
                      <td className="px-2 py-1.5 font-medium">{i === 0 ? ano : ""}</td>
                      <td className="px-2 py-1.5">{l.produto}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{num(l.meta)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{num(l.previstos)}</td>
                      <td className={`px-2 py-1.5 text-right font-mono font-semibold ${cor}`}>{cobertura != null ? `${Math.round(cobertura * 100)}%` : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{l.custo > 0 ? brl(l.custo) : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{cpc != null ? brl(cpc) : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{falta > 0.5 && cpc != null ? brl(falta * cpc) : falta > 0.5 ? "sem ação pra comparar" : "—"}</td>
                    </tr>
                  );
                }),
                semRetornoPorAno[ano] ? (
                  <tr key={`${ano}-sem`} className="border-t border-border-soft text-text-muted">
                    <td className="px-2 py-1.5 font-medium">{doAno.length === 0 ? ano : ""}</td>
                    <td className="px-2 py-1.5" colSpan={4}>
                      Ações sem retorno cadastrado (só custo)
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{brl(semRetornoPorAno[ano])}</td>
                    <td className="px-2 py-1.5" colSpan={2} />
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
