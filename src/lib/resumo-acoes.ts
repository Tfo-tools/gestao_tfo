import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarAgendaCombinada, dataLocal, eventosDeHoje, horaLocal } from "@/lib/agenda-combinada";

/**
 * Resumo de ações da tela inicial: o app confere Tarefas, Custos e Agenda e devolve linhas do tipo
 * "4 despesas sem comprovante → Anexar". Regra de ouro (decisão de 04/10/2026): só CONTAGENS e
 * DATAS — nunca valor em reais, receita, cliente, fornecedor ou volume de vendas, porque a tela
 * inicial abre na frente de gente de fora.
 */

export type Modulo = "Tarefas" | "Custos" | "Agenda";
export type Urgencia = "atrasado" | "atencao" | "info";

export type Acao = {
  modulo: Modulo;
  quantidade: number;
  /** Já concorda com a quantidade: "despesas sem comprovante" / "despesa sem comprovante". */
  texto: string;
  detalhe: string | null;
  verbo: string;
  href: string;
  urgencia: Urgencia;
};

const ORDEM_MODULO: Modulo[] = ["Tarefas", "Custos", "Agenda"];
const ORDEM_URGENCIA: Urgencia[] = ["atrasado", "atencao", "info"];

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diasEntre = (deIso: string, ateIso: string) => Math.round((new Date(`${ateIso}T00:00:00Z`).getTime() - new Date(`${deIso}T00:00:00Z`).getTime()) / 86400000);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

type TarefaLinha = { prazo: string | null; responsavel_id: string | null; participantes: string[] | null; parent_id: string | null; status: string };

export async function montarResumoAcoes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  opts: { userId: string; nome: string; soMinhas: boolean },
): Promise<Acao[]> {
  const hoje = dataLocal(new Date().toISOString());
  const amanha = dataLocal(new Date(Date.now() + 86400000).toISOString());
  const [ano, mes] = hoje.split("-").map(Number);
  const mesAnterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const ha21Dias = new Date(Date.now() - 21 * 86400000).toISOString();

  // "minhas" em Custos = o que EU paguei (coluna pagador guarda o nome do perfil).
  const despesasQ = <T extends { ilike: (coluna: string, valor: string) => T }>(q: T): T => (opts.soMinhas ? q.ilike("pagador", opts.nome) : q);

  const [tarefas, sugestoes, semComprovante, contasHoje, parcelasAte, parcelasAtivoAte, fechados, despesasMesAnterior, reunioesPassadas, atasComReuniao, atasSoltas] = await Promise.all([
    supabase.from("tarefas").select("prazo, responsavel_id, participantes, parent_id, status").neq("status", "feito").is("parent_id", null),
    supabase.from("sugestoes_tarefa").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    despesasQ(supabase.from("despesas").select("data_gasto").eq("comprovado", false).lt("data_gasto", hoje).order("data_gasto").limit(500)),
    despesasQ(supabase.from("despesas").select("data_gasto").eq("comprovado", false).in("data_gasto", [hoje, amanha])),
    despesasQ(supabase.from("despesa_parcelas").select("data_prevista").eq("status", "prevista").in("data_prevista", [hoje, amanha])),
    despesasQ(supabase.from("ativo_parcelas").select("data_prevista").eq("status", "prevista").in("data_prevista", [hoje, amanha])),
    supabase.from("meses_fechados").select("mes"),
    supabase.from("despesas").select("id", { count: "exact", head: true }).gte("data_gasto", `${mesAnterior}-01`).lt("data_gasto", `${hoje.slice(0, 7)}-01`),
    supabase.from("reunioes_agendadas").select("id").eq("status", "confirmada").gte("data_hora_inicio", ha21Dias).lt("data_hora_inicio", new Date().toISOString()),
    supabase.from("reuniao_atas").select("reuniao_id").not("reuniao_id", "is", null),
    supabase.from("reuniao_atas").select("id", { count: "exact", head: true }).not("fathom_recording_id", "is", null).is("reuniao_id", null).is("google_event_id", null),
  ]);

  const acoes: Acao[] = [];

  // ── Tarefas ────────────────────────────────────────────────────────────────────────────────
  const minhas = (t: TarefaLinha) => t.responsavel_id === opts.userId || (t.participantes ?? []).includes(opts.userId);
  const lista = ((tarefas.data ?? []) as TarefaLinha[]).filter((t) => !opts.soMinhas || minhas(t));
  const linkTarefas = (visao: string) => `/tarefas?visao=${visao}&responsavel=${opts.soMinhas ? opts.userId : "todas"}`;

  const atrasadas = lista.filter((t) => t.prazo && t.prazo < hoje);
  if (atrasadas.length > 0) {
    const maisAntiga = atrasadas.map((t) => t.prazo!).sort()[0];
    const dias = diasEntre(maisAntiga, hoje);
    acoes.push({
      modulo: "Tarefas",
      quantidade: atrasadas.length,
      texto: plural(atrasadas.length, "tarefa atrasada", "tarefas atrasadas"),
      detalhe: `a mais antiga há ${dias} ${plural(dias, "dia", "dias")}`,
      verbo: "Resolver",
      href: linkTarefas("situacao"),
      urgencia: "atrasado",
    });
  }
  const vencemHoje = lista.filter((t) => t.prazo === hoje);
  if (vencemHoje.length > 0) {
    acoes.push({
      modulo: "Tarefas",
      quantidade: vencemHoje.length,
      texto: plural(vencemHoje.length, "tarefa vence hoje", "tarefas vencem hoje"),
      detalhe: null,
      verbo: "Ver",
      href: linkTarefas("situacao"),
      urgencia: "info",
    });
  }
  if (!opts.soMinhas) {
    const semDona = lista.filter((t) => !t.responsavel_id && (t.participantes ?? []).length === 0);
    if (semDona.length > 0) {
      acoes.push({
        modulo: "Tarefas",
        quantidade: semDona.length,
        texto: plural(semDona.length, "tarefa sem dona", "tarefas sem dona"),
        detalhe: "decidir quem faz",
        verbo: "Atribuir",
        href: "/tarefas?visao=projeto&responsavel=todas",
        urgencia: "atencao",
      });
    }
  }
  const nSugestoes = sugestoes.count ?? 0;
  if (nSugestoes > 0) {
    acoes.push({
      modulo: "Tarefas",
      quantidade: nSugestoes,
      texto: plural(nSugestoes, "sugestão da IA aguardando aprovação", "sugestões da IA aguardando aprovação"),
      detalhe: "vindas das atas de reunião",
      verbo: "Aprovar",
      href: "/tarefas",
      urgencia: "info",
    });
  }

  // ── Custos ─────────────────────────────────────────────────────────────────────────────────
  const semComp = (semComprovante.data ?? []) as { data_gasto: string }[];
  if (semComp.length > 0) {
    acoes.push({
      modulo: "Custos",
      quantidade: semComp.length,
      texto: plural(semComp.length, "despesa sem comprovante", "despesas sem comprovante"),
      detalhe: `a mais antiga de ${ddmm(semComp[0].data_gasto)}`,
      verbo: "Anexar",
      href: "/custos",
      urgencia: "atrasado",
    });
  }
  const datasContas = [
    ...((contasHoje.data ?? []) as { data_gasto: string }[]).map((d) => d.data_gasto),
    ...((parcelasAte.data ?? []) as { data_prevista: string }[]).map((p) => p.data_prevista),
    ...((parcelasAtivoAte.data ?? []) as { data_prevista: string }[]).map((p) => p.data_prevista),
  ];
  if (datasContas.length > 0) {
    const nHoje = datasContas.filter((d) => d === hoje).length;
    const nAmanha = datasContas.length - nHoje;
    acoes.push({
      modulo: "Custos",
      quantidade: datasContas.length,
      texto: plural(datasContas.length, "conta vence até amanhã", "contas vencem até amanhã"),
      detalhe: [nHoje > 0 ? `${nHoje} hoje` : null, nAmanha > 0 ? `${nAmanha} amanhã` : null].filter(Boolean).join(" · "),
      verbo: "Ver",
      href: "/custos/extrato",
      urgencia: "atencao",
    });
  }
  const mesesFechados = new Set(((fechados.data ?? []) as { mes: string }[]).map((m) => String(m.mes).slice(0, 7)));
  if (!mesesFechados.has(mesAnterior) && (despesasMesAnterior.count ?? 0) > 0) {
    acoes.push({
      modulo: "Custos",
      quantidade: 1,
      texto: "mês para fechar no Extrato",
      detalhe: `${MESES[Number(mesAnterior.slice(5, 7)) - 1]} ainda aberto`,
      verbo: "Fechar",
      href: `/custos/extrato?desde=${mesAnterior}&ate=${mesAnterior}`,
      urgencia: "atencao",
    });
  }

  // ── Agenda ─────────────────────────────────────────────────────────────────────────────────
  try {
    const eventos = eventosDeHoje(await carregarAgendaCombinada(1));
    if (eventos.length > 0) {
      const agora = Date.now();
      const proximo = eventos.filter((e) => !e.diaTodo && new Date(e.inicioIso).getTime() >= agora).sort((a, b) => a.inicioIso.localeCompare(b.inicioIso))[0];
      acoes.push({
        modulo: "Agenda",
        quantidade: eventos.length,
        texto: plural(eventos.length, "compromisso hoje", "compromissos hoje"),
        detalhe: proximo ? `próximo às ${horaLocal(proximo.inicioIso)} · ${proximo.titulo}` : "todos já aconteceram",
        verbo: "Abrir",
        href: "/agenda",
        urgencia: "info",
      });
    }
  } catch (e) {
    console.error("Tela inicial: agenda indisponível:", e);
  }
  const comAta = new Set(((atasComReuniao.data ?? []) as { reuniao_id: string }[]).map((a) => a.reuniao_id));
  const semAta = ((reunioesPassadas.data ?? []) as { id: string }[]).filter((r) => !comAta.has(r.id));
  if (semAta.length > 0) {
    acoes.push({
      modulo: "Agenda",
      quantidade: semAta.length,
      texto: plural(semAta.length, "reunião sem ata", "reuniões sem ata"),
      detalhe: "das últimas 3 semanas",
      verbo: "Escrever",
      href: "/agenda",
      urgencia: "atencao",
    });
  }
  const nSoltas = atasSoltas.count ?? 0;
  if (nSoltas > 0) {
    acoes.push({
      modulo: "Agenda",
      quantidade: nSoltas,
      texto: plural(nSoltas, "ata do Fathom sem reunião vinculada", "atas do Fathom sem reunião vinculada"),
      detalhe: "dizer de qual reunião é",
      verbo: "Vincular",
      href: "/agenda",
      urgencia: "atencao",
    });
  }

  return acoes.sort(
    (a, b) => ORDEM_MODULO.indexOf(a.modulo) - ORDEM_MODULO.indexOf(b.modulo) || ORDEM_URGENCIA.indexOf(a.urgencia) - ORDEM_URGENCIA.indexOf(b.urgencia),
  );
}

/** "Bom dia" até 12h, "Boa tarde" até 18h, "Boa noite" depois — hora de Brasília. */
export function saudacaoPorHora(minutoLocal: number) {
  if (minutoLocal < 12 * 60) return "Bom dia";
  if (minutoLocal < 18 * 60) return "Boa tarde";
  return "Boa noite";
}

/** "Sábado, 4 de outubro · semana 40" */
export function dataPorExtenso(agora: Date) {
  const texto = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });
  const capitalizado = texto.charAt(0).toUpperCase() + texto.slice(1);
  // Semana ISO (segunda a domingo), calculada em UTC sobre a data local.
  const iso = dataLocal(agora.toISOString());
  const d = new Date(`${iso}T00:00:00Z`);
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
  return `${capitalizado} · semana ${semana}`;
}
