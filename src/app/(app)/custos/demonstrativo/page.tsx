import { createClient } from "@/lib/supabase/server";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function grupoDe(codigo: string, tipo: string): string {
  if (tipo === "cogs") return "COGS";
  if (codigo.startsWith("4.2.1")) return "S&M";
  if (codigo.startsWith("4.2.2")) return "P&D";
  if (codigo.startsWith("4.2.3")) return "G&A";
  if (codigo.startsWith("4.2.4")) return "Lançamento & Marca";
  if (tipo === "financeiro") return "Financeiro";
  if (tipo === "ativo") return "Ativos";
  return "Outros";
}

const ORDEM_GRUPOS = ["COGS", "S&M", "P&D", "G&A", "Lançamento & Marca", "Financeiro", "Ativos", "Outros"];

export default async function DemonstrativoPage() {
  const supabase = await createClient();

  const { data: despesas } = await supabase
    .from("despesas")
    .select("data_gasto, valor_total, plano_contas:plano_contas_id(codigo, tipo)");

  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const porGrupo = new Map<string, { mes: number; acumulado: number }>();
  for (const g of ORDEM_GRUPOS) porGrupo.set(g, { mes: 0, acumulado: 0 });

  for (const d of despesas ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conta = d.plano_contas as any;
    if (!conta) continue;
    const grupo = grupoDe(conta.codigo, conta.tipo);
    const entry = porGrupo.get(grupo)!;
    const valor = Number(d.valor_total);
    entry.acumulado += valor;
    if (d.data_gasto.startsWith(mesAtual)) entry.mes += valor;
  }

  const totalMes = [...porGrupo.values()].reduce((acc, g) => acc + g.mes, 0);
  const totalAcumulado = [...porGrupo.values()].reduce((acc, g) => acc + g.acumulado, 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">Demonstrativo de Resultado — Real</h2>
        <span className="text-[11px] text-text-faint">receita ainda não lançada — período pré-operacional</span>
      </div>
      <table className="mt-4 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="text-left text-text-muted">
            <th className="px-2 py-2 font-medium">Grupo</th>
            <th className="px-2 py-2 text-right font-medium">{mesAtual}</th>
            <th className="px-2 py-2 text-right font-medium">Acumulado</th>
          </tr>
        </thead>
        <tbody>
          {ORDEM_GRUPOS.filter((g) => porGrupo.get(g)!.acumulado > 0).map((g) => {
            const v = porGrupo.get(g)!;
            return (
              <tr key={g} className="border-t border-border-soft">
                <td className="px-2 py-2.5">(–) {g}</td>
                <td className="px-2 py-2.5 text-right font-mono">{formatBRL(v.mes)}</td>
                <td className="px-2 py-2.5 text-right font-mono">{formatBRL(v.acumulado)}</td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-text bg-wine-soft">
            <td className="px-2 py-2.5 font-bold">(=) EBITDA real</td>
            <td className="px-2 py-2.5 text-right font-mono font-bold text-danger">
              – {formatBRL(totalMes)}
            </td>
            <td className="px-2 py-2.5 text-right font-mono font-bold text-danger">
              – {formatBRL(totalAcumulado)}
            </td>
          </tr>
        </tbody>
      </table>

      {(despesas ?? []).length === 0 && (
        <p className="mt-4 text-[13px] text-text-muted">
          Nenhuma despesa lançada ainda — cadastre em Custos → Lançamentos.
        </p>
      )}
    </div>
  );
}
