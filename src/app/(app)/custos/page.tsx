import { createClient } from "@/lib/supabase/server";
import { DespesaForm } from "./despesa-form";
import { DespesaRow, type DespesaRowData } from "./extrato/despesa-row";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function LancamentosPage() {
  const supabase = await createClient();

  const [{ data: planoContas }, { data: produtos }, { data: despesas }, { data: profiles }, { data: todasDespesasContas }, { data: mesesFechadosRaw }] =
    await Promise.all([
      supabase
        .from("plano_contas")
        .select("id, codigo, conta, tipo")
        .in("tipo", ["cogs", "opex", "financeiro", "ativo"])
        .order("codigo"),
      supabase.from("produtos").select("id, nome").order("nome"),
      supabase
        .from("despesas")
        .select(
          "id, data_gasto, valor_total, comprovado, descricao, pagador, plano_contas_id, plano_contas:plano_contas_id(codigo, conta), despesa_produtos(produtos(id, nome)), anexos_despesa(caminho_arquivo, nome_arquivo, tipo)",
        )
        .order("data_gasto", { ascending: false })
        .limit(15),
      supabase.from("profiles").select("nome").order("nome"),
      supabase.from("despesas").select("plano_contas_id"),
      supabase.from("meses_fechados").select("mes"),
    ]);

  const pagadores = (profiles ?? []).map((p) => p.nome);
  const mesesFechados = new Set((mesesFechadosRaw ?? []).map((m) => (m.mes as string).slice(0, 7)));

  const usoPorConta: Record<string, number> = {};
  for (const d of todasDespesasContas ?? []) {
    if (!d.plano_contas_id) continue;
    usoPorConta[d.plano_contas_id] = (usoPorConta[d.plano_contas_id] ?? 0) + 1;
  }

  return (
    <div className="grid grid-cols-[420px_1fr] items-start gap-5">
      <DespesaForm planoContas={planoContas ?? []} produtos={produtos ?? []} pagadores={pagadores} usoPorConta={usoPorConta} />

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
                <th className="px-2 py-1.5 font-medium">Descrição</th>
                <th className="px-2 py-1.5 text-right font-medium">Valor</th>
                <th className="px-2 py-1.5 text-center font-medium">Status</th>
                <th className="px-2 py-1.5 font-medium">Comprovante / Ações</th>
              </tr>
            </thead>
            <tbody>
              {(despesas ?? []).map((d) => (
                <DespesaRow
                  key={d.id}
                  despesa={d as unknown as DespesaRowData}
                  planoContas={planoContas ?? []}
                  produtos={produtos ?? []}
                  pagadores={pagadores}
                  fechado={mesesFechados.has(d.data_gasto.slice(0, 7))}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
