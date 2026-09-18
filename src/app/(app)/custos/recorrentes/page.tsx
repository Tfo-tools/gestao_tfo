import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RecorrenteRow, type RecorrenteRowData } from "./recorrente-row";
import { categoriaDeConta, labelCategoriaNegocio, CATEGORIAS_NEGOCIO } from "@/lib/categoria-negocio";
import { SecaoRecolhivel } from "@/components/secao-recolhivel";

export default async function RecorrentesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; ordem?: string }>;
}) {
  const { tipo, ordem } = await searchParams;
  const supabase = await createClient();

  const [{ data: planoContas }, { data: produtos }, { data: profiles }, { data: recorrentes }] = await Promise.all([
    supabase.from("plano_contas").select("id, codigo, conta, tipo").in("tipo", ["cogs", "opex", "financeiro", "ativo"]).order("codigo"),
    supabase.from("produtos").select("id, nome").order("nome"),
    supabase.from("profiles").select("nome").order("nome"),
    supabase
      .from("despesas_recorrentes")
      .select(
        "id, descricao, valor, pagador, dia_do_mes, ativo, data_inicio, data_fim, plano_contas_id, plano_contas:plano_contas_id(codigo, conta), despesa_recorrente_produtos(produtos(id, nome))",
      )
      .order("descricao"),
  ]);

  const pagadores = (profiles ?? []).map((p) => p.nome);

  const recorrentesFiltradas = tipo
    ? (recorrentes ?? []).filter((r) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conta = r.plano_contas as any as { codigo: string; conta: string } | null;
        return conta ? categoriaDeConta(conta) === tipo : false;
      })
    : (recorrentes ?? []);
  // Ranking por data de início: mais recentes primeiro por padrão, ou mais antigas primeiro pra
  // achar rápido a recorrência mais velha (mesmo critério do Extrato).
  const ordemAntigas = ordem === "antigas";
  const recorrentesOrdenadas = [...recorrentesFiltradas].sort((a, b) =>
    ordemAntigas ? a.data_inicio.localeCompare(b.data_inicio) : b.data_inicio.localeCompare(a.data_inicio),
  );
  // Ativas na lista principal; pausadas num bloco recolhido abaixo, no mesmo formato.
  const ativas = recorrentesOrdenadas.filter((r) => r.ativo !== false);
  const pausadas = recorrentesOrdenadas.filter((r) => r.ativo === false);
  const valorMensal = (lista: typeof ativas) => lista.reduce((s, r) => s + Number(r.valor ?? 0), 0);
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const tabela = (lista: typeof ativas) => (
    <table className="w-full border-collapse text-[12.5px]">
      <thead>
        <tr className="text-left text-text-muted">
          <th className="px-2 py-1.5 font-medium">Descrição</th>
          <th className="px-2 py-1.5 font-medium">Categoria</th>
          <th className="px-2 py-1.5 font-medium">Produto</th>
          <th className="px-2 py-1.5 text-right font-medium">Valor/mês</th>
          <th className="px-2 py-1.5 text-center font-medium">Dia</th>
          <th className="px-2 py-1.5 font-medium">Início</th>
          <th className="px-2 py-1.5 text-center font-medium">Status</th>
          <th className="px-2 py-1.5" />
        </tr>
      </thead>
      <tbody>
        {lista.map((r) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rr = r as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            produtoIds: produtosLigados.map((p: any) => p.id),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            produtoNomes: produtosLigados.map((p: any) => p.nome),
          };
          return <RecorrenteRow key={rr.id} recorrente={dado} planoContas={planoContas ?? []} produtos={produtos ?? []} pagadores={pagadores} />;
        })}
      </tbody>
    </table>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-dashed border-border bg-surface px-5 py-4 text-[12.5px] text-text-muted">
        Essa tela é só o <b>cadastro</b> — criar, editar, pausar ou excluir a recorrência em si. Nova recorrência? Cria em{" "}
        <Link href="/custos" className="font-medium text-primary-deep underline">
          Custos → Lançamentos
        </Link>
        , marcando “Isso se repete todo mês?”. Anexar fatura/comprovante, marcar como comprovado ou revisar o valor pago de cada mês
        gerado é sempre em{" "}
        <Link href="/custos/extrato" className="font-medium text-primary-deep underline">
          Extrato
        </Link>{" "}
        — ele já traz os lançamentos de qualquer recorrência, com filtro e ordenação.
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 font-heading text-sm font-semibold">
          Recorrências ativas ({ativas.length}){ativas.length > 0 && <span className="ml-2 font-mono font-normal text-text-muted">{brl(valorMensal(ativas))}/mês</span>}
        </h2>
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
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Ordenar por início</label>
            <select name="ordem" defaultValue={ordem ?? "recentes"} className="input">
              <option value="recentes">Mais recentes primeiro</option>
              <option value="antigas">Mais antigas primeiro</option>
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white">
            Filtrar
          </button>
          {(tipo || ordem) && (
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
        {ativas.length === 0 ? (
          <p className="text-[13px] text-text-muted">
            {tipo ? "Nenhuma recorrência ativa desse tipo." : pausadas.length > 0 ? "Nenhuma recorrência ativa — as cadastradas estão pausadas." : "Nenhuma despesa recorrente cadastrada ainda."}
          </p>
        ) : (
          tabela(ativas)
        )}
      </div>

      {pausadas.length > 0 && (
        <SecaoRecolhivel
          titulo={`Recorrências pausadas (${pausadas.length})`}
          resumo={`${brl(valorMensal(pausadas))}/mês fora das despesas — clique para ver e reativar`}
        >
          <div className="p-5">{tabela(pausadas)}</div>
        </SecaoRecolhivel>
      )}
    </div>
  );
}
