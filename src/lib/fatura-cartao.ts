/**
 * Em qual fatura (mês) uma compra no cartão cai — pra parcelas e pro lembrete de pagamento.
 *
 * O ciclo de um cartão tem dois números: o DIA DE VENCIMENTO (quando a fatura é cobrada) e quantos
 * DIAS ANTES disso ela fecha (deixa de aceitar novas compras naquela fatura). Uma compra feita até
 * o dia de fechamento cai na fatura mais próxima; depois disso, cai na fatura seguinte.
 *
 * Ex.: vencimento dia 10, fecha 7 dias antes (fechamento dia 3). Compra em 02/03 cai na fatura que
 * vence 10/03. Compra em 05/03 (depois do fechamento) cai na que vence 10/04.
 */

function addDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addMeses(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Data de vencimento da fatura de um determinado mês/ano, com o dia ajustado pro fim do mês
 *  quando ele não existe (dia 31 em fevereiro cai no último dia do mês). */
function vencimentoDoMes(ano: number, mesIndexZero: number, diaVencimento: number): Date {
  const ultimoDiaDoMes = new Date(ano, mesIndexZero + 1, 0).getDate();
  return new Date(ano, mesIndexZero, Math.min(diaVencimento, ultimoDiaDoMes));
}

/** Em qual fatura (data de vencimento) uma compra feita em `dataCompraIso` (AAAA-MM-DD) cai. */
export function vencimentoDaCompra(dataCompraIso: string, diaVencimento: number, diasFechamentoAntes: number): string {
  const compra = new Date(`${dataCompraIso}T00:00:00`);
  let candidato = vencimentoDoMes(compra.getFullYear(), compra.getMonth(), diaVencimento);
  // A compra pode cair até 2 faturas à frente da do mês corrente (ciclo que atravessa a virada do
  // ano, ou vencimento no começo do mês com fechamento caindo ainda no mês anterior).
  for (let i = 0; i < 3; i++) {
    const fechamento = addDias(candidato, -diasFechamentoAntes);
    if (compra <= fechamento) return toIso(candidato);
    candidato = vencimentoDoMes(addMeses(candidato, 1).getFullYear(), addMeses(candidato, 1).getMonth(), diaVencimento);
  }
  return toIso(candidato);
}

/** Uma parcela por mês a partir da fatura calculada acima — é como o cartão parcela: a 1ª entra na
 *  fatura que a compra caiu, as seguintes uma fatura por vez, no mesmo dia de vencimento. */
export function datasDasParcelas(dataCompraIso: string, diaVencimento: number, diasFechamentoAntes: number, numParcelas: number): string[] {
  const primeira = new Date(`${vencimentoDaCompra(dataCompraIso, diaVencimento, diasFechamentoAntes)}T00:00:00`);
  const n = Math.max(1, Math.round(numParcelas) || 1);
  return Array.from({ length: n }, (_, i) => {
    const d = addMeses(primeira, i);
    return toIso(vencimentoDoMes(d.getFullYear(), d.getMonth(), diaVencimento));
  });
}

export function cicloValido(diaVencimento: unknown, diasFechamentoAntes: unknown): diaVencimento is number {
  const dv = Number(diaVencimento);
  const df = Number(diasFechamentoAntes);
  return Number.isFinite(dv) && dv >= 1 && dv <= 31 && Number.isFinite(df) && df >= 0 && df <= 28;
}
