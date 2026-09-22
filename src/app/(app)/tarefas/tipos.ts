export type Pessoa = { id: string; nome: string };
export type Produto = { id: string; nome: string };

export type Projeto = {
  id: string;
  nome: string;
  descricao: string | null;
  objetivo: string | null;
  produto_fase_id: string | null;
  status: "ativo" | "concluido" | "arquivado";
};

export type FaseProjeto = {
  id: string;
  projeto_id: string;
  nome: string;
  ordem: number;
  data_inicio: string | null;
  data_fim: string | null;
};

/** Fase de PRODUTO (do plano) — só pra um projeto declarar qual fase ele serve. */
export type FaseProdutoOpcao = { id: string; label: string };

export type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  responsavel_id: string | null;
  prazo: string | null;
  data_inicio: string | null;
  status: string;
  /** Produtos que a tarefa atende (produtos.id); vazio = nenhum em particular. */
  produtos: string[];
  area: string | null;
  projeto_id: string | null;
  fase_id: string | null;
  parent_id: string | null;
  etiquetas: string[];
  /** Quem faz junto (profiles.id), além do responsável. */
  participantes: string[];
  ordem: number;
};

export type AnexoTarefa = {
  id: string;
  tarefa_id: string;
  nome_arquivo: string;
  caminho_arquivo: string;
  tamanho_bytes: number | null;
};

export type Dependencia = { tarefa_id: string; depende_de_id: string };

export type TarefaNo = Tarefa & {
  filhas: TarefaNo[];
  /** Tarefas das quais esta depende e que ainda não estão feitas — se houver, está bloqueada. */
  aguardando: Tarefa[];
  /** Tarefas ainda abertas que dependem desta — o que ela "libera" ao ficar feita. */
  libera: Tarefa[];
  /** Progresso das filhas (0–1), ou null se não tem filhas. */
  progresso: number | null;
};

export const STATUS_LABEL: Record<string, string> = { a_fazer: "A fazer", fazendo: "Fazendo", feito: "Feito" };
export const STATUS_ORDEM = ["a_fazer", "fazendo", "feito"];

/** Monta a árvore e calcula bloqueio/progresso. `raizes` só com as que não têm mãe (ou cuja mãe
 * ficou fora do filtro — aí sobem pra raiz, pra não sumirem). */
export function montarArvore(tarefas: Tarefa[], deps: Dependencia[]): TarefaNo[] {
  const porId = new Map<string, Tarefa>(tarefas.map((t) => [t.id, t]));
  const nos = new Map<string, TarefaNo>();
  for (const t of tarefas) nos.set(t.id, { ...t, filhas: [], aguardando: [], libera: [], progresso: null });

  for (const d of deps) {
    const no = nos.get(d.tarefa_id);
    const alvo = porId.get(d.depende_de_id);
    if (no && alvo && alvo.status !== "feito") no.aguardando.push(alvo);
    const dependente = porId.get(d.tarefa_id);
    const noAlvo = nos.get(d.depende_de_id);
    if (noAlvo && dependente && dependente.status !== "feito") noAlvo.libera.push(dependente);
  }

  const raizes: TarefaNo[] = [];
  for (const no of nos.values()) {
    const mae = no.parent_id ? nos.get(no.parent_id) : undefined;
    if (mae) mae.filhas.push(no);
    else raizes.push(no);
  }

  const ordenar = (lista: TarefaNo[]) => {
    lista.sort((a, b) => a.ordem - b.ordem || (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999") || a.titulo.localeCompare(b.titulo));
    for (const n of lista) {
      ordenar(n.filhas);
      if (n.filhas.length > 0) {
        const total = contar(n.filhas);
        n.progresso = total.total > 0 ? total.feitas / total.total : null;
      }
    }
  };
  ordenar(raizes);
  return raizes;
}

function contar(nos: TarefaNo[]): { total: number; feitas: number } {
  let total = 0, feitas = 0;
  for (const n of nos) {
    total++;
    if (n.status === "feito") feitas++;
    const sub = contar(n.filhas);
    total += sub.total;
    feitas += sub.feitas;
  }
  return { total, feitas };
}

/** Achata a árvore em ordem visual (mãe, depois filhas), com a profundidade. */
export function achatar(nos: TarefaNo[], nivel = 0): { no: TarefaNo; nivel: number }[] {
  return nos.flatMap((n) => [{ no: n, nivel }, ...achatar(n.filhas, nivel + 1)]);
}
