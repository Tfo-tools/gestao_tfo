import { createClient } from "@/lib/supabase/server";
import { RecorrenteForm } from "./recorrente-form";
import { AnexarForm } from "./anexar-form";
import { alternarRecorrente } from "./actions";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

export default async function RecorrentesPage() {
  const supabase = await createClient();

  const [{ data: planoContas }, { data: produtos }, { data: profiles }, { data: recorrentes }, { data: pendentes }] = await Promise.all([
    supabase.from("plano_contas").select("id, codigo, conta, tipo").in("tipo", ["cogs", "opex", "financeiro", "ativo"]).order("codigo"),
    supabase.from("produtos").select("id, nome").order("nome"),
    supabase.from("profiles").select("nome").order("nome"),
    supabase
      .from("despesas_recorrentes")
      .select("id, descricao, valor, pagador, dia_do_mes, ativo, data_inicio, plano_contas:plano_contas_id(codigo, conta), produtos:produto_id(nome)")
      .order("descricao"),
    supabase
      .from("despesas")
      .select("id, data_gasto, valor_total, descricao, pagador, plano_contas:plano_contas_id(codigo, conta), anexos_despesa(caminho_arquivo, tipo)")
      .not("despesa_recorrente_id", "is", null)
      .order("data_gasto", { ascending: false })
      .limit(200),
  ]);

  const pagadores = (profiles ?? []).map((p) => p.nome);
  // "Pendente" aqui é especificamente sem comprovante de pagamento — a fatura/boleto sozinho não
  // fecha a pendência, porque pra contabilidade o que prova que foi pago é o comprovante.
  const pendentesFiltradas = (pendentes ?? []).filter(
    (d) => !((d.anexos_despesa as { tipo?: string }[]) ?? []).some((a) => a.tipo === "comprovante_pagamento"),
  );

  return (
    <div className="grid grid-cols-[420px_1fr] items-start gap-5">
      <RecorrenteForm planoContas={planoContas ?? []} produtos={produtos ?? []} pagadores={pagadores} />

      <div className="flex flex-col gap-5">
        {pendentesFiltradas.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="mb-1 font-heading text-sm font-semibold">Pendentes de comprovante</h2>
            <p className="mb-4 text-[11.5px] text-text-muted">
              Lançadas automaticamente — falta anexar o comprovante de pagamento de cada uma (a fatura/boleto sozinho não fecha a
              pendência).
            </p>
            <div className="flex flex-col gap-3">
              {pendentesFiltradas.map((d) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const conta = d.plano_contas as any;
                return (
                  <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-bg px-3.5 py-3">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium">{d.descricao}</div>
                      <div className="text-[11px] text-text-muted">
                        {conta ? `${conta.codigo} — ${conta.conta}` : "—"} · {formatDate(d.data_gasto)} · {formatBRL(Number(d.valor_total))}
                        {d.pagador && ` · ${d.pagador}`}
                      </div>
                    </div>
                    <AnexarForm despesaId={d.id} pagadorAtual={d.pagador} pagadores={pagadores} anexos={d.anexos_despesa ?? []} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-5 font-heading text-sm font-semibold">Despesas recorrentes cadastradas</h2>
          {(recorrentes ?? []).length === 0 ? (
            <p className="text-[13px] text-text-muted">Nenhuma despesa recorrente cadastrada ainda.</p>
          ) : (
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="px-2 py-1.5 font-medium">Descrição</th>
                  <th className="px-2 py-1.5 font-medium">Categoria</th>
                  <th className="px-2 py-1.5 font-medium">Produto</th>
                  <th className="px-2 py-1.5 text-right font-medium">Valor/mês</th>
                  <th className="px-2 py-1.5 text-center font-medium">Dia</th>
                  <th className="px-2 py-1.5 text-center font-medium">Status</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {(recorrentes ?? []).map((r) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const conta = r.plano_contas as any;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const produto = r.produtos as any;
                  return (
                    <tr key={r.id} className="border-t border-border-soft">
                      <td className="px-2 py-2.5">{r.descricao}</td>
                      <td className="px-2 py-2.5 text-text-muted">{conta ? `${conta.codigo} — ${conta.conta}` : "—"}</td>
                      <td className="px-2 py-2.5 text-text-muted">{produto?.nome ?? "—"}</td>
                      <td className="px-2 py-2.5 text-right font-mono">{formatBRL(Number(r.valor))}</td>
                      <td className="px-2 py-2.5 text-center font-mono">{r.dia_do_mes}</td>
                      <td className="px-2 py-2.5 text-center">
                        <span
                          className={`rounded px-2 py-0.5 text-[10.5px] font-semibold ${
                            r.ativo ? "bg-success-soft text-success" : "bg-bg text-text-faint"
                          }`}
                        >
                          {r.ativo ? "Ativa" : "Pausada"}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <form action={alternarRecorrente.bind(null, r.id, !r.ativo)}>
                          <button type="submit" className="text-[11.5px] font-medium text-primary-deep hover:text-wine">
                            {r.ativo ? "Pausar" : "Reativar"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
