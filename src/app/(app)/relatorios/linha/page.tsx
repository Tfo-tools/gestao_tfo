import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { grupoDeConta, GRUPO_LABELS, type GrupoDre } from "@/lib/grupo-dre";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function nextMonth(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function RelatorioLinhaPage({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string; cenario?: string; inicio?: string; fim?: string }>;
}) {
  const { grupo, cenario, inicio, fim } = await searchParams;
  const grupoValido: GrupoDre | null = grupo === "cogs" || grupo === "sm" || grupo === "pd" || grupo === "ga" ? grupo : null;

  const supabase = await createClient();
  const { data: despesas } = await supabase
    .from("despesas")
    .select("valor_total, data_gasto, plano_contas_id, plano_contas:plano_contas_id(codigo, conta, tipo)");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const despesasTyped = (despesas ?? []) as any as {
    valor_total: number;
    data_gasto: string;
    plano_contas_id: string | null;
    plano_contas: { codigo: string; conta: string; tipo: string } | null;
  }[];

  const desdeIso = inicio ? `${inicio}-01` : null;
  const ateIso = fim ? `${nextMonth(fim)}-01` : null;

  const porConta = new Map<string, { id: string; codigo: string; conta: string; valor: number }>();
  for (const d of despesasTyped) {
    if (!d.plano_contas_id || !d.plano_contas) continue;
    if (desdeIso && d.data_gasto < desdeIso) continue;
    if (ateIso && d.data_gasto >= ateIso) continue;
    if (grupoValido && grupoDeConta(d.plano_contas.codigo, d.plano_contas.tipo) !== grupoValido) continue;
    if (!grupoValido && grupoDeConta(d.plano_contas.codigo, d.plano_contas.tipo) === null) continue;
    const atual = porConta.get(d.plano_contas_id) ?? {
      id: d.plano_contas_id,
      codigo: d.plano_contas.codigo,
      conta: d.plano_contas.conta,
      valor: 0,
    };
    atual.valor += Number(d.valor_total);
    porConta.set(d.plano_contas_id, atual);
  }
  const contas = [...porConta.values()].sort((a, b) => b.valor - a.valor);
  const total = contas.reduce((s, c) => s + c.valor, 0);

  const titulo = grupoValido ? GRUPO_LABELS[grupoValido] : "EBITDA — todas as contas operacionais";
  const voltarHref = cenario
    ? `/relatorios?aba=planos&cenario=${cenario}${inicio ? `&inicio=${inicio}` : ""}${fim ? `&fim=${fim}` : ""}`
    : "/relatorios?aba=real";

  return (
    <div>
      <div className="mb-2">
        <Link href={voltarHref} className="text-[12.5px] text-text-muted">
          ← Voltar pro relatório
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">{titulo} — lançamentos reais</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          {inicio || fim ? `Período: ${inicio ?? "início"} a ${fim ?? "fim"}` : "Todo o histórico"} · quebrado por conta do plano de contas
        </p>
      </div>

      {contas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-text-muted">Nenhuma despesa real lançada ainda nessas contas — cadastre em Custos → Lançamentos.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="mb-4 text-[11px] text-text-muted">Clique numa conta pra ver cada lançamento individual, pra conferência</p>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="px-2 py-1.5 font-medium">Conta</th>
                <th className="px-2 py-1.5 text-right font-medium">Total lançado</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => (
                <tr key={c.id} className="border-t border-border-soft">
                  <td className="px-2 py-2.5">
                    <Link
                      href={`/custos/extrato?conta=${c.id}${inicio ? `&desde=${inicio}` : ""}${fim ? `&ate=${fim}` : ""}`}
                      className="text-primary-deep underline decoration-dotted underline-offset-2 hover:decoration-solid"
                    >
                      {c.codigo} — {c.conta} →
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono">{formatBRL(c.valor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-text bg-bg font-semibold">
                <td className="px-2 py-2">Total</td>
                <td className="px-2 py-2 text-right font-mono">{formatBRL(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
