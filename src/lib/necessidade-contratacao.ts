import { FASES, type FaseValue } from "@/lib/fases";

/** Carga horária padrão CLT (44h semanais) convertida em horas/mês — usada como capacidade de referência. */
export const HORAS_MES_PADRAO = (44 * 52) / 12;

export type FaseProdutoInput = {
  produtoId: string;
  fase: FaseValue;
  data_inicio: string | null;
  data_fim: string | null;
};

export type FunilPremissaInput = {
  produtoId: string;
  fase: FaseValue;
  taxa_conversao: number | null;
  capacidade_vendedor_mes: number | null;
  span_of_control: number | null;
  horas_suporte_por_cliente_mes: number | null;
};

export type SimulacaoMesInput = {
  produtoId: string;
  mes_referencia: string;
  novos_clientes: number;
  clientes_ativos: number;
};

export type MesDemandaCargo = {
  mes_referencia: string;
  /** Unidade de demanda: "contatos" (SDR), "vendedores" (Coordenador) ou "horas" (Suporte). */
  demanda: number;
};

const FASE_ORDEM: FaseValue[] = FASES.map((f) => f.value);

function addMonths(dateStr: string, n: number): Date {
  const d = new Date(dateStr + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function isoMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function faseAtivaNoMes<T extends { fase: FaseValue; data_inicio: string | null; data_fim: string | null }>(
  fases: T[],
  mes: Date,
): T | null {
  const dentro = fases.find((f) => {
    if (!f.data_inicio || !f.data_fim) return false;
    const inicio = new Date(f.data_inicio + "T00:00:00");
    const fim = new Date(f.data_fim + "T00:00:00");
    return mes >= new Date(inicio.getFullYear(), inicio.getMonth(), 1) && mes <= fim;
  });
  if (dentro) return dentro;

  const passadas = fases
    .filter((f) => f.data_inicio && new Date(f.data_inicio + "T00:00:00") <= mes)
    .sort((a, b) => (a.data_inicio! < b.data_inicio! ? 1 : -1));
  return passadas[0] ?? null;
}

/**
 * Deriva a demanda mensal de SDR (em contatos necessários), Coordenador (em vendedores que
 * precisam de supervisão) e Suporte (em horas), a partir das premissas de funil por produto/fase
 * e do crescimento de clientes já calculado na simulação (simulacao_mensal).
 */
export function calcularDemandaPorCargo(params: {
  fasesPorProduto: FaseProdutoInput[];
  funis: FunilPremissaInput[];
  simulacao: SimulacaoMesInput[];
}): { sdr: MesDemandaCargo[]; coordenador: MesDemandaCargo[]; suporte: MesDemandaCargo[] } {
  const { fasesPorProduto, funis, simulacao } = params;

  const fasesPorProdutoMap = new Map<string, FaseProdutoInput[]>();
  for (const f of fasesPorProduto) {
    const atual = fasesPorProdutoMap.get(f.produtoId) ?? [];
    atual.push(f);
    fasesPorProdutoMap.set(f.produtoId, atual);
  }

  const funilPorProdutoFase = new Map<string, FunilPremissaInput>();
  for (const f of funis) {
    funilPorProdutoFase.set(`${f.produtoId}__${f.fase}`, f);
  }

  const porMesSdr = new Map<string, number>();
  const porMesCoordenador = new Map<string, number>();
  const porMesSuporte = new Map<string, number>();

  for (const s of simulacao) {
    const fases = fasesPorProdutoMap.get(s.produtoId) ?? [];
    const mes = new Date(s.mes_referencia + "T00:00:00");
    const faseAtiva = faseAtivaNoMes(fases, mes);
    if (!faseAtiva) continue;

    const funil = funilPorProdutoFase.get(`${s.produtoId}__${faseAtiva.fase}`);
    if (!funil) continue;

    const mesIso = isoMonth(mes);

    if (funil.taxa_conversao && funil.capacidade_vendedor_mes) {
      const contatosNecessarios = s.novos_clientes / funil.taxa_conversao;
      const vendedoresNecessarios = contatosNecessarios / funil.capacidade_vendedor_mes;
      porMesSdr.set(mesIso, (porMesSdr.get(mesIso) ?? 0) + contatosNecessarios);
      // Demanda do Coordenador = quantidade de vendedores que precisam de supervisão nesse mês
      // (o modelo de contratação escolhido define quantos vendedores 1 coordenador cobre).
      porMesCoordenador.set(mesIso, (porMesCoordenador.get(mesIso) ?? 0) + vendedoresNecessarios);
    }

    if (funil.horas_suporte_por_cliente_mes) {
      porMesSuporte.set(mesIso, (porMesSuporte.get(mesIso) ?? 0) + s.clientes_ativos * funil.horas_suporte_por_cliente_mes);
    }
  }

  const toArray = (m: Map<string, number>): MesDemandaCargo[] =>
    [...m.entries()]
      .map(([mes_referencia, demanda]) => ({ mes_referencia, demanda }))
      .sort((a, b) => (a.mes_referencia < b.mes_referencia ? -1 : 1));

  return { sdr: toArray(porMesSdr), coordenador: toArray(porMesCoordenador), suporte: toArray(porMesSuporte) };
}

export { FASE_ORDEM };
