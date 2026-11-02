/**
 * Acerto entre sócias — quem arca com o quê de uma despesa paga do bolso de uma delas.
 *
 * Três coisas separadas (antes ficavam todas em despesa_parcelas e se contavam duas vezes):
 *  - QUEM PAGOU ao fornecedor: despesas.pagador. No Custos a despesa fica paga, em nome dela.
 *  - QUANTO CABE A CADA UMA: despesa_rateio (percentual por pessoa). Meio a meio por padrão; na
 *    viagem, dividido entre as participantes do item.
 *  - O ACERTO: a parte da outra vira um item (acerto_itens) dentro de um acerto (acertos_socias),
 *    que é o saldo líquido entre as duas — compensado, um depósito só.
 *
 * Quando entra:
 *  - Cartão: cada parcela entra no acerto do mês em que vence (o calendário da fatura, em
 *    despesa_parcelas com origem fatura_cartao). Nunca a despesa inteira de uma vez.
 *  - À vista (Pix, débito…): a despesa inteira. Lançada até a geração do mês, entra no acerto
 *    mensal; lançada depois, vira um acerto avulso com prazo de 3 dias úteis.
 *  - Acerto mensal: gerado 5 dias antes do vencimento do cartão que vence primeiro, uma tarefa pra
 *    cada sócia, prazo no vencimento. Concluir a tarefa da devedora quita o acerto (trigger no
 *    banco) e avisa a credora.
 *
 * A parte de cálculo é pura (sem banco) pra ser testável.
 */

export const DIAS_ANTES_VENCIMENTO = 5;
export const DIAS_UTEIS_AVULSO = 3;
const DIA_VENCIMENTO_PADRAO = 10;

export type RateioLinha = { despesa_id: string; pessoa: string; percentual: number };
export type DespesaAcerto = {
  id: string;
  descricao: string | null;
  pagador: string | null;
  valor_total: number;
  data_gasto: string;
};
export type ParcelaCartao = { despesa_id: string; numero_parcela: number; valor: number; data_prevista: string };

/** Uma cobrança: a parte de uma pessoa numa despesa (ou numa parcela dela) paga por outra. */
export type ItemDevido = {
  despesa_id: string;
  numero_parcela: number | null;
  total_parcelas: number | null;
  devedora: string;
  credora: string;
  valor_parcela: number;
  valor: number;
};

/** Uma linha da tarefa: a despesa (ou parcela) e a parte de cada pessoa nela. */
export type LinhaAcerto = {
  despesa_id: string;
  descricao: string;
  numero_parcela: number | null;
  total_parcelas: number | null;
  pagador: string;
  valor_parcela: number;
  partes: Record<string, number>;
};

export type AcertoPlanejado = { devedora: string; credora: string; valor: number; itens: ItemDevido[] };

const r2 = (v: number) => Math.round(v * 100) / 100;

export const chaveItem = (despesaId: string, numeroParcela: number | null, devedora: string) => `${despesaId}|${numeroParcela ?? 0}|${devedora}`;

/** Divide um valor pelos percentuais; o arredondamento sobra pra última pessoa, pra fechar a soma. */
export function partesDoValor(valor: number, rateio: { pessoa: string; percentual: number }[]): Record<string, number> {
  const total = rateio.reduce((s, r) => s + Number(r.percentual), 0);
  if (rateio.length === 0 || total <= 0) return {};
  const partes: Record<string, number> = {};
  let acumulado = 0;
  rateio.forEach((r, i) => {
    const parte = i === rateio.length - 1 ? r2(valor - acumulado) : r2((valor * Number(r.percentual)) / total);
    partes[r.pessoa] = parte;
    acumulado = r2(acumulado + parte);
  });
  return partes;
}

/**
 * O que está devido e ainda não entrou em nenhum acerto.
 *  - Despesa com parcelas do cartão: parcelas com vencimento até `ateParcela`.
 *  - Despesa à vista: data do gasto até `ateGasto`.
 * Só conta quando quem pagou é uma das `pessoas` (pago pela Empresa não gera acerto).
 */
export function calcularDevidos(input: {
  despesas: DespesaAcerto[];
  rateios: RateioLinha[];
  parcelas: ParcelaCartao[];
  jaIncluidos: Set<string>;
  pessoas: Set<string>;
  ateParcela: string;
  ateGasto: string;
}): { itens: ItemDevido[]; linhas: LinhaAcerto[] } {
  const rateioPor = new Map<string, RateioLinha[]>();
  for (const r of input.rateios) rateioPor.set(r.despesa_id, [...(rateioPor.get(r.despesa_id) ?? []), r]);
  const parcelasPor = new Map<string, ParcelaCartao[]>();
  for (const p of input.parcelas) parcelasPor.set(p.despesa_id, [...(parcelasPor.get(p.despesa_id) ?? []), p]);

  const itens: ItemDevido[] = [];
  const linhas: LinhaAcerto[] = [];
  for (const d of input.despesas) {
    const rateio = (rateioPor.get(d.id) ?? []).slice().sort((a, b) => a.pessoa.localeCompare(b.pessoa));
    const pagador = d.pagador;
    if (!pagador || !input.pessoas.has(pagador) || rateio.length === 0) continue;
    const descricao = d.descricao || "Despesa";

    const parcelas = (parcelasPor.get(d.id) ?? []).slice().sort((a, b) => a.numero_parcela - b.numero_parcela);
    const blocos: { numero: number | null; total: number | null; valor: number }[] =
      parcelas.length > 0
        ? parcelas.filter((p) => p.data_prevista <= input.ateParcela).map((p) => ({ numero: p.numero_parcela, total: parcelas.length, valor: Number(p.valor) }))
        : d.data_gasto <= input.ateGasto
          ? [{ numero: null, total: null, valor: Number(d.valor_total) }]
          : [];

    for (const b of blocos) {
      const partes = partesDoValor(b.valor, rateio);
      let entrou = false;
      for (const [pessoa, valor] of Object.entries(partes)) {
        if (pessoa === pagador || valor <= 0) continue;
        if (input.jaIncluidos.has(chaveItem(d.id, b.numero, pessoa))) continue;
        itens.push({ despesa_id: d.id, numero_parcela: b.numero, total_parcelas: b.total, devedora: pessoa, credora: pagador, valor_parcela: b.valor, valor });
        entrou = true;
      }
      if (entrou) linhas.push({ despesa_id: d.id, descricao, numero_parcela: b.numero, total_parcelas: b.total, pagador, valor_parcela: b.valor, partes });
    }
  }
  return { itens, linhas };
}

/** Junta as cobranças por dupla e compensa: sobra um saldo só, numa direção. */
export function compensar(itens: ItemDevido[]): AcertoPlanejado[] {
  const duplas = new Map<string, ItemDevido[]>();
  for (const it of itens) {
    const [a, b] = [it.devedora, it.credora].sort();
    const k = `${a}|${b}`;
    duplas.set(k, [...(duplas.get(k) ?? []), it]);
  }
  const acertos: AcertoPlanejado[] = [];
  for (const [k, lista] of duplas) {
    const [a, b] = k.split("|");
    // Positivo: a deve a b.
    const saldo = r2(lista.reduce((s, it) => s + (it.devedora === a ? it.valor : -it.valor), 0));
    acertos.push(saldo >= 0 ? { devedora: a, credora: b, valor: saldo, itens: lista } : { devedora: b, credora: a, valor: -saldo, itens: lista });
  }
  return acertos;
}

export function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloMes = (mesIso: string) => `${MESES[Number(mesIso.slice(5, 7)) - 1]}/${mesIso.slice(0, 4)}`;
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Título e descrição da tarefa de uma pessoa num acerto. */
export function textoTarefa(input: {
  pessoa: string;
  acerto: AcertoPlanejado;
  linhas: LinhaAcerto[];
  tipo: "mensal" | "avulso";
  mesReferencia: string | null;
  vencimento: string;
}): { titulo: string; descricao: string } {
  const { pessoa, acerto, tipo } = input;
  const outra = acerto.devedora === pessoa ? acerto.credora : acerto.devedora;
  const daDupla = input.linhas.filter((l) => {
    const envolvidas = new Set([l.pagador, ...Object.keys(l.partes)]);
    return envolvidas.has(acerto.devedora) && envolvidas.has(acerto.credora) && acerto.itens.some((i) => i.despesa_id === l.despesa_id && i.numero_parcela === l.numero_parcela);
  });

  const ref = tipo === "mensal" && input.mesReferencia ? `fatura de ${rotuloMes(input.mesReferencia)}` : "despesa dividida";
  const acao =
    acerto.valor === 0
      ? "nada a transferir"
      : acerto.devedora === pessoa
        ? `transferir ${formatBRL(acerto.valor)} para ${outra}`
        : `receber ${formatBRL(acerto.valor)} de ${outra}`;
  const titulo = `Acerto com ${outra} (${ref}): ${acao}`;

  const linhasTexto = daDupla.map((l) => {
    const parcela = l.numero_parcela != null ? `${l.numero_parcela}/${l.total_parcelas} ` : "";
    const minha = l.partes[pessoa] ?? 0;
    return `• ${parcela}${l.descricao} — ${formatBRL(l.valor_parcela)} · sua parte ${formatBRL(minha)} (pago por ${l.pagador})`;
  });
  const total = r2(daDupla.reduce((s, l) => s + l.valor_parcela, 0));
  const minhaParte = r2(daDupla.reduce((s, l) => s + (l.partes[pessoa] ?? 0), 0));

  const fechamento =
    acerto.valor === 0
      ? "As partes se compensam: ninguém precisa transferir."
      : acerto.devedora === pessoa
        ? `Saldo: transferir ${formatBRL(acerto.valor)} para ${outra} até ${dataBR(input.vencimento)}. Ao concluir esta tarefa, ${outra} é avisada e o acerto fica registrado em cada despesa.`
        : `Saldo: ${outra} transfere ${formatBRL(acerto.valor)} para você. Quando ela concluir a tarefa dela, você recebe o aviso.`;

  const descricao = [
    tipo === "mensal" ? `Despesas divididas com vencimento na ${ref}:` : "Despesa dividida, paga à vista depois da geração do acerto do mês:",
    ...linhasTexto,
    "",
    `Total${tipo === "mensal" ? " das parcelas" : ""}: ${formatBRL(total)} · Sua parte: ${formatBRL(minhaParte)}`,
    fechamento,
  ].join("\n");
  return { titulo, descricao };
}

// ── Datas (AAAA-MM-DD, UTC puro) ─────────────────────────────────────────────────────────────
const paraData = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const paraIso = (d: Date) => d.toISOString().slice(0, 10);
export function somarDias(iso: string, n: number) {
  const d = paraData(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return paraIso(d);
}
/** Dias úteis = segunda a sexta (feriado não entra na conta). */
export function somarDiasUteis(iso: string, n: number) {
  let d = iso;
  let faltam = n;
  while (faltam > 0) {
    d = somarDias(d, 1);
    const dow = paraData(d).getUTCDay();
    if (dow !== 0 && dow !== 6) faltam--;
  }
  return d;
}
export const inicioDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;
export function fimDoMes(iso: string) {
  const d = paraData(inicioDoMes(iso));
  return paraIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** Vencimento do ciclo no mês de `hoje` e o dia em que o acerto mensal é gerado (5 dias antes). */
export function cicloDoMes(hoje: string, diaVencimento: number): { mes: string; vencimento: string; geracao: string } {
  const mes = inicioDoMes(hoje);
  const ultimo = Number(fimDoMes(hoje).slice(8, 10));
  const vencimento = `${hoje.slice(0, 7)}-${String(Math.min(diaVencimento, ultimo)).padStart(2, "0")}`;
  return { mes, vencimento, geracao: somarDias(vencimento, -DIAS_ANTES_VENCIMENTO) };
}

// ── Banco ────────────────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** O cartão que vence primeiro entre os cartões cadastrados (sócias e meios de pagamento). */
export async function diaVencimentoCiclo(supabase: Db): Promise<number> {
  const [{ data: perfis }, { data: meios }] = await Promise.all([
    supabase.from("profiles").select("cartao_dia_vencimento").eq("papel", "socia"),
    supabase.from("meios_pagamento").select("dia_vencimento").eq("ativo", true),
  ]);
  const dias = [...(perfis ?? []).map((p: { cartao_dia_vencimento: number | null }) => p.cartao_dia_vencimento), ...(meios ?? []).map((m: { dia_vencimento: number | null }) => m.dia_vencimento)]
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 31);
  return dias.length > 0 ? Math.min(...dias) : DIA_VENCIMENTO_PADRAO;
}

async function pessoasSocias(supabase: Db): Promise<Map<string, string>> {
  const { data } = await supabase.from("profiles").select("id, nome").eq("papel", "socia");
  return new Map((data ?? []).map((p: { id: string; nome: string }) => [p.nome, p.id]));
}

export async function carregarDevidos(supabase: Db, opcoes: { despesaIds?: string[]; ateParcela: string; ateGasto: string; pessoas: Set<string> }) {
  let qRateio = supabase.from("despesa_rateio").select("despesa_id, pessoa, percentual");
  if (opcoes.despesaIds) qRateio = qRateio.in("despesa_id", opcoes.despesaIds);
  const { data: rateios } = await qRateio;
  const ids = [...new Set(((rateios ?? []) as RateioLinha[]).map((r) => r.despesa_id))];
  if (ids.length === 0) return { itens: [] as ItemDevido[], linhas: [] as LinhaAcerto[] };

  const [{ data: despesas }, { data: parcelas }, { data: incluidos }] = await Promise.all([
    supabase.from("despesas").select("id, descricao, pagador, valor_total, data_gasto").in("id", ids),
    supabase.from("despesa_parcelas").select("despesa_id, numero_parcela, valor, data_prevista").eq("origem", "fatura_cartao").in("despesa_id", ids),
    supabase.from("acerto_itens").select("despesa_id, numero_parcela, devedora").in("despesa_id", ids),
  ]);
  const jaIncluidos = new Set(
    ((incluidos ?? []) as { despesa_id: string; numero_parcela: number | null; devedora: string }[]).map((i) => chaveItem(i.despesa_id, i.numero_parcela, i.devedora)),
  );
  return calcularDevidos({
    despesas: (despesas ?? []) as DespesaAcerto[],
    rateios: (rateios ?? []) as RateioLinha[],
    parcelas: (parcelas ?? []) as ParcelaCartao[],
    jaIncluidos,
    pessoas: opcoes.pessoas,
    ateParcela: opcoes.ateParcela,
    ateGasto: opcoes.ateGasto,
  });
}

async function gravarAcertos(
  supabase: Db,
  input: {
    tipo: "mensal" | "avulso";
    mesReferencia: string | null;
    vencimento: string;
    planejados: AcertoPlanejado[];
    linhas: LinhaAcerto[];
    idPorNome: Map<string, string>;
    tarefaParaCredora: boolean;
  },
): Promise<{ criados: number; avisos: { usuarioId: string; title: string; body: string }[] }> {
  let criados = 0;
  const avisos: { usuarioId: string; title: string; body: string }[] = [];
  for (const a of input.planejados) {
    const criarTarefa = async (pessoa: string) => {
      const { titulo, descricao } = textoTarefa({ pessoa, acerto: a, linhas: input.linhas, tipo: input.tipo, mesReferencia: input.mesReferencia, vencimento: input.vencimento });
      const { data } = await supabase
        .from("tarefas")
        .insert({ titulo, descricao, prazo: input.vencimento, status: "a_fazer", responsavel_id: input.idPorNome.get(pessoa) ?? null, etiquetas: ["acerto"], produtos: [], participantes: [] })
        .select("id")
        .single();
      const usuarioId = input.idPorNome.get(pessoa);
      if (usuarioId) avisos.push({ usuarioId, title: "Nova tarefa de acerto", body: titulo });
      return (data?.id as string | undefined) ?? null;
    };

    const { data: acerto, error } = await supabase
      .from("acertos_socias")
      .insert({ tipo: input.tipo, mes_referencia: input.mesReferencia, vencimento: input.vencimento, devedora: a.devedora, credora: a.credora, valor: a.valor })
      .select("id")
      .single();
    if (error || !acerto) continue;

    const { error: erroItens } = await supabase.from("acerto_itens").insert(
      a.itens.map((i) => ({
        acerto_id: acerto.id,
        despesa_id: i.despesa_id,
        numero_parcela: i.numero_parcela,
        total_parcelas: i.total_parcelas,
        devedora: i.devedora,
        credora: i.credora,
        valor_parcela: i.valor_parcela,
        valor: i.valor,
      })),
    );
    if (erroItens) {
      // Algum item já entrou em outro acerto (corrida entre duas gerações): desfaz este.
      await supabase.from("acertos_socias").delete().eq("id", acerto.id);
      continue;
    }

    const tarefaDevedora = await criarTarefa(a.devedora);
    const tarefaCredora = input.tarefaParaCredora ? await criarTarefa(a.credora) : null;
    await supabase.from("acertos_socias").update({ tarefa_devedora_id: tarefaDevedora, tarefa_credora_id: tarefaCredora }).eq("id", acerto.id);
    criados++;
  }
  return { criados, avisos };
}

/**
 * Acerto mensal: a partir do dia de geração (5 dias antes do vencimento do cartão que vence
 * primeiro), uma vez por mês. Entra o que vence no cartão até o fim do mês e o que foi pago à
 * vista até hoje, ainda fora de qualquer acerto. Idempotente (acertos_ciclos).
 */
export async function gerarAcertoMensal(supabase: Db, hoje: string) {
  const ciclo = cicloDoMes(hoje, await diaVencimentoCiclo(supabase));
  if (hoje < ciclo.geracao) return { criados: 0, avisos: [] };
  const { data: feito } = await supabase.from("acertos_ciclos").select("mes").eq("mes", ciclo.mes).maybeSingle();
  if (feito) return { criados: 0, avisos: [] };
  // Marca primeiro: duas execuções ao mesmo tempo não geram em dobro (a segunda falha na chave).
  const { error } = await supabase.from("acertos_ciclos").insert({ mes: ciclo.mes });
  if (error) return { criados: 0, avisos: [] };

  const idPorNome = await pessoasSocias(supabase);
  const { itens, linhas } = await carregarDevidos(supabase, { ateParcela: fimDoMes(hoje), ateGasto: hoje, pessoas: new Set(idPorNome.keys()) });
  if (itens.length === 0) return { criados: 0, avisos: [] };
  return gravarAcertos(supabase, {
    tipo: "mensal",
    mesReferencia: ciclo.mes,
    vencimento: ciclo.vencimento > hoje ? ciclo.vencimento : somarDiasUteis(hoje, DIAS_UTEIS_AVULSO),
    planejados: compensar(itens),
    linhas,
    idPorNome,
    tarefaParaCredora: true,
  });
}

/**
 * Despesa à vista dividida lançada depois da geração do acerto do mês: vira acerto próprio, só a
 * tarefa de quem deve, prazo em 3 dias úteis. Antes da geração, não faz nada — entra no mensal.
 * Despesa no cartão nunca vira avulso: as parcelas entram no mensal do mês em que vencem.
 */
export async function gerarAcertoAvulso(supabase: Db, despesaId: string, hoje: string) {
  const { count } = await supabase.from("despesa_parcelas").select("id", { count: "exact", head: true }).eq("despesa_id", despesaId).eq("origem", "fatura_cartao");
  if ((count ?? 0) > 0) return { criados: 0, avisos: [] };
  const ciclo = cicloDoMes(hoje, await diaVencimentoCiclo(supabase));
  if (hoje < ciclo.geracao) return { criados: 0, avisos: [] };

  const idPorNome = await pessoasSocias(supabase);
  const { itens, linhas } = await carregarDevidos(supabase, { despesaIds: [despesaId], ateParcela: hoje, ateGasto: "9999-12-31", pessoas: new Set(idPorNome.keys()) });
  if (itens.length === 0) return { criados: 0, avisos: [] };
  return gravarAcertos(supabase, {
    tipo: "avulso",
    mesReferencia: inicioDoMes(hoje),
    vencimento: somarDiasUteis(hoje, DIAS_UTEIS_AVULSO),
    planejados: compensar(itens),
    linhas,
    idPorNome,
    tarefaParaCredora: false,
  });
}

/** Aviso pra credora quando a devedora conclui a tarefa (o status do acerto o banco já trocou). */
export async function avisoDeQuitacao(supabase: Db, tarefaId: string): Promise<{ usuarioId: string; title: string; body: string } | null> {
  const { data: acerto } = await supabase
    .from("acertos_socias")
    .select("devedora, credora, valor, tipo, mes_referencia, status")
    .eq("tarefa_devedora_id", tarefaId)
    .maybeSingle();
  if (!acerto || acerto.status !== "quitado") return null;
  const { data: credora } = await supabase.from("profiles").select("id").eq("nome", acerto.credora).maybeSingle();
  if (!credora) return null;
  const ref = acerto.tipo === "mensal" && acerto.mes_referencia ? ` — fatura de ${rotuloMes(acerto.mes_referencia)}` : "";
  return {
    usuarioId: credora.id,
    title: "Acerto quitado",
    body: Number(acerto.valor) > 0 ? `${acerto.devedora} transferiu ${formatBRL(Number(acerto.valor))}${ref}` : `${acerto.devedora} concluiu o acerto${ref} (nada a transferir)`,
  };
}

/** Grava a divisão de uma despesa (substitui a anterior). Lista vazia = não dividir. */
export async function salvarRateio(supabase: Db, despesaId: string, rateio: { pessoa: string; percentual: number }[]) {
  await supabase.from("despesa_rateio").delete().eq("despesa_id", despesaId);
  const validos = rateio.filter((r) => r.pessoa && r.percentual > 0);
  if (validos.length > 0) await supabase.from("despesa_rateio").insert(validos.map((r) => ({ despesa_id: despesaId, pessoa: r.pessoa, percentual: r.percentual })));
}

/** Meio a meio (ou em partes iguais) entre as pessoas dadas. */
export function rateioIgual(pessoas: string[]): { pessoa: string; percentual: number }[] {
  const unicas = [...new Set(pessoas.filter(Boolean))];
  if (unicas.length === 0) return [];
  const base = Math.floor((100 / unicas.length) * 1000) / 1000;
  return unicas.map((pessoa, i) => ({ pessoa, percentual: i === unicas.length - 1 ? Math.round((100 - base * (unicas.length - 1)) * 1000) / 1000 : base }));
}
