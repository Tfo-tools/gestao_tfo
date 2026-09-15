import { createClient } from "@/lib/supabase/server";
import { AtivoForm } from "./ativo-form";
import { AtivoRow, type AtivoRowData } from "./ativo-row";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function AtivosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfilAtual } = user ? await supabase.from("profiles").select("nome").eq("id", user.id).single() : { data: null };

  const [{ data: ativos }, { data: planoContas }, { data: produtos }, { data: profiles }, { data: meiosPagamento }] = await Promise.all([
    supabase
      .from("ativos")
      .select(
        "id, descricao, plano_contas_id, plano_contas:plano_contas_id(codigo, conta), produto_id, produto:produto_id(nome), valor, data_aquisicao, vida_util_meses, observacoes, pagador, forma_pagamento, pagamento_detalhe",
      )
      .order("data_aquisicao", { ascending: false }),
    supabase.from("plano_contas").select("id, codigo, conta").eq("tipo", "ativo").order("codigo"),
    supabase.from("produtos").select("id, nome").order("nome"),
    supabase.from("profiles").select("id, nome, cartao_dia_vencimento, cartao_dias_fechamento_antes").order("nome"),
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

  const ativosTyped = (ativos ?? []) as unknown as AtivoRowData[];
  const total = ativosTyped.reduce((s, a) => s + Number(a.valor), 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Ativos</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Registro do que foi comprado — equipamentos, licenças permanentes, móveis. Sem depreciação automática por enquanto; ajustamos
          conforme a necessidade aparecer.
        </p>
      </div>

      <div className="grid grid-cols-[420px_1fr] items-start gap-5">
        <AtivoForm
          planoContas={planoContas ?? []}
          produtos={produtos ?? []}
          pagadores={pagadores}
          pessoas={pessoas}
          meiosPagamento={meiosPagamento ?? []}
          usuarioAtual={perfilAtual?.nome ?? null}
        />

        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold">Ativos registrados</h2>
            {ativosTyped.length > 0 && (
              <span className="font-mono text-[13px] font-semibold">
                {formatBRL(total)} <span className="font-sans text-[11px] font-normal text-text-faint">total</span>
              </span>
            )}
          </div>
          {ativosTyped.length === 0 ? (
            <p className="text-[13px] text-text-muted">Nenhum ativo registrado ainda.</p>
          ) : (
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="px-2 py-1.5 font-medium">Descrição</th>
                  <th className="px-2 py-1.5 font-medium">Conta</th>
                  <th className="px-2 py-1.5 font-medium">Produto</th>
                  <th className="px-2 py-1.5 font-medium">Aquisição</th>
                  <th className="px-2 py-1.5 font-medium">Pagamento</th>
                  <th className="px-2 py-1.5 text-right font-medium">Valor</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {ativosTyped.map((a) => (
                  <AtivoRow
                    key={a.id}
                    ativo={a}
                    planoContas={planoContas ?? []}
                    produtos={produtos ?? []}
                    pagadores={pagadores}
                    pessoas={pessoas}
                    meiosPagamento={meiosPagamento ?? []}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
