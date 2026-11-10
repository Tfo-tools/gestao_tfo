import { dataLocal } from "@/lib/agenda-combinada";

/**
 * Mapa por pessoa da viagem: uma faixa por participante, um dia por coluna, pintada com o lugar
 * onde a pessoa está naquele dia. Portado do "Viagens em Família" (lib/map.ts), com três
 * acréscimos pedidos em 10/11/2026: parar a barra quando a pessoa volta pra casa, e marcar nos
 * dias certos o evento e o carro alugado — que não dizem onde a pessoa dorme, mas dizem o que ela
 * está fazendo. Função pura: a tela só desenha.
 */

export type ItemMapa = {
  id: string;
  tipo: string;
  titulo: string;
  inicio: string | null;
  fim: string | null;
  origem: string | null;
  destino: string | null;
  local: string | null;
};
export type PessoaMapa = { id: string; nome: string };

/** [inicio, fim) em índices de dia. */
export type Segmento = { inicio: number; fim: number; lugar: string; cor: string; titulo: string };
export type Faixa = { pessoa: PessoaMapa; segmentos: Segmento[]; voos: number[]; eventos: number[]; carros: number[] };
export type MapaViagem = { dias: string[]; faixas: Faixa[]; cores: Record<string, string> };

const PALETA = ["#1F4E5F", "#C9785D", "#6B7B5E", "#C99A3B", "#8E6BB8", "#D46A8E", "#3FA796", "#3E9FE0", "#B5654A", "#5C7FA3"];
const SEM_LUGAR = "#A39E93";
const MAX_DIAS = 120;

const dia = (iso: string | null | undefined) => (iso ? dataLocal(iso) : null);
const cidade = (s: string | null | undefined) => (s ?? "").replace(/\(.*?\)/g, "").trim();
const chave = (s: string | null | undefined) => cidade(s).toLowerCase();

function somarDias(d: string, n: number) {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
function diasEntre(a: string, b: string) {
  const out: string[] = [];
  for (let cur = a; cur <= b && out.length < MAX_DIAS; cur = somarDias(cur, 1)) out.push(cur);
  return out;
}

export function montarMapaViagem(
  viagem: { data_inicio: string | null; data_fim: string | null },
  pessoas: PessoaMapa[],
  itens: ItemMapa[],
  participantesPorItem: Record<string, string[]>,
): MapaViagem | null {
  const diasItens = itens.flatMap((i) => [dia(i.inicio), dia(i.fim)]).filter((d): d is string => Boolean(d)).sort();
  const ini = viagem.data_inicio ?? diasItens[0];
  const fim = viagem.data_fim ?? diasItens[diasItens.length - 1];
  if (!ini || !fim) return null;
  const dias = diasEntre(ini <= fim ? ini : fim, fim >= ini ? fim : ini);

  const indice = (d: string | null) => {
    if (!d) return -1;
    if (d < dias[0]) return 0;
    if (d > dias[dias.length - 1]) return dias.length - 1;
    return dias.indexOf(d);
  };
  const cores: Record<string, string> = {};
  const corDe = (lugar: string) => {
    if (!cores[lugar]) cores[lugar] = PALETA[Object.keys(cores).length % PALETA.length] ?? SEM_LUGAR;
    return cores[lugar];
  };
  // Sem marcação no item = todo mundo está (regra do Gestão).
  const estaNoItem = (it: ItemMapa, pid: string) => {
    const lista = participantesPorItem[it.id];
    return lista && lista.length ? lista.includes(pid) : true;
  };
  const diasDoItem = (it: ItemMapa) => {
    const a = indice(dia(it.inicio));
    if (a < 0) return [];
    const b = Math.max(indice(dia(it.fim) ?? dia(it.inicio)), a);
    const out: number[] = [];
    for (let d = a; d <= b; d++) out.push(d);
    return out;
  };

  const faixas: Faixa[] = pessoas.map((pessoa) => {
    const meus = itens.filter((i) => estaNoItem(i, pessoa.id));
    type Celula = { lugar: string; cor: string; titulo: string };
    const celulas: (Celula | null)[] = dias.map(() => null);
    const pintar = (de: number, ate: number, c: Celula) => {
      for (let d = Math.max(de, 0); d < Math.min(ate, dias.length); d++) celulas[d] = c;
    };

    // 1) Voos: do pouso até a próxima partida. Casa = origem do primeiro voo; ao voltar, a barra para.
    const voos = meus.filter((i) => i.tipo === "voo" && i.inicio).sort((a, b) => a.inicio!.localeCompare(b.inicio!));
    const casa = chave(voos[0]?.origem);
    voos.forEach((v, k) => {
      const destino = cidade(v.local || v.destino);
      if (!destino || (casa && chave(destino) === casa)) return;
      const chegada = indice(dia(v.fim) ?? dia(v.inicio));
      const proximo = voos[k + 1];
      const ate = proximo ? indice(dia(proximo.inicio)) : dias.length;
      pintar(chegada, Math.max(ate, chegada + 1), { lugar: destino, cor: corDe(destino), titulo: v.titulo });
    });

    // 2) Hospedagem diz o lugar exato e tem prioridade: do check-in até o dia do check-out.
    meus
      .filter((i) => i.tipo === "hospedagem" && i.inicio)
      .forEach((h) => {
        const lugar = cidade(h.local || h.destino) || h.titulo;
        const a = indice(dia(h.inicio));
        const b = indice(dia(h.fim) ?? somarDias(dia(h.inicio)!, 1));
        pintar(a, Math.max(b, a + 1), { lugar, cor: corDe(lugar), titulo: h.titulo });
      });

    // Dias seguidos no mesmo lugar viram um bloco só.
    const segmentos: Segmento[] = [];
    celulas.forEach((c, d) => {
      if (!c) return;
      const ultimo = segmentos[segmentos.length - 1];
      if (ultimo && ultimo.fim === d && ultimo.lugar === c.lugar) ultimo.fim = d + 1;
      else segmentos.push({ inicio: d, fim: d + 1, ...c });
    });

    const marcar = (tipo: string) => [...new Set(meus.filter((i) => i.tipo === tipo).flatMap(diasDoItem))].sort((a, b) => a - b);
    return {
      pessoa,
      segmentos,
      voos: voos.map((v) => indice(dia(v.inicio))).filter((n) => n >= 0),
      eventos: marcar("evento"),
      carros: marcar("carro"),
    };
  });

  return { dias, faixas, cores };
}

/** Onde cada uma está num dia — o resumo que aparece ao tocar numa data. */
export function ondeNoDia(mapa: MapaViagem, i: number) {
  const grupos = new Map<string, string[]>();
  const voando: string[] = [];
  const emEvento: string[] = [];
  const comCarro: string[] = [];
  for (const f of mapa.faixas) {
    const seg = f.segmentos.find((s) => i >= s.inicio && i < s.fim);
    const lugar = seg ? seg.lugar : "Fora da viagem";
    grupos.set(lugar, [...(grupos.get(lugar) ?? []), f.pessoa.nome]);
    if (f.voos.includes(i)) voando.push(f.pessoa.nome);
    if (f.eventos.includes(i)) emEvento.push(f.pessoa.nome);
    if (f.carros.includes(i)) comCarro.push(f.pessoa.nome);
  }
  return { grupos: [...grupos.entries()], voando, emEvento, comCarro };
}
