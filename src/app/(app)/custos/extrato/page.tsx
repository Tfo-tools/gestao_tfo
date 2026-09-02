import { createClient } from "@/lib/supabase/server";
import { DespesaRow, type DespesaRowData } from "./despesa-row";
import { FecharMesButton } from "./fechar-mes-button";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

export default async function ExtratoPage({
  searchParams,
}: {
  searchParams: Promise<{
    mes?: string;
    desde?: string;
    ate?: string;
    produto?: string;
    comprovado?: string;
    pagador?: string;
    conta?: string;
    descricao?: string;
  }>;
}) {
  const { mes, desde, ate, produto, comprovado, pagador, conta, descricao } = await searchParams;
  const supabase = await createClient();

  const [{ data: produtos }, { data: contaAtual }, { data: planoContas }, { data: profiles }, { data: mesesFechadosRaw }] = await Promise.all([
    supabase.from("produtos").select("id, nome").order("nome"),
    conta ? supabase.from("plano_contas").select("codigo, conta").eq("id", conta).single() : Promise.resolve({ data: null }),
    supabase.from("plano_contas").select("id, codigo, conta").in("tipo", ["cogs", "opex", "financeiro", "ativo"]).order("codigo"),
    supabase.from("profiles").select("nome").order("nome"),
    supabase.from("meses_fechados").select("mes"),
  ]);

  const pagadores = (profiles ?? []).map((p) => p.nome);
  const mesesFechados = new Set((mesesFechadosRaw ?? []).map((m) => (m.mes as string).slice(0, 7)));

  let query = supabase
    .from("despesas")
    .select(
      produto
        ? "id, data_gasto, valor_total, comprovado, descricao, pagador, plano_contas_id, plano_contas:plano_contas_id(codigo, conta), despesa_produtos!inner(produtos(id, nome)), anexos_despesa(caminho_arquivo, nome_arquivo, tipo)"
        : "id, data_gasto, valor_total, comprovado, descricao, pagador, plano_contas_id, plano_contas:plano_contas_id(codigo, conta), despesa_produtos(produtos(id, nome)), anexos_despesa(caminho_arquivo, nome_arquivo, tipo)",
    )
    .order("data_gasto", { ascending: false });

  if (mes) {
    query = query.gte("data_gasto", `${mes}-01`).lt("data_gasto", nextMonth(mes));
  } else {
    if (desde) query = query.gte("data_gasto", `${desde}-01`);
    if (ate) query = query.lt("data_gasto", nextMonth(ate));
  }
  if (produto) query = query.eq("despesa_produtos.produto_id", produto);
  if (comprovado === "sim") query = query.eq("comprovado", true);
  if (comprovado === "nao") query = query.eq("comprovado", false);
  if (pagador) query = query.eq("pagador", pagador);
  if (conta) query = query.eq("plano_contas_id", conta);
  if (descricao) query = query.ilike("descricao", `%${descricao}%`);

  const { data: despesas } = await query;

  // Rateio entre sócias — sobre o MESMO recorte filtrado acima (período, produto, descrição...),
  // pra dar pra isolar um evento/feira específico em vez de sempre olhar o total acumulado. Só o
  // que saiu do bolso de cada uma entra; pago pela "Empresa" (cartão/conta PJ) fica de fora,
  // porque a empresa já cobriu direto, não há diferença a repassar.
  const pessoasSet = new Set(pagadores);
  const porPagador = new Map<string, number>();
  let totalOutros = 0;
  for (const d of despesas ?? []) {
    if (!d.pagador || d.pagador === "Empresa" || !pessoasSet.has(d.pagador)) {
      totalOutros += Number(d.valor_total);
      continue;
    }
    porPagador.set(d.pagador, (porPagador.get(d.pagador) ?? 0) + Number(d.valor_total));
  }
  const totalGeral = [...porPagador.values()].reduce((a, b) => a + b, 0);
  const linhasPagador = [...porPagador.entries()].sort((a, b) => b[1] - a[1]);
  const metade = totalGeral / 2;
  const temFiltroAtivo = !!(mes || desde || ate || produto || comprovado || pagador || conta || descricao);

  const exportQs = new URLSearchParams();
  if (mes) exportQs.set("mes", mes);
  if (desde) exportQs.set("desde", desde);
  if (ate) exportQs.set("ate", ate);
  if (produto) exportQs.set("produto", produto);
  if (comprovado) exportQs.set("comprovado", comprovado);
  if (pagador) exportQs.set("pagador", pagador);
  if (conta) exportQs.set("conta", conta);
  if (descricao) exportQs.set("descricao", descricao);

  return (
    <div className="flex flex-col gap-5">
      {linhasPagador.length > 0 && totalGeral > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-1 font-heading text-sm font-semibold">Rateio entre sócias</h2>
          <p className="mb-4 text-[11.5px] text-text-muted">
            Só o que saiu do bolso de cada uma ({formatBRL(totalGeral)}) — pago pela "Empresa" não entra, já foi coberto direto.
            {temFiltroAtivo
              ? " Sobre o recorte filtrado abaixo — use período e descrição pra isolar um evento específico."
              : " Sobre tudo lançado até agora — filtre por período ou descrição abaixo pra isolar só um evento/feira."}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {linhasPagador.map(([nome, valor]) => {
              const pct = totalGeral > 0 ? (valor / totalGeral) * 100 : 0;
              const diff = valor - metade;
              return (
                <div key={nome} className="rounded-lg border border-border-soft px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold">{nome}</span>
                    <span className="font-mono text-[14px] font-semibold">{formatBRL(valor)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-soft">
                    <div
                      className="h-full rounded-full bg-primary-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 text-[11px] text-text-faint">
                    {pct.toFixed(0)}% do total
                    {Math.abs(diff) > 1 && (
                      <>
                        {" · "}
                        {diff > 0
                          ? `pagou R$ ${diff.toFixed(0)} a mais que a metade`
                          : `falta depositar R$ ${Math.abs(diff).toFixed(0)} pra fechar a metade`}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {totalOutros > 0 && (
            <p className="mt-3 text-[11px] text-text-faint">
              {formatBRL(totalOutros)} pagos pela empresa (ou sem pagador definido) ficaram fora dessa conta.
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-6">
        {(conta || desde || ate || descricao) && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-primary-soft px-3.5 py-2.5 text-[12px] text-primary-deep">
            <span>
              Filtrado {conta && contaAtual ? `pela conta ${contaAtual.codigo} — ${contaAtual.conta}` : ""}
              {conta && (desde || ate || descricao) ? " · " : ""}
              {desde ? `de ${desde}` : ""}
              {desde && ate ? " " : ""}
              {ate ? `até ${ate}` : ""}
              {(desde || ate) && descricao ? " · " : ""}
              {descricao ? `descrição contém "${descricao}"` : ""}
            </span>
            <a href="/custos/extrato" className="underline">
              Limpar filtro
            </a>
          </div>
        )}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">Extrato de despesas</h2>
          <div className="flex items-center gap-2">
            {mes && <FecharMesButton mes={mes} fechado={mesesFechados.has(mes)} />}
            <a
              href={`/custos/extrato/export?${exportQs.toString()}`}
              className="rounded-lg border border-border px-3.5 py-2 text-[12px] text-text-muted hover:text-text"
            >
              Exportar CSV
            </a>
          </div>
        </div>
        {!mes && (
          <p className="mb-4 text-[11px] text-text-faint">
            Pra fechar um mês (travar contra edição/exclusão), filtre por um mês específico acima.
          </p>
        )}

        <form className="mb-5 flex flex-wrap items-end gap-3" method="get">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Mês exato</label>
            <input type="month" name="mes" defaultValue={mes} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">De</label>
            <input type="month" name="desde" defaultValue={desde} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Até</label>
            <input type="month" name="ate" defaultValue={ate} className="input" />
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
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Pagador</label>
            <select name="pagador" defaultValue={pagador ?? ""} className="input">
              <option value="">Todos</option>
              {pagadores.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
              <option value="Empresa">Empresa</option>
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
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Descrição contém</label>
            <input type="text" name="descricao" defaultValue={descricao ?? ""} placeholder="Ex: Feira SPFW" className="input w-[180px]" />
          </div>
          <button type="submit" className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white">
            Filtrar
          </button>
          {temFiltroAtivo && (
            <a href="/custos/extrato" className="text-[12px] text-text-muted underline">
              Limpar tudo
            </a>
          )}
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
                <th className="px-2 py-1.5 font-medium">Pagador</th>
                <th className="px-2 py-1.5 font-medium">Descrição</th>
                <th className="px-2 py-1.5 text-right font-medium">Valor</th>
                <th className="px-2 py-1.5 text-center font-medium">Status</th>
                <th className="px-2 py-1.5 font-medium">Comprovante</th>
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

function nextMonth(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
