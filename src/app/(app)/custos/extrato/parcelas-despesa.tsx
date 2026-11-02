"use client";

import { useState, useTransition } from "react";
import { dividirMeioAMeio, desfazerDivisao } from "../actions";

export type Parcela = {
  id: string;
  numero_parcela: number;
  valor: number;
  data_prevista: string;
  pagador: string | null;
  status: string;
  paga_em: string | null;
  origem?: string | null;
};

export type RateioDespesa = { pessoa: string; percentual: number };
export type ItemAcertoDespesa = {
  numero_parcela: number | null;
  devedora: string;
  valor: number;
  acertos_socias: { status: string; tipo: string; mes_referencia: string | null; quitado_em: string | null } | null;
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;

/** Divide pelos percentuais; o arredondamento sobra pra última (mesma regra do acerto). */
function partes(valor: number, rateio: RateioDespesa[]) {
  const ord = rateio.slice().sort((a, b) => a.pessoa.localeCompare(b.pessoa));
  const total = ord.reduce((s, r) => s + Number(r.percentual), 0);
  let acc = 0;
  return ord.map((r, i) => {
    const v = i === ord.length - 1 ? Math.round((valor - acc) * 100) / 100 : Math.round(((valor * Number(r.percentual)) / total) * 100) / 100;
    acc = Math.round((acc + v) * 100) / 100;
    return { pessoa: r.pessoa, valor: v };
  });
}

function situacao(item: ItemAcertoDespesa | undefined) {
  if (!item) return { texto: "a acertar", classe: "text-text-faint" };
  const a = item.acertos_socias;
  if (a?.status === "quitado")
    return { texto: a.tipo === "historico" ? `acertado (${a.mes_referencia ? rotuloMes(a.mes_referencia) : "antes do app"})` : `acertado${a.quitado_em ? ` em ${formatDate(a.quitado_em)}` : ""}`, classe: "text-success" };
  return { texto: `no acerto ${a?.mes_referencia ? `de ${rotuloMes(a.mes_referencia)}` : "aberto"}`, classe: "text-primary-deep" };
}

/**
 * Divisão da despesa entre as sócias e o acerto de cada parte. No cartão, o calendário da fatura
 * mostra a parte de cada uma em cada parcela — nada pra marcar aqui: o acerto do mês sai como
 * tarefa e é concluindo a tarefa que a parte fica acertada.
 */
export function ParcelasDespesa({
  despesaId,
  valorTotalDespesa,
  pagador,
  parcelas,
  rateio,
  itensAcerto,
  fechado,
}: {
  despesaId: string;
  valorTotalDespesa: number;
  pagador: string | null;
  parcelas: Parcela[];
  rateio: RateioDespesa[];
  itensAcerto: ItemAcertoDespesa[];
  fechado: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const doCartao = parcelas.filter((p) => p.origem === "fatura_cartao").sort((a, b) => a.numero_parcela - b.numero_parcela);
  const dividido = rateio.length > 0;
  const emAcerto = itensAcerto.length > 0;
  const blocos =
    doCartao.length > 0
      ? doCartao.map((p) => ({ numero: p.numero_parcela as number | null, rotulo: `${p.numero_parcela}/${doCartao.length}`, valor: Number(p.valor), data: p.data_prevista }))
      : [{ numero: null as number | null, rotulo: "À vista", valor: valorTotalDespesa, data: null as string | null }];

  const acao = (fn: () => Promise<{ error: string | null }>) =>
    startTransition(async () => {
      setErro(null);
      const r = await fn();
      if (r.error) setErro(r.error);
    });

  return (
    <div className="w-full rounded-lg border border-border-soft bg-bg p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold text-text-muted">
          {dividido
            ? `Dividida: ${rateio.map((r) => `${r.pessoa} ${Number(r.percentual).toFixed(0)}%`).join(" · ")}${pagador ? ` — pago por ${pagador}` : " — falta dizer quem pagou"}`
            : "Sem divisão — a despesa fica toda com quem pagou."}
        </span>
        {!fechado && !emAcerto && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => acao(() => (dividido ? desfazerDivisao(despesaId) : dividirMeioAMeio(despesaId)))}
            className="text-[11px] font-medium text-primary-deep disabled:opacity-50"
          >
            {isPending ? "…" : dividido ? "Desfazer divisão" : "Dividir meio a meio"}
          </button>
        )}
      </div>

      {dividido && (
        <div className="flex flex-col gap-1.5">
          {blocos.map((b) => {
            const ps = partes(b.valor, rateio);
            return (
              <div key={b.rotulo} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-soft bg-surface px-3 py-2 text-[12px]">
                <span>
                  <span className="font-semibold">{b.rotulo}</span>
                  <span className="ml-2 font-mono">{formatBRL(b.valor)}</span>
                  {b.data && <span className="ml-2 text-text-faint">fatura {formatDate(b.data)}</span>}
                </span>
                <span className="flex flex-wrap gap-3">
                  {ps.map((p) => {
                    const deQuemPagou = p.pessoa === pagador;
                    const s = situacao(itensAcerto.find((i) => i.devedora === p.pessoa && (i.numero_parcela ?? null) === b.numero));
                    return (
                      <span key={p.pessoa} className="text-[11px]">
                        {p.pessoa} <span className="font-mono">{formatBRL(p.valor)}</span>{" "}
                        <span className={deQuemPagou ? "text-text-faint" : s.classe}>{deQuemPagou ? "(pagou)" : `· ${s.texto}`}</span>
                      </span>
                    );
                  })}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {erro && <p className="mt-1.5 text-[11px] text-danger">{erro}</p>}
    </div>
  );
}
