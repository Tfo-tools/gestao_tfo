"use server";

import { createClient } from "@/lib/supabase/server";
import { carregarDevidos } from "@/lib/acertos-socias";

/**
 * Dados da tela "Entre sócias" (modal aberto pelo cabeçalho do Custos):
 *  - acertos: quem deve a quem AGORA (acertos abertos + o que ainda vai entrar). É o acerto de verdade.
 *  - investimento: quanto cada sócia tirou do bolso de fato, no recorte filtrado. NÃO assume 50/50 —
 *    cada despesa conta pra quem pagou ao fornecedor, e o que a outra JÁ reembolsou (acerto quitado)
 *    migra pra conta de quem reembolsou. Serve pra enxergar quanto cada uma está investindo no negócio.
 *
 * O filtro (período/descrição) vale pro INVESTIMENTO (análise por mês/evento). Os acertos mostram
 * sempre o que está em aberto hoje, independente do período.
 */

export type EntreSociasDados = {
  acertos: { id: string; devedora: string; credora: string; valor: number; tipo: string; mes_referencia: string | null; vencimento: string | null; atrasado: boolean }[];
  aAcertar: { dupla: string; valor: number }[];
  investimento: { nome: string; valor: number }[];
  totalSocias: number;
  totalEmpresa: number;
  totalAcertoPendente: number;
};

/** Primeiro dia do mês seguinte a um "AAAA-MM" (pra filtrar data_gasto < esse limite). */
function mesSeguinte(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  // m é 1-based; Date.UTC usa mês 0-based, então o índice m já é o mês seguinte.
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

export async function dadosEntreSocias(filtro: { desde?: string; ate?: string; descricao?: string }): Promise<EntreSociasDados> {
  const supabase = await createClient();

  const [{ data: profiles }, { data: acertosAbertos }] = await Promise.all([
    supabase.from("profiles").select("nome, papel").order("nome"),
    supabase
      .from("acertos_socias")
      .select("id, tipo, mes_referencia, vencimento, devedora, credora, valor")
      .eq("status", "aberto")
      .order("vencimento", { ascending: true }),
  ]);
  const socias = new Set(
    ((profiles ?? []) as { nome: string; papel: string }[]).filter((p) => p.papel === "socia").map((p) => p.nome),
  );

  // Despesas do recorte, com os itens de acerto quitados (pra migrar o reembolso).
  let query = supabase
    .from("despesas")
    .select("valor_total, pagador, data_gasto, acerto_itens(devedora, valor, acertos_socias(status))");
  if (filtro.desde) query = query.gte("data_gasto", `${filtro.desde}-01`);
  if (filtro.ate) query = query.lt("data_gasto", mesSeguinte(filtro.ate));
  if (filtro.descricao) query = query.ilike("descricao", `%${filtro.descricao}%`);
  const { data: despesas } = await query;

  const porPagador = new Map<string, number>();
  const somar = (p: string, v: number) => porPagador.set(p, (porPagador.get(p) ?? 0) + v);
  let totalEmpresa = 0;
  let totalAcertoPendente = 0;
  for (const d of (despesas ?? []) as unknown as {
    valor_total: number;
    pagador: string | null;
    acerto_itens?: { devedora: string; valor: number; acertos_socias: { status: string } | null }[];
  }[]) {
    // Pago pela Empresa / por quem não é sócia não é investimento de sócia.
    if (!d.pagador || !socias.has(d.pagador)) {
      totalEmpresa += Number(d.valor_total);
      continue;
    }
    somar(d.pagador, Number(d.valor_total));
    for (const it of d.acerto_itens ?? []) {
      if (it.acertos_socias?.status !== "quitado") {
        totalAcertoPendente += Number(it.valor);
        continue;
      }
      // Reembolso efetivado: a parte sai de quem pagou e entra pra quem reembolsou.
      somar(it.devedora, Number(it.valor));
      somar(d.pagador, -Number(it.valor));
    }
  }
  const investimento = [...porPagador.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  const totalSocias = investimento.reduce((s, x) => s + x.valor, 0);

  // Quem deve a quem agora: partes divididas ainda fora de qualquer acerto (parcelas futuras do cartão
  // e à vista pós-geração). Independe do filtro — é o saldo corrente.
  const { itens } = await carregarDevidos(supabase, { ateParcela: "9999-12-31", ateGasto: "9999-12-31", pessoas: socias });
  const porDupla = new Map<string, number>();
  for (const it of itens) porDupla.set(`${it.devedora} → ${it.credora}`, (porDupla.get(`${it.devedora} → ${it.credora}`) ?? 0) + it.valor);
  const aAcertar = [...porDupla.entries()].map(([dupla, valor]) => ({ dupla, valor }));

  const hoje = new Date().toISOString().slice(0, 10);
  const acertos = ((acertosAbertos ?? []) as {
    id: string; tipo: string; mes_referencia: string | null; vencimento: string | null; devedora: string; credora: string; valor: number;
  }[]).map((a) => ({
    id: a.id,
    devedora: a.devedora,
    credora: a.credora,
    valor: Number(a.valor),
    tipo: a.tipo,
    mes_referencia: a.mes_referencia,
    vencimento: a.vencimento,
    atrasado: !!a.vencimento && a.vencimento < hoje,
  }));

  return { acertos, aAcertar, investimento, totalSocias, totalEmpresa, totalAcertoPendente };
}
