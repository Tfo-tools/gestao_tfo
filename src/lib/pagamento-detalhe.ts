/**
 * Grava o detalhe da forma de pagamento de uma despesa (linhas em despesa_pagamentos) e, quando é
 * cartão, o cronograma de parcelas em despesa_parcelas (origem "fatura_cartao") — o que alimenta o
 * lembrete de pagamento. É usado tanto pelo formulário de Custos quanto pelo lançamento a partir de
 * um item de viagem, por isso vive aqui (lib) e não dentro de um "use server".
 *
 * Override do mês da 1ª parcela: no cartão a gente só sabe em qual fatura a compra caiu quando ela
 * fecha; por isso, na EDIÇÃO da despesa, a sócia pode fixar o mês da 1ª parcela (item.vencimento_
 * primeira = AAAA-MM-01) e as demais seguem a partir daí. Ver src/lib/fatura-cartao.ts.
 */

import { cicloValido, datasDasParcelas, datasDasParcelasDeInicio } from "./fatura-cartao";

/* eslint-disable @typescript-eslint/no-explicit-any */

const FORMAS_CARTAO = new Set(["cartao_credito_socias", "cartao_corporativo"]);

export const LABEL_FORMA: Record<string, string> = {
  cartao_credito_socias: "Cartão de crédito (sócias)",
  cartao_corporativo: "Cartão corporativo",
  debito_conta: "Débito em conta",
  boleto: "Boleto",
  pix: "Pix",
};

/** Resumo curto da forma de pagamento (pra despesas.forma_pagamento, só exibição). */
export function resumoDaForma(itens: any[]): string | null {
  if (!Array.isArray(itens) || itens.length === 0) return null;
  if (itens.length === 1) return LABEL_FORMA[itens[0].forma] ?? itens[0].forma;
  return `Combinada (${itens.length} formas)`;
}

/** Igual acima, mas lê o JSON cru (usado em recorrentes, que guardam o detalhe inteiro). */
export function resumoFormaPagamentoJson(itensRaw: string | null | undefined): { resumo: string | null; detalheJson: string | null } {
  if (!itensRaw) return { resumo: null, detalheJson: null };
  let itens: any[] = [];
  try {
    itens = JSON.parse(itensRaw);
  } catch {
    return { resumo: null, detalheJson: null };
  }
  if (!Array.isArray(itens) || itens.length === 0) return { resumo: null, detalheJson: null };
  return { resumo: resumoDaForma(itens), detalheJson: itensRaw };
}

/** Normaliza o override do mês da 1ª parcela pra AAAA-MM-01 (ou null se inválido/ausente). */
function mesInicioValido(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

/**
 * Substitui as linhas de despesa_pagamentos pelas novas e recalcula as parcelas de cartão. Devolve
 * um resumo curto pra despesas.forma_pagamento. Parâmetros em texto puro (JSON), pra poder ser
 * chamada de qualquer server action.
 */
export async function salvarPagamentoDetalhe(
  supabase: any,
  despesaId: string,
  opts: {
    pagamentoDetalheJson: string | null | undefined;
    efetivacaoJson?: string | null;
    dataGasto: string;
    pagador?: string | null;
  },
): Promise<string | null> {
  const itensRaw = String(opts.pagamentoDetalheJson || "");
  if (!itensRaw) return null;

  let itens: any[] = [];
  try {
    itens = JSON.parse(itensRaw);
  } catch {
    return null;
  }
  if (!Array.isArray(itens) || itens.length === 0) return null;

  let efetivacao: Record<string, any> = {};
  if (opts.efetivacaoJson) {
    try {
      efetivacao = JSON.parse(opts.efetivacaoJson);
    } catch {
      efetivacao = {};
    }
  }

  const dataGasto = String(opts.dataGasto || "");
  const pagador = String(opts.pagador || "").trim();

  await supabase.from("despesa_pagamentos").delete().eq("despesa_id", despesaId);

  const linhas = itens.map((item, idx) => {
    const efet = efetivacao[String(idx)] ?? efetivacao[idx];
    return {
      despesa_id: despesaId,
      forma_pagamento: item.forma,
      valor: Number(item.valor) || 0,
      banco: item.banco || null,
      bandeira: item.bandeira || null,
      titular: item.titular || null,
      parcelado: !!item.parcelado,
      num_parcelas: item.parcelado ? Number(item.num_parcelas) || null : null,
      codigo: item.codigo || null,
      meio_pagamento_id: item.meio_pagamento_id || null,
      dia_vencimento: FORMAS_CARTAO.has(item.forma) && item.dia_vencimento ? Number(item.dia_vencimento) : null,
      dias_fechamento_antes:
        FORMAS_CARTAO.has(item.forma) && item.dias_fechamento_antes != null ? Number(item.dias_fechamento_antes) : null,
      efetivado_banco: efet?.banco || null,
      efetivado_conta: efet?.conta || null,
      efetivado_data: efet?.data || null,
      efetivado_obs: efet?.observacao || null,
    };
  });

  await supabase.from("despesa_pagamentos").insert(linhas);

  // Fatura do cartão → cronograma em despesa_parcelas (alimenta o lembrete de pagamento).
  await supabase.from("despesa_parcelas").delete().eq("despesa_id", despesaId).eq("origem", "fatura_cartao");
  if (dataGasto) {
    for (const item of itens) {
      if (!FORMAS_CARTAO.has(item.forma)) continue;
      const override = mesInicioValido(item.vencimento_primeira);
      const temCiclo = cicloValido(item.dia_vencimento, item.dias_fechamento_antes);
      // Sem override e sem ciclo não dá pra calcular; com override, basta o dia de vencimento.
      if (!override && !temCiclo) continue;
      const dia = Number(item.dia_vencimento) || 1;
      const numParcelas = item.parcelado ? Math.max(2, Number(item.num_parcelas) || 2) : 1;
      const datas = override
        ? datasDasParcelasDeInicio(override, dia, numParcelas)
        : datasDasParcelas(dataGasto, dia, Number(item.dias_fechamento_antes), numParcelas);
      if (datas.length === 0) continue;
      const valorParcela = Math.round((Number(item.valor) / numParcelas) * 100) / 100;
      await supabase.from("despesa_parcelas").insert(
        datas.map((data_prevista, i) => ({
          despesa_id: despesaId,
          numero_parcela: i + 1,
          valor: i === datas.length - 1 ? Math.round((Number(item.valor) - valorParcela * (datas.length - 1)) * 100) / 100 : valorParcela,
          data_prevista,
          pagador: item.titular || pagador || null,
          origem: "fatura_cartao",
        })),
      );

      // O ciclo digitado vira o padrão da próxima vez (não mexe quando foi só override do mês).
      if (temCiclo && item.meio_pagamento_id) {
        await supabase
          .from("meios_pagamento")
          .update({ dia_vencimento: Number(item.dia_vencimento), dias_fechamento_antes: Number(item.dias_fechamento_antes) })
          .eq("id", item.meio_pagamento_id);
      } else if (temCiclo && pagador) {
        const { data: perfil } = await supabase.from("profiles").select("id").eq("nome", pagador).maybeSingle();
        if (perfil)
          await supabase
            .from("profiles")
            .update({ cartao_dia_vencimento: Number(item.dia_vencimento), cartao_dias_fechamento_antes: Number(item.dias_fechamento_antes) })
            .eq("id", perfil.id);
      }
    }
  }

  return resumoDaForma(itens);
}
