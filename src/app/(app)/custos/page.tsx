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
          "id, data_gasto, valor_total, valor_fatura, forma_pagamento, comprovado, descricao, pagador, despesa_recorrente_id, plano_contas_id, plano_contas:plano_contas_id(codigo, conta), despesa_produtos(produtos(id, nome)), anexos_despesa(id, caminho_arquivo, nome_arquivo, tipo), despesa_parcelas(*), despesa_pagamentos(*)",
        )
        // Tudo o que ainda precisa de atenção: sem comprovante, venha de lançamento avulso ou de
        // recorrência. Antes os de recorrência ficavam de fora e a lista parecia ter um item só —
        // eram 7 pendentes escondidos. O selo "recorrente" diz de onde cada um veio.
        .eq("comprovado", false)
        .order("data_gasto", { ascending: false })
        .limit(200),
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

  const pendentes = despesas ?? [];
  const totalPendente = pendentes.reduce((s, d) => s + Number(d.valor_total), 0);
  const deRecorrencia = pendentes.filter((d) => d.despesa_recorrente_id != null).length;

  return (
    // Duas colunas da mesma largura: a lista de pendentes empilha a informação de cada lançamento
    // pra caber ao lado do formulário sem rolar a página.
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <DespesaForm
        planoContas={planoContas ?? []}
        produtos={produtos ?? []}
        pagadores={pagadores}
        usoPorConta={usoPorConta}
        usuarioAtual={perfilAtual?.nome ?? null}
        meiosPagamento={meiosPagamento ?? []}
        pessoas={pessoas}
      />

      <div className="flex flex-col rounded-xl border border-border bg-surface p-5 lg:max-h-[calc(100vh-11rem)]">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-sm font-semibold">
            Lançamentos pendentes{pendentes.length > 0 && ` (${pendentes.length})`}
          </h2>
          {pendentes.length > 0 && <span className="font-mono text-[12.5px] font-semibold">{formatBRL(totalPendente)}</span>}
        </div>
        <p className="mb-3 text-[11px] text-text-muted">
          Tudo sem comprovante, avulso ou de recorrência{deRecorrencia > 0 ? ` (${deRecorrencia} de recorrência)` : ""}. Ao
          comprovar, o lançamento sai daqui e fica no Extrato.
        </p>
        {pendentes.length === 0 ? (
          <p className="text-[13px] text-text-muted">Nenhum lançamento pendente — tudo comprovado por aqui.</p>
        ) : (
          // A lista rola dentro do card quando cresce — a página continua sem rolagem.
          <div className="-mx-1 min-h-0 overflow-y-auto px-1">
            <table className="w-full border-collapse text-[12.5px]">
              <tbody>
                {pendentes.map((d) => (
                  <DespesaRow
                    key={d.id}
                    despesa={d as unknown as DespesaRowData}
                    planoContas={planoContas ?? []}
                    produtos={produtos ?? []}
                    pagadores={pagadores}
                    fechado={mesesFechados.has(d.data_gasto.slice(0, 7))}
                    meiosPagamento={meiosPagamento ?? []}
                    pessoas={pessoas}
                    compacto
                    origem={d.despesa_recorrente_id != null ? "recorrente" : "avulso"}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
