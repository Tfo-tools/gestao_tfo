import { cargoChave, type CargoChave, type DemandaProdutoMes } from "@/lib/necessidade-contratacao";
import { custoMensalModelo, volumeCobertoPelaAlocacao, type ParametrosModelo, type TipoModelo } from "@/lib/modelos-contratacao";
import { subgrupoDeCargo, type SubgrupoConta } from "@/lib/subgrupo-conta";

/**
 * Custo da equipe alocada (Necessidade de Contratação) num mês — uma regra só, usada pelo
 * resumo do cenário, pelo detalhamento mensal e pela tela de necessidade.
 *
 * Cada alocação pode valer para alguns produtos (ex: SDR PJ + vendedor só no Fashion Mind; SDR as a
 * Service só no Price e no Skills). Sem produto marcado, vale para todos. A demanda é CONSUMIDA:
 * primeiro as alocações presas a produto, depois as gerais — duas alocações no mesmo mês nunca
 * cobram a mesma reunião duas vezes.
 */

export type AlocacaoEquipe = {
  id: string;
  cargo: string;
  modelo_id: string;
  quantidade: number;
  data_inicio: string | null;
  data_fim: string | null;
  produto_id?: string | null;
  produto_ids?: string[] | null;
  created_at?: string | null;
};

export type ModeloEquipe = {
  id: string;
  nome?: string | null;
  cargo: string;
  tipo_modelo: string;
  categoria: "pd" | "sm" | "ga";
  parametros: ParametrosModelo;
};

/** Produtos em que a alocação trabalha — null = todos. */
export function produtosDaAlocacao(a: Pick<AlocacaoEquipe, "produto_id" | "produto_ids">): string[] | null {
  if (a.produto_ids && a.produto_ids.length > 0) return a.produto_ids;
  if (a.produto_id) return [a.produto_id];
  return null;
}

export function alocacaoAtivaNoMes(a: Pick<AlocacaoEquipe, "data_inicio" | "data_fim">, mesIso: string): boolean {
  const mes = new Date(mesIso.slice(0, 7) + "-01T00:00:00");
  const inicio = a.data_inicio ? new Date(a.data_inicio + "T00:00:00") : null;
  const fim = a.data_fim ? new Date(a.data_fim + "T00:00:00") : null;
  const iniciouAntes = !inicio || new Date(inicio.getFullYear(), inicio.getMonth(), 1) <= mes;
  const aindaAtiva = !fim || fim >= mes;
  return iniciouAntes && aindaAtiva;
}

/** Demanda do cargo na unidade que o modelo cobra: reuniões (SDR e vendedor), vendedores a
 *  supervisionar (coordenador) e horas (suporte). */
export function demandaDoCargo(d: DemandaProdutoMes | undefined, chave: CargoChave): number {
  if (!d) return 0;
  switch (chave) {
    case "sdr":
      return d.sdr;
    case "vendedor":
      return d.reunioesVendedor;
    case "coordenador":
      return d.vendedores;
    case "suporte":
      return d.suporte;
  }
}

export type ItemEquipeMes = {
  alocacaoId: string;
  chave: CargoChave | null;
  modelo: ModeloEquipe;
  tipo: TipoModelo;
  sub: SubgrupoConta;
  custo: number;
  /** Demanda disponível para esta alocação (depois das anteriores) e quanto ela cobriu. */
  demanda: number;
  coberto: number;
  unidades: number;
  /** Custo atribuído a cada produto, pela parte da demanda que ela cobriu ("" = sem produto). */
  porProduto: Record<string, number>;
  rotulo: string;
};

export type EquipeMes = {
  itens: ItemEquipeMes[];
  /** Demanda que sobrou sem ninguém alocado — esforço próprio, sem custo. */
  descoberto: Record<CargoChave, number>;
};

const CHAVES: CargoChave[] = ["sdr", "vendedor", "coordenador", "suporte"];

export function custoEquipeNoMes(params: {
  mes: string;
  alocacoes: AlocacaoEquipe[];
  modelos: Map<string, ModeloEquipe>;
  /** Demanda deste mês, por produto. */
  demanda: Record<string, DemandaProdutoMes>;
  /** Receita média por cliente de cada produto no mês — base da comissão % do vendedor. */
  arpuPorProduto?: Record<string, number>;
}): EquipeMes {
  const { mes, alocacoes, modelos, demanda, arpuPorProduto = {} } = params;
  const produtos = Object.keys(demanda);
  const restante: Record<string, Record<CargoChave, number>> = {};
  const vendasRestantes: Record<string, number> = {};
  for (const p of produtos) {
    restante[p] = { sdr: 0, vendedor: 0, coordenador: 0, suporte: 0 };
    for (const c of CHAVES) restante[p][c] = demandaDoCargo(demanda[p], c);
    vendasRestantes[p] = demanda[p].vendasComReuniao;
  }

  const ativas = alocacoes
    .filter((a) => alocacaoAtivaNoMes(a, mes))
    .map((a) => ({ a, escopo: produtosDaAlocacao(a) }))
    .sort(
      (x, y) =>
        (x.escopo ? 0 : 1) - (y.escopo ? 0 : 1) ||
        (x.a.data_inicio ?? "").localeCompare(y.a.data_inicio ?? "") ||
        (x.a.created_at ?? "").localeCompare(y.a.created_at ?? ""),
    );

  const itens: ItemEquipeMes[] = [];
  for (const { a, escopo } of ativas) {
    const modelo = modelos.get(a.modelo_id);
    if (!modelo) continue;
    const chave = cargoChave(a.cargo) ?? cargoChave(modelo.cargo);
    const tipo = modelo.tipo_modelo as TipoModelo;
    const alvo = (escopo ?? produtos).filter((p) => restante[p]);
    const disponivelPorProduto = alvo.map((p) => (chave ? Math.max(0, restante[p][chave]) : 0));
    const disponivel = disponivelPorProduto.reduce((s, v) => s + v, 0);
    const { coberto, cobrado } = volumeCobertoPelaAlocacao(tipo, modelo.parametros, Number(a.quantidade), disponivel);
    const fator = disponivel > 0 ? Math.min(1, coberto / disponivel) : 0;

    let vendas = 0;
    let receitaNovasVendas = 0;
    alvo.forEach((p, i) => {
      if (chave) restante[p][chave] -= disponivelPorProduto[i] * fator;
      if (chave === "vendedor") {
        const v = vendasRestantes[p] * fator;
        vendasRestantes[p] -= v;
        vendas += v;
        receitaNovasVendas += v * (arpuPorProduto[p] ?? 0);
      }
    });

    const contexto =
      chave === "sdr"
        ? { reunioes: coberto }
        : chave === "vendedor"
          ? { reunioes: coberto, vendas, receitaNovasVendas }
          : {};
    const { custoMensal, unidades } = custoMensalModelo(tipo, modelo.parametros, cobrado, contexto);

    const porProduto: Record<string, number> = {};
    const consumoTotal = disponivel * fator;
    if (consumoTotal > 0) {
      alvo.forEach((p, i) => {
        const parte = (disponivelPorProduto[i] * fator) / consumoTotal;
        if (parte > 0) porProduto[p] = (porProduto[p] ?? 0) + custoMensal * parte;
      });
    } else if (custoMensal > 0) {
      if (escopo && alvo.length > 0) for (const p of alvo) porProduto[p] = custoMensal / alvo.length;
      else porProduto[""] = custoMensal;
    }

    itens.push({
      alocacaoId: a.id,
      chave,
      modelo,
      tipo,
      sub: subgrupoDeCargo(modelo.cargo, modelo.categoria),
      custo: custoMensal,
      demanda: disponivel,
      coberto,
      unidades,
      porProduto,
      rotulo: `${modelo.nome ?? a.cargo} — ${a.cargo}`,
    });
  }

  const descoberto: Record<CargoChave, number> = { sdr: 0, vendedor: 0, coordenador: 0, suporte: 0 };
  for (const p of produtos) for (const c of CHAVES) descoberto[c] += Math.max(0, restante[p][c]);
  return { itens, descoberto };
}
