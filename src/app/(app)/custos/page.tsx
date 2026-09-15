import { createClient } from "@/lib/supabase/server";
import { DespesaForm } from "./despesa-form";
import { DespesaRow, type DespesaRowData } from "./extrato/despesa-row";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function LancamentosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfilAtual } = user ? await supabase.from("profiles").select("nome").eq("id", user.id).single() : { data: null };

  const [{ data: planoContas }, { data: produtos }, { data: despesas }, { data: profiles }, { data: todasDespesasContas }, { data: mesesFechadosRaw }, { data: meiosPagamento }] =
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
          "id, data_gasto, valor_total, valor_fatura, forma_pagamento, comprovado, descricao, pagador, plano_contas_id, plano_contas:plano_contas_id(codigo, conta), despesa_produtos(produtos(id, nome)), anexos_despesa(caminho_arquivo, nome_arquivo, tipo), despesa_parcelas(*), despesa_pagamentos(*)",
        )
        // Só o que ainda precisa de atenção: lançamento avulso (não recorrente — essas têm sua
        // própria lista em Recorrentes) e ainda sem comprovante. Despesa já comprovada some daqui
        // — pra editar/ver uma já comprovada, vai no Extrato.
        .is("despesa_recorrente_id", null)
        .eq("comprovado", false)
        .order("data_gasto", { ascending: false })
        .limit(50),
      supabase.from("profiles").select("id, nome, cartao_dia_vencimento, cartao_dias_fechamento_antes").order("nome"),
      supabase.from("despesas").select("plano_contas_id"),
      supabase.from("meses_fechados").select("mes"),
      supabase
        .from("meios_pagamento")
        .select("id, banco, tipo, titular_tipo, titular_pessoa_id, bandeira, dia_vencimento, dias_fechamento_antes")
        .eq("ativo", true)
        .order("banco"),
    ]);

  const pagadores = (profiles ?? []).map((p) => p.nome);
  const pessoas = (profiles ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    cartao_dia_vencimento: p.cartao_dia_vencimento,
    cartao_dias_fechamento_antes: p.cartao_dias_fechamento_antes,
  }));
  const mesesFechados = new Set((mesesFechadosRaw ?? []).map((m) => (m.mes as string).slice(0, 7)));

  const usoPorConta: Record<string, number> = {};
  for (const d of todasDespesasContas ?? []) {
    if (!d.plano_contas_id) continue;
    usoPorConta[d.plano_contas_id] = (usoPorConta[d.plano_contas_id] ?? 0) + 1;
  }

  return (
    <div className="grid grid-cols-[420px_1fr] items-start gap-5">
      <DespesaForm
        planoContas={planoContas ?? []}
        produtos={produtos ?? []}
        pagadores={pagadores}
        usoPorConta={usoPorConta}
        usuarioAtual={perfilAtual?.nome ?? null}
        meiosPagamento={meiosPagamento ?? []}
        pessoas={pessoas}
      />

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-1 font-heading text-sm font-semibold">Lançamentos pendentes</h2>
        <p className="mb-4 text-[11.5px] text-text-muted">
          Avulsos ainda sem comprovante. Já comprovado ou é recorrente? Vai em Extrato ou Recorrentes.
        </p>
        {(despesas ?? []).length === 0 ? (
          <p className="text-[13px] text-text-muted">Nenhum lançamento pendente — tudo comprovado por aqui.</p>
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
                  meiosPagamento={meiosPagamento ?? []}
                  pessoas={pessoas}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
