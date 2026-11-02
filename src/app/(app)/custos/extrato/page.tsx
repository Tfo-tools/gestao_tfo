import { createClient } from "@/lib/supabase/server";
import { DespesaRow, type DespesaRowData } from "./despesa-row";
import { FecharMesButton } from "./fechar-mes-button";
import { carregarDevidos, rotuloMes } from "@/lib/acertos-socias";
import { categoriaDeConta, labelCategoriaNegocio, CATEGORIAS_NEGOCIO } from "@/lib/categoria-negocio";

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
    desde?: string;
    ate?: string;
    produto?: string;
    comprovado?: string;
    pagador?: string;
    conta?: string;
    descricao?: string;
    tipo?: string;
    ordem?: string;
  }>;
}) {
  const { desde, ate, produto, comprovado, pagador, conta, descricao, tipo, ordem } = await searchParams;
  // Padrão continua trazendo as mais recentes primeiro; "antigas" inverte pra achar o que falta
  // regularizar sem precisar rolar até o fim da lista.
  const ordemAscendente = ordem === "antigas";
  const supabase = await createClient();

  const [{ data: produtos }, { data: contaAtual }, { data: planoContas }, { data: profiles }, { data: mesesFechadosRaw }, { data: acertosAbertos }, { data: meiosPagamento }] =
    await Promise.all([
      supabase.from("produtos").select("id, nome").order("nome"),
      conta ? supabase.from("plano_contas").select("codigo, conta").eq("id", conta).single() : Promise.resolve({ data: null }),
      supabase.from("plano_contas").select("id, codigo, conta, tipo").in("tipo", ["cogs", "opex", "financeiro", "ativo"]).order("codigo"),
      supabase.from("profiles").select("id, nome, papel").order("nome"),
      supabase.from("meses_fechados").select("mes"),
      supabase
        .from("acertos_socias")
        .select("id, tipo, mes_referencia, vencimento, devedora, credora, valor")
        .eq("status", "aberto")
        .order("vencimento", { ascending: true }),
      supabase.from("meios_pagamento").select("id, banco, tipo, titular_tipo, titular_pessoa_id, bandeira, programa_id").eq("ativo", true).order("banco"),
    ]);

  // Programas que uma despesa pode comprovar (pago com o recurso deles → prestação de contas).
  const { data: programas } = await supabase.from("programas_investimento").select("id, nome").order("nome");
  const pagadores = (profiles ?? []).map((p) => p.nome);
  const pessoas = (profiles ?? []).map((p) => ({ id: p.id, nome: p.nome }));
  const mesesFechados = new Set((mesesFechadosRaw ?? []).map((m) => (m.mes as string).slice(0, 7)));
  const hojeIso = new Date().toISOString().slice(0, 10);
  // "Fechar mês" só faz sentido quando De/Até apontam pro mesmo mês — não existe mais um campo
  // "Mês exato" separado, isso já cobre o caso (e evita redundância com o período).
  const mesExato = desde && ate && desde === ate ? desde : null;

  const tipoContaIds = tipo ? (planoContas ?? []).filter((c) => categoriaDeConta(c) === tipo).map((c) => c.id) : null;

  let query = supabase
    .from("despesas")
    .select(
      produto
        ? "id, data_gasto, valor_total, valor_fatura, forma_pagamento, comprovado, descricao, pagador, programa_id, plano_contas_id, plano_contas:plano_contas_id(codigo, conta), despesa_produtos!inner(produtos(id, nome)), anexos_despesa(id, caminho_arquivo, nome_arquivo, tipo), despesa_parcelas(*), despesa_pagamentos(*), despesa_rateio(pessoa, percentual), acerto_itens(numero_parcela, devedora, valor, acertos_socias(status, tipo, mes_referencia, quitado_em))"
        : "id, data_gasto, valor_total, valor_fatura, forma_pagamento, comprovado, descricao, pagador, programa_id, plano_contas_id, plano_contas:plano_contas_id(codigo, conta), despesa_produtos(produtos(id, nome)), anexos_despesa(id, caminho_arquivo, nome_arquivo, tipo), despesa_parcelas(*), despesa_pagamentos(*), despesa_rateio(pessoa, percentual), acerto_itens(numero_parcela, devedora, valor, acertos_socias(status, tipo, mes_referencia, quitado_em))",
    )
    .order("data_gasto", { ascending: ordemAscendente });

  if (desde) query = query.gte("data_gasto", `${desde}-01`);
  if (ate) query = query.lt("data_gasto", nextMonth(ate));
  if (produto) query = query.eq("despesa_produtos.produto_id", produto);
  if (comprovado === "sim") query = query.eq("comprovado", true);
  if (comprovado === "nao") query = query.eq("comprovado", false);
  if (pagador) query = query.eq("pagador", pagador);
  if (conta) query = query.eq("plano_contas_id", conta);
  if (tipoContaIds) query = query.in("plano_contas_id", tipoContaIds);
  if (descricao) query = query.ilike("descricao", `%${descricao}%`);

  const { data: despesas } = await query;

  // Rateio entre sócias — sobre o MESMO recorte filtrado acima (período, produto, descrição...),
  // pra dar pra isolar um evento/feira específico em vez de sempre olhar o total acumulado. Só o
  // que saiu do bolso de cada uma entra; pago pela "Empresa" (cartão/conta PJ) fica de fora. Cada
  // despesa conta UMA vez, pelo valor total, pra quem pagou ao fornecedor (no cartão, a dona do
  // cartão); o que a outra já transferiu num acerto quitado passa de uma pra outra. O que ainda
  // não foi acertado aparece à parte.
  const pessoasSet = new Set(pagadores);
  const porPagador = new Map<string, number>();
  const somar = (pessoa: string, v: number) => porPagador.set(pessoa, (porPagador.get(pessoa) ?? 0) + v);
  let totalOutros = 0;
  let totalAcertoPendente = 0;
  for (const d of despesas ?? []) {
    if (!d.pagador || d.pagador === "Empresa" || !pessoasSet.has(d.pagador)) {
      totalOutros += Number(d.valor_total);
      continue;
    }
    somar(d.pagador, Number(d.valor_total));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of ((d as any).acerto_itens ?? []) as { devedora: string; valor: number; acertos_socias: { status: string } | null }[]) {
      if (it.acertos_socias?.status !== "quitado") {
        totalAcertoPendente += Number(it.valor);
        continue;
      }
      somar(it.devedora, Number(it.valor));
      somar(d.pagador, -Number(it.valor));
    }
  }

  // Partes divididas que ainda não entraram em nenhum acerto (parcelas futuras do cartão e o que foi
  // pago à vista depois da última geração) — o que as próximas tarefas vão cobrar.
  const sociasNomes = new Set((profiles ?? []).filter((p) => (p as { papel?: string }).papel === "socia").map((p) => p.nome));
  const { itens: aAcertar } = await carregarDevidos(supabase, { ateParcela: "9999-12-31", ateGasto: "9999-12-31", pessoas: sociasNomes });
  const aAcertarPorDupla = new Map<string, number>();
  for (const it of aAcertar) aAcertarPorDupla.set(`${it.devedora} → ${it.credora}`, (aAcertarPorDupla.get(`${it.devedora} → ${it.credora}`) ?? 0) + it.valor);
  const totalGeral = [...porPagador.values()].reduce((a, b) => a + b, 0);
  const linhasPagador = [...porPagador.entries()].sort((a, b) => b[1] - a[1]);
  const metade = totalGeral / 2;
  const temFiltroAtivo = !!(desde || ate || produto || comprovado || pagador || conta || descricao || tipo);

  const exportQs = new URLSearchParams();
  if (desde) exportQs.set("desde", desde);
  if (ate) exportQs.set("ate", ate);
  if (produto) exportQs.set("produto", produto);
  if (comprovado) exportQs.set("comprovado", comprovado);
  if (pagador) exportQs.set("pagador", pagador);
  if (conta) exportQs.set("conta", conta);
  if (descricao) exportQs.set("descricao", descricao);
  if (tipo) exportQs.set("tipo", tipo);

  return (
    <div className="flex flex-col gap-5">
      {((acertosAbertos ?? []).length > 0 || aAcertarPorDupla.size > 0) && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-1 font-heading text-sm font-semibold">Acertos entre sócias</h2>
          <p className="mb-4 text-[11.5px] text-text-muted">
            Despesas divididas pagas por uma de vocês. Cada acerto vira uma tarefa: concluir a tarefa de quem deve marca como pago e avisa a outra.
          </p>
          <div className="flex flex-col gap-2">
            {(acertosAbertos ?? []).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg px-3.5 py-3">
                <div className="text-[12.5px] font-medium">
                  {Number(a.valor) > 0 ? `${a.devedora} transfere ${formatBRL(Number(a.valor))} para ${a.credora}` : `${a.devedora} e ${a.credora}: nada a transferir`}
                  <span className="ml-2 text-[11px] font-normal text-text-muted">
                    {a.tipo === "mensal" && a.mes_referencia ? `fatura de ${rotuloMes(a.mes_referencia)}` : "avulso"}
                    {a.vencimento ? ` · até ${formatDate(a.vencimento)}` : ""}
                    {a.vencimento && a.vencimento < hojeIso ? " · atrasado" : ""}
                  </span>
                </div>
                <a href="/tarefas" className="text-[11.5px] font-medium text-primary-deep">
                  Ver tarefa
                </a>
              </div>
            ))}
            {[...aAcertarPorDupla.entries()].map(([dupla, valor]) => (
              <p key={dupla} className="text-[11px] text-text-faint">
                Ainda vai entrar nos próximos acertos ({dupla}): {formatBRL(valor)} — parcelas futuras do cartão e o que foi pago à vista depois da última geração.
              </p>
            ))}
          </div>
        </div>
      )}

      {linhasPagador.length > 0 && totalGeral > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-1 font-heading text-sm font-semibold">Rateio entre sócias</h2>
          <p className="mb-4 text-[11.5px] text-text-muted">
            Só o que saiu do bolso de cada uma ({formatBRL(totalGeral)}) — pago pela “Empresa” não entra, já foi coberto direto.
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
          {totalAcertoPendente > 0 && (
            <p className="mt-1 text-[11px] text-text-faint">
              {formatBRL(totalAcertoPendente)} em acertos ainda abertos — entram aqui quando a tarefa for concluída.
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-6">
        {(conta || desde || ate || descricao || tipo) && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-primary-soft px-3.5 py-2.5 text-[12px] text-primary-deep">
            <span>
              Filtrado {conta && contaAtual ? `pela conta ${contaAtual.codigo} — ${contaAtual.conta}` : ""}
              {conta && (desde || ate || descricao || tipo) ? " · " : ""}
              {desde ? `de ${desde}` : ""}
              {desde && ate ? " " : ""}
              {ate ? `até ${ate}` : ""}
              {(desde || ate) && (descricao || tipo) ? " · " : ""}
              {tipo ? `tipo: ${labelCategoriaNegocio(tipo)}` : ""}
              {tipo && descricao ? " · " : ""}
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
            {mesExato && <FecharMesButton mes={mesExato} fechado={mesesFechados.has(mesExato)} />}
            <a
              href={`/custos/extrato/export?${exportQs.toString()}`}
              className="rounded-lg border border-border px-3.5 py-2 text-[12px] text-text-muted hover:text-text"
            >
              Exportar CSV
            </a>
            <a
              href={`/custos/extrato/export/xlsx?${exportQs.toString()}`}
              className="rounded-lg border border-border px-3.5 py-2 text-[12px] text-text-muted hover:text-text"
            >
              Exportar XLSX
            </a>
            <a
              href={`/custos/extrato/export/comprovantes?${exportQs.toString()}`}
              className="rounded-lg border border-primary-fill bg-primary-soft px-3.5 py-2 text-[12px] font-medium text-primary-deep hover:bg-primary-soft/70"
              title="Baixa um .zip com as faturas/NF e comprovantes do período filtrado, organizados por lançamento, mais uma planilha índice — pra revisar antes de mandar pro contador, ou pra ele baixar direto."
            >
              ⬇ Comprovantes do período (.zip)
            </a>
            <a
              href="/custos/extrato/export/plano-contas"
              className="rounded-lg border border-border px-3.5 py-2 text-[12px] text-text-muted hover:text-text"
            >
              Baixar plano de contas
            </a>
          </div>
        </div>
        {!mesExato && (
          <p className="mb-4 text-[11px] text-text-faint">
            Pra fechar um mês (travar contra edição/exclusão), preencha “De” e “Até” com o mesmo mês.
          </p>
        )}

        <form className="mb-5 flex flex-wrap items-end gap-3" method="get">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">De</label>
            <input type="month" name="desde" defaultValue={desde} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Até</label>
            <input type="month" name="ate" defaultValue={ate} className="input" />
          </div>
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
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Ordenar por data</label>
            <select name="ordem" defaultValue={ordem ?? "recentes"} className="input">
              <option value="recentes">Mais recentes primeiro</option>
              <option value="antigas">Mais antigas primeiro</option>
            </select>
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
                  programas={programas ?? []}
                  key={d.id}
                  despesa={d as unknown as DespesaRowData}
                  planoContas={planoContas ?? []}
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

function nextMonth(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
