import { FASES, type FaseValue } from "@/lib/fases";

/** Carga horária padrão CLT (44h semanais) convertida em horas/mês. */
export const HORAS_MES_PADRAO = (44 * 52) / 12;

export type FaseProdutoInput = {
  produtoId: string;
  fase: FaseValue;
  data_inicio: string | null;
  data_fim: string | null;
};

export type AlocacaoPorFaseInput = {
  produtoId: string;
  fase: FaseValue;
  cargo: string;
  quantidade_funcionarios: number;
  horas_mes: number;
};

export type ContratacaoCapacidadeInput = {
  cargo: string;
  data_inicio: string | null;
  data_fim: string | null;
};

export type MesNecessidadeCargo = {
  mes_referencia: string;
  horas_demandadas: number;
  pessoas_necessarias: number;
  pessoas_contratadas: number;
  gap: number;
};

const FASE_ORDEM: FaseValue[] = FASES.map((f) => f.value);

function addMonths(dateStr: string, n: number): Date {
  const d = new Date(dateStr + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function isoMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function normalizarCargo(cargo: string): string {
  return cargo.trim().toLowerCase();
}

function faseAtivaNoMes(fases: FaseProdutoInput[], mes: Date): FaseProdutoInput | null {
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

function contratacoesAtivasNoMes(contratacoes: ContratacaoCapacidadeInput[], cargoNormalizado: string, mes: Date): number {
  return contratacoes.filter((c) => {
    if (normalizarCargo(c.cargo) !== cargoNormalizado) return false;
    const inicio = c.data_inicio ? new Date(c.data_inicio + "T00:00:00") : null;
    const fim = c.data_fim ? new Date(c.data_fim + "T00:00:00") : null;
    const iniciouAntes = !inicio || new Date(inicio.getFullYear(), inicio.getMonth(), 1) <= mes;
    const aindaAtiva = !fim || fim >= mes;
    return iniciouAntes && aindaAtiva;
  }).length;
}

/**
 * Cruza a alocação de horas por produto/fase com a capacidade instalada (contratações ativas)
 * para estimar, mês a mês e por cargo, quantas pessoas são necessárias — e a partir de quando
 * a demanda de horas passa a exigir uma nova contratação.
 */
export function calcularNecessidadePorCargo(params: {
  fasesPorProduto: FaseProdutoInput[];
  alocacoes: AlocacaoPorFaseInput[];
  contratacoes: ContratacaoCapacidadeInput[];
  meses?: number;
}): Map<string, MesNecessidadeCargo[]> {
  const { fasesPorProduto, alocacoes, contratacoes } = params;
  const totalMeses = params.meses ?? 60;

  const dataBase = fasesPorProduto
    .filter((f) => f.data_inicio)
    .map((f) => f.data_inicio!)
    .sort()[0];
  if (!dataBase) return new Map();

  const fasesPorProdutoMap = new Map<string, FaseProdutoInput[]>();
  for (const f of fasesPorProduto) {
    const atual = fasesPorProdutoMap.get(f.produtoId) ?? [];
    atual.push(f);
    fasesPorProdutoMap.set(f.produtoId, atual);
  }

  const cargosNormalizados = new Set<string>();
  const nomeOriginalPorCargo = new Map<string, string>();
  for (const a of alocacoes) {
    const norm = normalizarCargo(a.cargo);
    cargosNormalizados.add(norm);
    if (!nomeOriginalPorCargo.has(norm)) nomeOriginalPorCargo.set(norm, a.cargo.trim());
  }
  for (const c of contratacoes) {
    const norm = normalizarCargo(c.cargo);
    cargosNormalizados.add(norm);
    if (!nomeOriginalPorCargo.has(norm)) nomeOriginalPorCargo.set(norm, c.cargo.trim());
  }

  const resultado = new Map<string, MesNecessidadeCargo[]>();
  for (const cargoNorm of cargosNormalizados) {
    const linhas: MesNecessidadeCargo[] = [];

    for (let i = 0; i < totalMeses; i++) {
      const mes = addMonths(dataBase, i);

      let horasDemandadas = 0;
      for (const [produtoId, fases] of fasesPorProdutoMap) {
        const faseAtiva = faseAtivaNoMes(fases, mes);
        if (!faseAtiva) continue;
        for (const a of alocacoes) {
          if (a.produtoId !== produtoId || a.fase !== faseAtiva.fase) continue;
          if (normalizarCargo(a.cargo) !== cargoNorm) continue;
          horasDemandadas += a.quantidade_funcionarios * a.horas_mes;
        }
      }

      const pessoasContratadas = contratacoesAtivasNoMes(contratacoes, cargoNorm, mes);
      const pessoasNecessarias = Math.ceil(horasDemandadas / HORAS_MES_PADRAO);

      linhas.push({
        mes_referencia: isoMonth(mes),
        horas_demandadas: horasDemandadas,
        pessoas_necessarias: pessoasNecessarias,
        pessoas_contratadas: pessoasContratadas,
        gap: pessoasNecessarias - pessoasContratadas,
      });
    }

    resultado.set(nomeOriginalPorCargo.get(cargoNorm) ?? cargoNorm, linhas);
  }

  return resultado;
}

export { FASE_ORDEM };
