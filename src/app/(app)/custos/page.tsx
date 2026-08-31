import { createClient } from "@/lib/supabase/server";
import { DespesaForm } from "./despesa-form";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

export default async function LancamentosPage() {
  const supabase = await createClient();

  const [{ data: planoContas }, { data: produtos }, { data: despesas }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("plano_contas")
        .select("id, codigo, conta")
        .in("tipo", ["cogs", "opex", "financeiro", "ativo"])
        .order("codigo"),
      supabase.from("produtos").select("id, nome").order("nome"),
      supabase
        .from("despesas")
        .select(
          "id, data_gasto, valor_total, comprovado, pagador, plano_contas:plano_contas_id(codigo, conta), produtos:produto_id(nome)",
        )
        .order("data_gasto", { ascending: false })
        .limit(15),
      supabase.from("profiles").select("nome").order("nome"),
    ]);

  const pagadores = (profiles ?? []).map((p) => p.nome);

  return (
    <div className="grid grid-cols-[420px_1fr] items-start gap-5">
      <DespesaForm planoContas={planoContas ?? []} produtos={produtos ?? []} pagadores={pagadores} />

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-5 font-heading text-sm font-semibold">Lançamentos recentes</h2>
        {(despesas ?? []).length === 0 ? (
          <p className="text-[13px] text-text-muted">Nenhuma despesa lançada ainda.</p>
        ) : (
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="px-2 py-1.5 font-medium">Data</th>
                <th className="px-2 py-1.5 font-medium">Categoria</th>
                <th className="px-2 py-1.5 font-medium">Produto</th>
                <th className="px-2 py-1.5 font-medium">Pagador</th>
                <th className="px-2 py-1.5 text-right font-medium">Valor</th>
                <th className="px-2 py-1.5 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(despesas ?? []).map((d) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const conta = d.plano_contas as any;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const produto = d.produtos as any;
                return (
                  <tr key={d.id} className="border-t border-border-soft">
                    <td className="px-2 py-2.5 font-mono">{formatDate(d.data_gasto)}</td>
                    <td className="px-2 py-2.5">{conta ? `${conta.codigo} — ${conta.conta}` : "—"}</td>
                    <td className="px-2 py-2.5 text-text-muted">{produto?.nome ?? "—"}</td>
                    <td className="px-2 py-2.5 text-text-muted">{d.pagador ?? "—"}</td>
                    <td className="px-2 py-2.5 text-right font-mono">{formatBRL(Number(d.valor_total))}</td>
                    <td className="px-2 py-2.5 text-center">
                      <span
                        className={`rounded px-2 py-0.5 text-[10.5px] font-semibold ${
                          d.comprovado ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                        }`}
                      >
                        {d.comprovado ? "Comprovado" : "Pendente"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
