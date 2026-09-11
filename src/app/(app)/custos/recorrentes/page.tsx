import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AnexarForm } from "./anexar-form";
import { RecorrenteRow, type RecorrenteRowData } from "./recorrente-row";
import { categoriaDeConta, labelCategoriaNegocio, CATEGORIAS_NEGOCIO } from "@/lib/categoria-negocio";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

export default async function RecorrentesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const supabase = await createClient();

  const [{ data: planoContas }, { data: produtos }, { data: profiles }, { data: recorrentes }, { data: pendentes }] = await Promise.all([
    supabase.from("plano_contas").select("id, codigo, conta, tipo").in("tipo", ["cogs", "opex", "financeiro", "ativo"]).order("codigo"),
    supabase.from("produtos").select("id, nome").order("nome"),
    supabase.from("profiles").select("nome").order("nome"),
    supabase
      .from("despesas_recorrentes")
      .select(
        "id, descricao, valor, pagador, dia_do_mes, ativo, data_inicio, data_fim, plano_contas_id, plano_contas:plano_contas_id(codigo, conta), despesa_recorrente_produtos(produtos(id, nome))",
      )
      .order("descricao"),
    supabase
      .from("despesas")
      .select(
        "id, data_gasto, valor_total, descricao, pagador, comprovado, plano_contas:plano_contas_id(codigo, conta), anexos_despesa(caminho_arquivo, tipo)",
      )
      .not("despesa_recorrente_id", "is", null)
      .order("data_gasto", { ascending: false })
      .limit(200),
  ]);

  const pagadores = (profiles ?? []).map((p) => p.nome);
  // Só aparece aqui quem não tem nenhum arquivo anexado ainda (qualquer um já basta) e não foi
  // marcada como comprovada — assim que tiver 1 anexo ou virar "comprovada", some da lista.
  const pendentesFiltradas = (pendentes ?? []).filter((d) => !d.comprovado && ((d.anexos_despesa as unknown[]) ?? []).length === 0);

  const recorrentesFiltradas = tipo
    ? (recorrentes ?? []).filter((r) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conta = r.plano_contas as any as { codigo: string; conta: string } | null;
        return conta ? categoriaDeConta(conta) === tipo : false;
      })
    : (recorrentes ?? []);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-dashed border-border bg-surface px-5 py-4 text-[12.5px] text-text-muted">
        Nova recorrência? Cria em{" "}
        <Link href="/custos" className="font-medium text-primary-deep underline">
          Custos → Lançamentos
        </Link>
        , marcando "Isso se repete todo mês?". Essa tela aqui mostra só o que está pendente — pra editar ou pausar uma recorrência já
        comprovada, abra "Todas as recorrências cadastradas" abaixo.
      </div>

      {pendentesFiltradas.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-1 font-heading text-sm font-semibold">Pendentes de comprovante</h2>
          <p className="mb-4 text-[11.5px] text-text-muted">Lançadas automaticamente — ainda sem nenhum arquivo anexado (fatura/NF ou comprovante já resolve).</p>
          <div className="flex flex-col gap-3">
            {pendentesFiltradas.map((d) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const conta = d.plano_contas as any;
              return (
                <div key={d.id} className="flex flex-col gap-2 rounded-lg bg-bg px-3.5 py-3">
                  <div>
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
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-text-muted">Nenhum comprovante pendente — tudo em dia por aqui.</p>
        </div>
      )}

      <details className="rounded-xl border border-border bg-surface p-6" open={!!tipo}>
        <summary className="cursor-pointer font-heading text-sm font-semibold">
          Todas as recorrências cadastradas ({(recorrentes ?? []).length})
        </summary>
        <div className="mt-5">
          <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-muted">Tipo de despesa</label>
              <select name="tipo" defaultValue={tipo ?? ""} className="input">
                <option value="">Todos</option>
                {CATEGORIAS_NEGOCIO.map((g) => (
                  <option key={g.chave} value={g.chave}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white">
              Filtrar
            </button>
            {tipo && (
              <a href="/custos/recorrentes" className="text-[12px] text-text-muted underline">
                Limpar filtro
              </a>
            )}
          </form>
          {tipo && (
            <p className="mb-4 text-[11px] text-text-muted">
              Filtrado por tipo: {labelCategoriaNegocio(tipo)} ({recorrentesFiltradas.length}{" "}
              {recorrentesFiltradas.length === 1 ? "recorrência" : "recorrências"})
            </p>
          )}
          {recorrentesFiltradas.length === 0 ? (
            <p className="text-[13px] text-text-muted">
              {tipo ? "Nenhuma recorrência desse tipo." : "Nenhuma despesa recorrente cadastrada ainda."}
            </p>
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
                {recorrentesFiltradas.map((r) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const rr = r as any;
                  const produtosLigados = (rr.despesa_recorrente_produtos ?? []).map((dp: any) => dp.produtos).filter(Boolean);
                  const dado: RecorrenteRowData = {
                    id: rr.id,
                    descricao: rr.descricao,
                    valor: rr.valor,
                    pagador: rr.pagador,
                    dia_do_mes: rr.dia_do_mes,
                    data_inicio: rr.data_inicio,
                    data_fim: rr.data_fim,
                    ativo: rr.ativo,
                    plano_contas_id: rr.plano_contas_id,
                    plano_contas: rr.plano_contas,
                    produtoIds: produtosLigados.map((p: any) => p.id),
                    produtoNomes: produtosLigados.map((p: any) => p.nome),
                  };
                  return (
                    <RecorrenteRow key={rr.id} recorrente={dado} planoContas={planoContas ?? []} produtos={produtos ?? []} pagadores={pagadores} />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </div>
  );
}
