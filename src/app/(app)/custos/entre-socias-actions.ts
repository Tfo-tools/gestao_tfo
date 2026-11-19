"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { partesDoValor } from "@/lib/acertos-socias";

/**
 * Tela "Entre sócias" — controle manual do rateio, sem tarefa automática.
 *
 *  - matrizEntreSocias(): a matriz. Linhas = despesas divididas (data · descrição · quem pagou);
 *    colunas = meses pra frente; célula = o que a OUTRA deve daquela despesa naquele mês. Dois
 *    subtotais (quanto cada sócia deposita por mês). Cada célula é "pago" ou não (rateio_pagamentos).
 *  - investimentoSocias(filtro): quanto cada sócia tirou do bolso de fato (reembolso migra pra quem
 *    reembolsou). Filtrável por período/descrição pra analisar um mês/evento.
 *  - alternarPago / alternarVarios: marcam/desmarcam depósitos (quem recebe confirma; guarda quem).
 */

const mesDe = (iso: string) => iso.slice(0, 7);
const mesAtual = () => new Date().toISOString().slice(0, 7);
const chave = (despesaId: string, numeroParcela: number) => `${despesaId}|${numeroParcela}`;

export type CelulaMatriz = { despesaId: string; numeroParcela: number; cheio: number; valor: number; pago: boolean };
export type LinhaMatriz = {
  chave: string;
  despesaId: string;
  descricao: string;
  dataGasto: string;
  pagador: string;
  devedora: string;
  porMes: Record<string, CelulaMatriz>;
};
export type MatrizEntreSocias = {
  meses: string[];
  linhas: LinhaMatriz[];
  subtotais: { devedora: string; porMes: Record<string, number> }[];
  consolidado: { devedora: string; credora: string; valor: number } | null;
};

export async function matrizEntreSocias(): Promise<MatrizEntreSocias> {
  const supabase = await createClient();

  const { data: profiles } = await supabase.from("profiles").select("nome, papel");
  const socias = new Set(((profiles ?? []) as { nome: string; papel: string }[]).filter((p) => p.papel === "socia").map((p) => p.nome));

  const { data: rateios } = await supabase.from("despesa_rateio").select("despesa_id, pessoa, percentual");
  const linhasRateio = (rateios ?? []) as { despesa_id: string; pessoa: string; percentual: number }[];
  const ids = [...new Set(linhasRateio.map((r) => r.despesa_id))];
  if (ids.length === 0) return { meses: [], linhas: [], subtotais: [], consolidado: null };

  const [{ data: despesas }, { data: parcelas }, { data: pagos }] = await Promise.all([
    supabase.from("despesas").select("id, descricao, pagador, data_gasto, valor_total").in("id", ids),
    supabase.from("despesa_parcelas").select("despesa_id, numero_parcela, valor, data_prevista").eq("origem", "fatura_cartao").in("despesa_id", ids),
    supabase.from("rateio_pagamentos").select("despesa_id, numero_parcela").in("despesa_id", ids),
  ]);

  const rateioPor = new Map<string, { pessoa: string; percentual: number }[]>();
  for (const r of linhasRateio) rateioPor.set(r.despesa_id, [...(rateioPor.get(r.despesa_id) ?? []), { pessoa: r.pessoa, percentual: Number(r.percentual) }]);
  const parcelasPor = new Map<string, { numero_parcela: number; valor: number; data_prevista: string }[]>();
  for (const p of (parcelas ?? []) as { despesa_id: string; numero_parcela: number; valor: number; data_prevista: string }[]) {
    parcelasPor.set(p.despesa_id, [...(parcelasPor.get(p.despesa_id) ?? []), p]);
  }
  const pago = new Set(((pagos ?? []) as { despesa_id: string; numero_parcela: number }[]).map((p) => chave(p.despesa_id, p.numero_parcela)));

  const linhas: LinhaMatriz[] = [];
  const mesesComCelula = new Set<string>();
  const mesesComDevido = new Set<string>(); // meses que têm célula não paga

  for (const d of (despesas ?? []) as { id: string; descricao: string | null; pagador: string | null; data_gasto: string; valor_total: number }[]) {
    const rateio = (rateioPor.get(d.id) ?? []).slice().sort((a, b) => a.pessoa.localeCompare(b.pessoa));
    if (!d.pagador || !socias.has(d.pagador) || rateio.length === 0) continue;
    const devedoras = rateio.filter((r) => r.pessoa !== d.pagador && r.percentual > 0).map((r) => r.pessoa);
    const ps = (parcelasPor.get(d.id) ?? []).slice().sort((a, b) => a.numero_parcela - b.numero_parcela);

    for (const devedora of devedoras) {
      const porMes: Record<string, CelulaMatriz> = {};
      const unidades = ps.length > 0
        ? ps.map((p) => ({ numero: p.numero_parcela, valor: Number(p.valor), mes: mesDe(p.data_prevista) }))
        : [{ numero: 0, valor: Number(d.valor_total), mes: mesDe(d.data_gasto) }];
      for (const u of unidades) {
        const parte = partesDoValor(u.valor, rateio)[devedora] ?? 0;
        if (parte <= 0) continue;
        const estaPago = pago.has(chave(d.id, u.numero));
        porMes[u.mes] = { despesaId: d.id, numeroParcela: u.numero, cheio: u.valor, valor: parte, pago: estaPago };
        mesesComCelula.add(u.mes);
        if (!estaPago) mesesComDevido.add(u.mes);
      }
      if (Object.keys(porMes).length > 0) {
        linhas.push({ chave: `${d.id}|${devedora}`, despesaId: d.id, descricao: d.descricao || "Despesa", dataGasto: d.data_gasto, pagador: d.pagador, devedora, porMes });
      }
    }
  }

  // Colunas: meses pra frente. Esconde mês passado que já está 100% pago; mostra o que ainda deve.
  const agora = mesAtual();
  const meses = [...mesesComCelula].filter((m) => m >= agora || mesesComDevido.has(m)).sort();

  // Subtotais por sócia: o que falta depositar (não pago) em cada mês.
  const nomes = [...socias].sort();
  const subtotais = nomes.map((devedora) => {
    const porMes: Record<string, number> = {};
    for (const m of meses) {
      let soma = 0;
      for (const l of linhas) {
        if (l.devedora !== devedora) continue;
        const c = l.porMes[m];
        if (c && !c.pago) soma += c.valor;
      }
      if (soma > 0) porMes[m] = Math.round(soma * 100) / 100;
    }
    return { devedora, porMes };
  });

  // Consolidado: saldo líquido do que falta (não pago), compensado.
  const deve = new Map<string, number>();
  for (const l of linhas) for (const m of Object.keys(l.porMes)) {
    const c = l.porMes[m];
    if (!c.pago) deve.set(l.devedora, (deve.get(l.devedora) ?? 0) + c.valor);
  }
  let consolidado: MatrizEntreSocias["consolidado"] = null;
  if (nomes.length === 2) {
    const [a, b] = nomes;
    const saldo = Math.round(((deve.get(a) ?? 0) - (deve.get(b) ?? 0)) * 100) / 100;
    if (saldo > 0) consolidado = { devedora: a, credora: b, valor: saldo };
    else if (saldo < 0) consolidado = { devedora: b, credora: a, valor: -saldo };
    else consolidado = { devedora: a, credora: b, valor: 0 };
  }

  return { meses, linhas, subtotais, consolidado };
}

async function nomeAtual(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle();
  return (data?.nome as string | undefined) ?? null;
}

export async function alternarPago(despesaId: string, numeroParcela: number, pago: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  if (pago) {
    const confirmadoPor = await nomeAtual(supabase);
    const { error } = await supabase
      .from("rateio_pagamentos")
      .upsert({ despesa_id: despesaId, numero_parcela: numeroParcela, pago_em: new Date().toISOString().slice(0, 10), confirmado_por: confirmadoPor }, { onConflict: "despesa_id,numero_parcela" });
    if (error) return { error: "Não consegui marcar como pago." };
  } else {
    const { error } = await supabase.from("rateio_pagamentos").delete().eq("despesa_id", despesaId).eq("numero_parcela", numeroParcela);
    if (error) return { error: "Não consegui desmarcar." };
  }
  revalidatePath("/custos/entre-socias");
  return { error: null };
}

export async function alternarVarios(itens: { despesaId: string; numeroParcela: number }[], pago: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  if (itens.length === 0) return { error: null };
  if (pago) {
    const confirmadoPor = await nomeAtual(supabase);
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("rateio_pagamentos")
      .upsert(itens.map((i) => ({ despesa_id: i.despesaId, numero_parcela: i.numeroParcela, pago_em: hoje, confirmado_por: confirmadoPor })), { onConflict: "despesa_id,numero_parcela" });
    if (error) return { error: "Não consegui marcar o mês como pago." };
  } else {
    for (const i of itens) await supabase.from("rateio_pagamentos").delete().eq("despesa_id", i.despesaId).eq("numero_parcela", i.numeroParcela);
  }
  revalidatePath("/custos/entre-socias");
  return { error: null };
}

// ── Investimento por sócia (rodapé, filtrável) ───────────────────────────────────────────────
export type InvestimentoSocias = { investimento: { nome: string; valor: number }[]; totalEmpresa: number };

function mesSeguinte(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

export async function investimentoSocias(filtro: { desde?: string; ate?: string; descricao?: string }): Promise<InvestimentoSocias> {
  const supabase = await createClient();
  const { data: profiles } = await supabase.from("profiles").select("nome, papel");
  const socias = new Set(((profiles ?? []) as { nome: string; papel: string }[]).filter((p) => p.papel === "socia").map((p) => p.nome));

  const { data: rateios } = await supabase.from("despesa_rateio").select("despesa_id, pessoa, percentual");
  const rateioPor = new Map<string, { pessoa: string; percentual: number }[]>();
  for (const r of (rateios ?? []) as { despesa_id: string; pessoa: string; percentual: number }[]) {
    rateioPor.set(r.despesa_id, [...(rateioPor.get(r.despesa_id) ?? []), { pessoa: r.pessoa, percentual: Number(r.percentual) }]);
  }

  let query = supabase.from("despesas").select("id, valor_total, pagador, data_gasto, descricao, despesa_parcelas(numero_parcela, valor, origem)");
  if (filtro.desde) query = query.gte("data_gasto", `${filtro.desde}-01`);
  if (filtro.ate) query = query.lt("data_gasto", mesSeguinte(filtro.ate));
  if (filtro.descricao) query = query.ilike("descricao", `%${filtro.descricao}%`);
  const { data: despesas } = await query;
  const ids = ((despesas ?? []) as { id: string }[]).map((d) => d.id);

  const { data: pagos } = ids.length > 0
    ? await supabase.from("rateio_pagamentos").select("despesa_id, numero_parcela").in("despesa_id", ids)
    : { data: [] };
  const pagoPor = new Map<string, Set<number>>();
  for (const p of (pagos ?? []) as { despesa_id: string; numero_parcela: number }[]) {
    pagoPor.set(p.despesa_id, (pagoPor.get(p.despesa_id) ?? new Set()).add(p.numero_parcela));
  }

  const porPagador = new Map<string, number>();
  const somar = (p: string, v: number) => porPagador.set(p, (porPagador.get(p) ?? 0) + v);
  let totalEmpresa = 0;

  for (const d of (despesas ?? []) as unknown as {
    id: string; valor_total: number; pagador: string | null; despesa_parcelas?: { numero_parcela: number; valor: number; origem: string }[];
  }[]) {
    if (!d.pagador || !socias.has(d.pagador)) {
      totalEmpresa += Number(d.valor_total);
      continue;
    }
    somar(d.pagador, Number(d.valor_total));
    const rateio = rateioPor.get(d.id);
    if (!rateio || rateio.length === 0) continue;
    const pagosDaDespesa = pagoPor.get(d.id);
    if (!pagosDaDespesa || pagosDaDespesa.size === 0) continue;
    const parcelasCartao = (d.despesa_parcelas ?? []).filter((p) => p.origem === "fatura_cartao").sort((a, b) => a.numero_parcela - b.numero_parcela);
    const devedoras = rateio.filter((r) => r.pessoa !== d.pagador && r.percentual > 0).map((r) => r.pessoa);
    for (const devedora of devedoras) {
      // Reembolso efetivado migra do pagador pra devedora, por unidade paga.
      if (parcelasCartao.length > 0) {
        for (const p of parcelasCartao) {
          if (!pagosDaDespesa.has(p.numero_parcela)) continue;
          const parte = partesDoValor(Number(p.valor), rateio)[devedora] ?? 0;
          somar(devedora, parte);
          somar(d.pagador, -parte);
        }
      } else if (pagosDaDespesa.has(0)) {
        const parte = partesDoValor(Number(d.valor_total), rateio)[devedora] ?? 0;
        somar(devedora, parte);
        somar(d.pagador, -parte);
      }
    }
  }

  const investimento = [...porPagador.entries()].map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 })).sort((a, b) => b.valor - a.valor);
  return { investimento, totalEmpresa: Math.round(totalEmpresa * 100) / 100 };
}
