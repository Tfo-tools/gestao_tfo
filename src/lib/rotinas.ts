/**
 * Rotina de gestão: tarefas recorrentes em CALENDÁRIO FIXO — "todo dia 5", "toda segunda".
 *
 * Objetivo: acompanhamento e controle que permitam agir antes do problema. Por isso:
 *  - Cada ocorrência vira uma tarefa normal (prazo, responsável, etiqueta "rotina"), que aparece na
 *    lista, no calendário da agenda e no resumo da manhã.
 *  - Nasce HORIZONTE_DIAS antes do vencimento, pra dar tempo de agir.
 *  - Calendário fixo: a ocorrência nasce na data dela mesmo se a anterior atrasou — a atrasada fica
 *    lá, destacada, em vez de empurrar o calendário.
 *  - `gerado_ate` registra até onde já foi criado: tarefa apagada não renasce.
 * A parte de datas é pura (sem banco) pra ser testável.
 */

export type Frequencia = "semanal" | "quinzenal" | "mensal" | "trimestral" | "anual";

export type Rotina = {
  id: string;
  titulo: string;
  descricao: string | null;
  responsavel_id: string | null;
  frequencia: Frequencia;
  dia_semana: number | null;
  dia_mes: number | null;
  mes_inicio: number | null;
  inicio: string;
  ativo: boolean;
  gerado_ate: string | null;
  area: string | null;
};

export const HORIZONTE_DIAS = 14;

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
export const ROTINAS_SUGERIDAS: Omit<Rotina, "id" | "responsavel_id" | "inicio" | "ativo" | "gerado_ate" | "area">[] = [
  { titulo: "Conferir lançamentos pendentes e comprovantes", descricao: "Custos → Lançamentos: tudo sem comprovante da semana.", frequencia: "semanal", dia_semana: 1, dia_mes: null, mes_inicio: null },
  { titulo: "Revisar caixa real × plano", descricao: "Indicadores e Relatórios: o realizado está dentro do cenário Base?", frequencia: "mensal", dia_semana: null, dia_mes: 5, mes_inicio: null },
  { titulo: "Fechar o mês", descricao: "Conciliação, DAS, pró-labore e fechamento no Extrato.", frequencia: "mensal", dia_semana: null, dia_mes: 10, mes_inicio: null },
  { titulo: "Revisar CAC, churn e funil", descricao: "Comparar com o planejado; agir no canal que desviou.", frequencia: "mensal", dia_semana: null, dia_mes: 15, mes_inicio: null },
  { titulo: "Checar prazos de fomento e prestação de contas", descricao: "Parcelas previstas, comprovações e relatórios pendentes.", frequencia: "mensal", dia_semana: null, dia_mes: 20, mes_inicio: null },
  { titulo: "Revisar recorrências e contratos", descricao: "Renovações, reajustes e assinaturas que não usamos mais.", frequencia: "trimestral", dia_semana: null, dia_mes: 1, mes_inicio: 1 },
  { titulo: "Revisar o plano (cenários × realizado)", descricao: "Atualizar premissas do Base com o que já aconteceu.", frequencia: "trimestral", dia_semana: null, dia_mes: 15, mes_inicio: 1 },
];

/**
 * Cria as ocorrências que faltam de todas as rotinas ativas, até hoje + HORIZONTE_DIAS.
 * Idempotente: roda na abertura da tela de Tarefas e no cron diário. Começa no dia seguinte ao
 * `gerado_ate` (ou no início da rotina), então nunca recria o que já foi gerado — nem o que alguém apagou.
 */
export async function gerarOcorrenciasRotinas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  hoje: string = hojeSP(),
): Promise<{ criadas: number }> {
  const { data: rotinas } = await supabase.from("rotinas").select("*").eq("ativo", true);
  const ate = somarDias(hoje, HORIZONTE_DIAS);
  let criadas = 0;
  for (const r of (rotinas ?? []) as Rotina[]) {
    const de = r.gerado_ate ? somarDias(r.gerado_ate, 1) : r.inicio;
    if (de > ate) continue;
    const datas = datasDaRotina(r, de, ate);
    if (datas.length > 0) {
      const { error } = await supabase.from("tarefas").upsert(
        datas.map((prazo) => ({
          titulo: r.titulo,
          descricao: r.descricao,
          responsavel_id: r.responsavel_id,
          prazo,
          status: "a_fazer",
          area: r.area,
          etiquetas: ["rotina"],
          produtos: [],
          participantes: [],
          rotina_id: r.id,
        })),
        { onConflict: "rotina_id,prazo", ignoreDuplicates: true },
      );
      if (error) continue; // não avança o gerado_ate se não gravou — tenta de novo na próxima
      criadas += datas.length;
    }
    await supabase.from("rotinas").update({ gerado_ate: ate }).eq("id", r.id);
  }
  return { criadas };
}
