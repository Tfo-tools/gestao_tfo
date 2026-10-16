/**
 * Rotina de gestão: tarefas recorrentes em CALENDÁRIO FIXO — "todo dia 5", "toda segunda".
 *
 * Objetivo: acompanhamento e controle que permitam agir antes do problema. Por isso:
 *  - Cada ocorrência vira uma tarefa normal (prazo, responsável, etiqueta "rotina"), que aparece na
 *    lista, no calendário da agenda e no resumo da manhã.
 *  - UMA ABERTA POR VEZ (decisão de 16/10/2026): a próxima ocorrência só nasce quando a atual é
 *    concluída — antes nasciam todas as ocorrências 14 dias antes do prazo e a lista enchia de
 *    semanas futuras. No modo "cada uma", a regra vale por pessoa: concluir a sua libera a sua próxima.
 *  - Calendário fixo: a próxima cai na data dela (nunca antes de hoje), mesmo que a anterior tenha
 *    sido concluída com atraso — não empurra o calendário.
 *  - `gerado_ate` guarda o último prazo gerado, só pra informação.
 * A parte de datas é pura (sem banco) pra ser testável.
 */

export type Frequencia = "semanal" | "quinzenal" | "mensal" | "trimestral" | "anual";

/**
 * cada_uma: cada pessoa tem a sua tarefa (ex.: atualizar as despesas que ELA pagou na semana).
 * juntas:   uma tarefa só, com todas (ex.: olhar os resultados juntas).
 */
export type ModoRotina = "cada_uma" | "juntas";

export const LABEL_MODO: Record<ModoRotina, string> = {
  cada_uma: "Cada uma tem a sua",
  juntas: "Juntas (uma tarefa)",
};

export type Rotina = {
  id: string;
  titulo: string;
  descricao: string | null;
  /** Quem tem a rotina (profiles.id). */
  pessoas: string[];
  modo: ModoRotina;
  frequencia: Frequencia;
  dia_semana: number | null;
  dia_mes: number | null;
  mes_inicio: number | null;
  inicio: string;
  ativo: boolean;
  gerado_ate: string | null;
  area: string | null;
};

export const LABEL_FREQUENCIA: Record<Frequencia, string> = {
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
};

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// ── Datas em UTC puro (AAAA-MM-DD), pra não tropeçar em fuso nem em horário de verão ─────────
const paraData = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const paraIso = (d: Date) => d.toISOString().slice(0, 10);
export const somarDias = (iso: string, n: number) => {
  const d = paraData(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return paraIso(d);
};
const ultimoDiaDoMes = (ano: number, mes0: number) => new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();

/** Hoje em São Paulo (a data que a equipe vê no relógio). */
export function hojeSP(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Mês (1–12) em que cai uma ocorrência trimestral/anual. */
function mesValido(rotina: Pick<Rotina, "frequencia" | "mes_inicio">, mes1: number): boolean {
  const base = rotina.mes_inicio ?? 1;
  if (rotina.frequencia === "trimestral") return ((mes1 - base) % 3 + 3) % 3 === 0;
  if (rotina.frequencia === "anual") return mes1 === base;
  return true;
}

/**
 * Todas as datas da rotina entre `de` e `ate` (inclusive), nunca antes do início dela. Dia 31 em mês
 * de 30 cai no último dia do mês — "todo dia 31" vira "todo fim de mês", que é o que se quer dizer.
 */
export function datasDaRotina(
  rotina: Pick<Rotina, "frequencia" | "dia_semana" | "dia_mes" | "mes_inicio" | "inicio">,
  de: string,
  ate: string,
): string[] {
  const inicio = de > rotina.inicio ? de : rotina.inicio;
  if (inicio > ate) return [];
  const datas: string[] = [];

  if (rotina.frequencia === "semanal" || rotina.frequencia === "quinzenal") {
    const alvo = rotina.dia_semana ?? 1;
    // Âncora: primeira data com o dia da semana certo a partir do início da rotina. A quinzenal
    // conta semanas a partir dela, então não "pula" de fase ao gerar em janelas diferentes.
    let ancora = rotina.inicio;
    while (paraData(ancora).getUTCDay() !== alvo) ancora = somarDias(ancora, 1);
    const passo = rotina.frequencia === "quinzenal" ? 14 : 7;
    for (let d = ancora; d <= ate; d = somarDias(d, passo)) if (d >= inicio) datas.push(d);
    return datas;
  }

  const dia = rotina.dia_mes ?? 1;
  const d0 = paraData(inicio);
  let ano = d0.getUTCFullYear();
  let mes0 = d0.getUTCMonth();
  for (;;) {
    const iso = paraIso(new Date(Date.UTC(ano, mes0, Math.min(dia, ultimoDiaDoMes(ano, mes0)))));
    if (iso > ate) break;
    if (iso >= inicio && mesValido(rotina, mes0 + 1)) datas.push(iso);
    mes0 += 1;
    if (mes0 === 12) {
      mes0 = 0;
      ano += 1;
    }
  }
  return datas;
}

/** A próxima ocorrência a partir de hoje (inclusive). */
export function proximaData(rotina: Pick<Rotina, "frequencia" | "dia_semana" | "dia_mes" | "mes_inicio" | "inicio">, hoje: string): string | null {
  return datasDaRotina(rotina, hoje, somarDias(hoje, 400))[0] ?? null;
}

/** "toda segunda", "todo dia 5", "trimestral · dia 10 de jan, abr, jul, out". */
export function descreverFrequencia(rotina: Pick<Rotina, "frequencia" | "dia_semana" | "dia_mes" | "mes_inicio">): string {
  const dia = DIAS[rotina.dia_semana ?? 1];
  const artigo = (rotina.dia_semana ?? 1) === 0 || (rotina.dia_semana ?? 1) === 6 ? "todo" : "toda";
  const diaMes = rotina.dia_mes ?? 1;
  const noDia = diaMes >= 29 ? `dia ${diaMes} (ou o último do mês)` : `dia ${diaMes}`;
  switch (rotina.frequencia) {
    case "semanal":
      return `${artigo} ${dia}`;
    case "quinzenal":
      return `a cada 2 semanas, na ${dia}`;
    case "mensal":
      return `todo ${noDia}`;
    case "trimestral": {
      const base = (rotina.mes_inicio ?? 1) - 1;
      const meses = [0, 3, 6, 9].map((k) => MESES[(base + k) % 12]).join(", ");
      return `trimestral · ${noDia} de ${meses}`;
    }
    case "anual":
      return `anual · ${noDia} de ${MESES[(rotina.mes_inicio ?? 1) - 1]}`;
  }
}

/** Rotinas sugeridas pra gestão — só sugestões: nada é criado sem a sócia escolher. */
// O modo sugerido segue a natureza da tarefa: lançar o que cada uma pagou é de cada uma; olhar
// resultado e decidir é juntas.
export const ROTINAS_SUGERIDAS: Omit<Rotina, "id" | "pessoas" | "inicio" | "ativo" | "gerado_ate" | "area">[] = [
  { titulo: "Atualizar as despesas feitas ou pagas na semana", descricao: "Custos → Lançamentos: o que cada uma pagou, com comprovante.", modo: "cada_uma", frequencia: "semanal", dia_semana: 5, dia_mes: null, mes_inicio: null },
  { titulo: "Revisar caixa real × plano", descricao: "Indicadores e Relatórios: o realizado está dentro do cenário Base?", modo: "juntas", frequencia: "mensal", dia_semana: null, dia_mes: 5, mes_inicio: null },
  { titulo: "Fechar o mês", descricao: "Conciliação, DAS, pró-labore e fechamento no Extrato.", modo: "juntas", frequencia: "mensal", dia_semana: null, dia_mes: 10, mes_inicio: null },
  { titulo: "Revisar CAC, churn e funil", descricao: "Comparar com o planejado; agir no canal que desviou.", modo: "juntas", frequencia: "mensal", dia_semana: null, dia_mes: 15, mes_inicio: null },
  { titulo: "Checar prazos de fomento e prestação de contas", descricao: "Parcelas previstas, comprovações e relatórios pendentes.", modo: "juntas", frequencia: "mensal", dia_semana: null, dia_mes: 20, mes_inicio: null },
  { titulo: "Revisar recorrências e contratos", descricao: "Renovações, reajustes e assinaturas que não usamos mais.", modo: "juntas", frequencia: "trimestral", dia_semana: null, dia_mes: 1, mes_inicio: 1 },
  { titulo: "Revisar o plano (cenários × realizado)", descricao: "Atualizar premissas do Base com o que já aconteceu.", modo: "juntas", frequencia: "trimestral", dia_semana: null, dia_mes: 15, mes_inicio: 1 },
];

type RotinaParaTarefa = Pick<Rotina, "id" | "titulo" | "descricao" | "pessoas" | "modo" | "area">;

/**
 * "Vagas" de uma rotina: no modo "cada uma", uma por pessoa (cada uma tem a sua tarefa); no modo
 * "juntas", uma só, com a primeira pessoa como responsável. Sem ninguém escolhido, uma vaga sem
 * responsável.
 */
export function vagasDaRotina(r: Pick<Rotina, "pessoas" | "modo">): (string | null)[] {
  const pessoas = r.pessoas ?? [];
  if (r.modo === "cada_uma" && pessoas.length > 0) return pessoas;
  return [pessoas[0] ?? null];
}

/** A tarefa de uma vaga numa data: "juntas" leva as demais pessoas como participantes. */
export function tarefaDaVaga(r: RotinaParaTarefa, prazo: string, responsavel: string | null) {
  const pessoas = r.pessoas ?? [];
  const participantes = r.modo === "cada_uma" && pessoas.length > 0 ? [] : pessoas.slice(1);
  return { titulo: r.titulo, descricao: r.descricao, prazo, status: "a_fazer", area: r.area, etiquetas: ["rotina"], produtos: [] as string[], rotina_id: r.id, responsavel_id: responsavel, participantes };
}

/** As tarefas de uma data, uma por vaga. */
export function tarefasDaData(r: RotinaParaTarefa, prazo: string) {
  return vagasDaRotina(r).map((v) => tarefaDaVaga(r, prazo, v));
}

type TarefaDeRotina = { id: string; rotina_id: string; responsavel_id: string | null; prazo: string | null; status: string };

/**
 * Pura: dado o estado de uma rotina, o que fazer em cada vaga.
 *  - vaga com tarefa aberta: nada a criar; sobras abertas e futuras (as que a regra antiga gerou de
 *    uma vez) saem, ficando só a mais próxima — só as ainda "a_fazer", nunca uma em andamento.
 *  - vaga sem tarefa aberta: a próxima data do calendário depois da última tarefa dela, nunca antes
 *    de hoje.
 */
export function planejarRotina(r: Rotina, tarefas: TarefaDeRotina[], hoje: string): { criar: { prazo: string; responsavel: string | null }[]; apagar: string[] } {
  const criar: { prazo: string; responsavel: string | null }[] = [];
  const apagar: string[] = [];
  const cadaUma = r.modo === "cada_uma" && (r.pessoas ?? []).length > 0;
  for (const vaga of vagasDaRotina(r)) {
    const daVaga = cadaUma ? tarefas.filter((t) => t.responsavel_id === vaga) : tarefas;
    const abertas = daVaga.filter((t) => t.status !== "feito").sort((a, b) => (a.prazo ?? "").localeCompare(b.prazo ?? ""));
    if (abertas.length > 0) {
      const atual = abertas[0];
      for (const t of abertas.slice(1)) if (t.status === "a_fazer" && (t.prazo ?? "") > (atual.prazo ?? "")) apagar.push(t.id);
      continue;
    }
    const ultimo = daVaga.reduce<string | null>((m, t) => (t.prazo && (!m || t.prazo > m) ? t.prazo : m), null);
    const de = ultimo && somarDias(ultimo, 1) > hoje ? somarDias(ultimo, 1) : hoje;
    const proxima = datasDaRotina(r, de, somarDias(de, 400))[0];
    if (proxima) criar.push({ prazo: proxima, responsavel: vaga });
  }
  return { criar, apagar };
}

/**
 * Garante que cada vaga de cada rotina ativa tem exatamente uma ocorrência aberta: cria a próxima
 * onde não há nenhuma e poda as sobras futuras. Idempotente: roda ao concluir uma tarefa de rotina,
 * na abertura da tela de Tarefas e no cron diário. Tarefa concluída fica como histórico.
 */
export async function gerarOcorrenciasRotinas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  hoje: string = hojeSP(),
): Promise<{ criadas: number; apagadas: number }> {
  const { data: rotinas } = await supabase.from("rotinas").select("*").eq("ativo", true);
  const ativas = (rotinas ?? []) as Rotina[];
  if (ativas.length === 0) return { criadas: 0, apagadas: 0 };
  const { data: tarefasRaw } = await supabase
    .from("tarefas")
    .select("id, rotina_id, responsavel_id, prazo, status")
    .in("rotina_id", ativas.map((r) => r.id));
  const tarefas = (tarefasRaw ?? []) as TarefaDeRotina[];

  let criadas = 0;
  let apagadas = 0;
  for (const r of ativas) {
    const { criar, apagar } = planejarRotina(r, tarefas.filter((t) => t.rotina_id === r.id), hoje);
    if (apagar.length > 0) {
      const { error } = await supabase.from("tarefas").delete().in("id", apagar);
      if (!error) apagadas += apagar.length;
    }
    if (criar.length > 0) {
      const linhas = criar.map((c) => tarefaDaVaga(r, c.prazo, c.responsavel));
      const { error } = await supabase.from("tarefas").upsert(linhas, { onConflict: "rotina_id,prazo,responsavel_id", ignoreDuplicates: true });
      if (error) continue; // tenta de novo na próxima passagem
      criadas += linhas.length;
      const ultimoPrazo = criar.map((c) => c.prazo).sort().at(-1) ?? null;
      if (ultimoPrazo && (!r.gerado_ate || ultimoPrazo > r.gerado_ate)) await supabase.from("rotinas").update({ gerado_ate: ultimoPrazo }).eq("id", r.id);
    }
  }
  return { criadas, apagadas };
}
