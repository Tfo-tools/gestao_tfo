import { createClient } from "@/lib/supabase/server";
import { AnexoButton } from "./anexo-button";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

export default async function ExtratoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; produto?: string; comprovado?: string }>;
}) {
  const { mes, produto, comprovado } = await searchParams;
  const supabase = await createClient();

  const [{ data: produtos }] = await Promise.all([
    supabase.from("produtos").select("id, nome").order("nome"),
  ]);

  let query = supabase
    .from("despesas")
    .select(
      "id, data_gasto, valor_total, comprovado, descricao, plano_contas:plano_contas_id(codigo, conta), produtos:produto_id(nome), anexos_despesa(caminho_arquivo, nome_arquivo)",
    )
    .order("data_gasto", { ascending: false });

  if (mes) {
    query = query.gte("data_gasto", `${mes}-01`).lt("data_gasto", nextMonth(mes));
  }
  if (produto) query = query.eq("produto_id", produto);
  if (comprovado === "sim") query = query.eq("comprovado", true);
  if (comprovado === "nao") query = query.eq("comprovado", false);

  const { data: despesas } = await query;

  const exportQs = new URLSearchParams();
  if (mes) exportQs.set("mes", mes);
  if (produto) exportQs.set("produto", produto);
  if (comprovado) exportQs.set("comprovado", comprovado);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">Extrato de despesas</h2>
        <a
          href={`/custos/extrato/export?${exportQs.toString()}`}
          className="rounded-lg border border-border px-3.5 py-2 text-[12px] text-text-muted hover:text-text"
        >
          Exportar CSV
        </a>
      </div>

      <form className="mb-5 flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Mês</label>
          <input type="month" name="mes" defaultValue={mes} className="input" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Produto</label>
          <select name="produto" defaultValue={produto ?? ""} className="input">
            <option value="">Todos</option>
            {(produtos ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Comprovação</label>
          <select name="comprovado" defaultValue={comprovado ?? ""} className="input">
            <option value="">Todas</option>
            <option value="sim">Comprovadas</option>
            <option value="nao">Pendentes</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white">
          Filtrar
        </button>
      </form>

      {(despesas ?? []).length === 0 ? (
        <p className="text-[13px] text-text-muted">Nenhuma despesa encontrada para esse filtro.</p>
      ) : (
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-text-muted">
              <th className="px-2 py-1.5 font-medium">Data</th>
              <th className="px-2 py-1.5 font-medium">Categoria</th>
              <th className="px-2 py-1.5 font-medium">Produto</th>
              <th className="px-2 py-1.5 font-medium">Descrição</th>
              <th className="px-2 py-1.5 text-right font-medium">Valor</th>
              <th className="px-2 py-1.5 text-center font-medium">Status</th>
              <th className="px-2 py-1.5 font-medium">Comprovante</th>
            </tr>
          </thead>
          <tbody>
            {(despesas ?? []).map((d) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const conta = d.plano_contas as any;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const produtoRow = d.produtos as any;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const anexos = (d.anexos_despesa as any[]) ?? [];
              return (
                <tr key={d.id} className="border-t border-border-soft">
                  <td className="px-2 py-2.5 font-mono">{formatDate(d.data_gasto)}</td>
                  <td className="px-2 py-2.5">{conta ? `${conta.codigo} — ${conta.conta}` : "—"}</td>
                  <td className="px-2 py-2.5 text-text-muted">{produtoRow?.nome ?? "—"}</td>
                  <td className="px-2 py-2.5 text-text-muted">{d.descricao ?? "—"}</td>
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
                  <td className="px-2 py-2.5">
                    {anexos[0] ? <AnexoButton path={anexos[0].caminho_arquivo} /> : <span className="text-text-faint">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function nextMonth(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
