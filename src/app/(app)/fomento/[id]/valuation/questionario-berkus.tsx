"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { salvarEstimativaValuation, type EstimativaFormState } from "./actions";
import { calcularBerkus, LABEL_GRAU, PILARES_BERKUS, TETO_BERKUS, VALOR_MAXIMO_PILAR, type GrauPilar, type RespostasBerkus } from "@/lib/valuation-berkus";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const initialState: EstimativaFormState = { error: null };

export function QuestionarioBerkus({ programaId, dataAporteAtual }: { programaId: string; dataAporteAtual: string | null }) {
  const [respostas, setRespostas] = useState<RespostasBerkus>(() =>
    Object.fromEntries(PILARES_BERKUS.map((p) => [p.chave, { grau: "nenhum" as GrauPilar, observacao: "" }])),
  );
  const [etapa, setEtapa] = useState<"perguntas" | "decisao" | "ajuste">("perguntas");
  const [valorAjustado, setValorAjustado] = useState<number | "">("");
  const [state, formAction, pending] = useActionState(salvarEstimativaValuation, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const { detalhe, valorSugerido, tetoAtingido } = useMemo(() => calcularBerkus(respostas), [respostas]);

  function setGrau(chave: string, grau: GrauPilar) {
    setRespostas((r) => ({ ...r, [chave]: { ...r[chave], grau } }));
  }
  function setObs(chave: string, observacao: string) {
    setRespostas((r) => ({ ...r, [chave]: { ...r[chave], observacao } }));
  }

  if (state.success) {
    return (
      <div className="rounded-lg bg-success-soft px-4 py-3 text-[13px] text-success">
        Estimativa salva — o pré-money do programa foi atualizado. Role pra baixo pra ver no histórico.
      </div>
    );
  }

  const valorFinal = etapa === "ajuste" ? Number(valorAjustado || 0) : valorSugerido;
  const decisao = etapa === "ajuste" ? "alterado" : "acatado";

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h3 className="mb-1 font-heading text-[14.5px] font-semibold">Estimar pré-money — Método Berkus</h3>
      <p className="mb-5 text-[12px] text-text-muted">
        Responda pensando na empresa como um todo, não só nesse produto — tração de outras ferramentas do portfólio conta.
      </p>

      <div className="flex flex-col gap-4">
        {PILARES_BERKUS.map((p) => (
          <div key={p.chave} className="rounded-lg border border-border-soft p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[13px] font-semibold">{p.label}</span>
              <span className="font-mono text-[12px] text-text-muted">até {formatBRL(VALOR_MAXIMO_PILAR)}</span>
            </div>
            <p className="mb-2 text-[12px] text-text-muted">{p.pergunta}</p>
            <p className="mb-3 text-[11px] text-text-faint">{p.ajuda}</p>
            <div className="mb-3 flex gap-2">
              {(["nenhum", "parcial", "completo"] as GrauPilar[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrau(p.chave, g)}
                  className={`rounded-full border px-3 py-1.5 text-[11.5px] font-medium ${
                    respostas[p.chave]?.grau === g
                      ? "border-primary-fill bg-primary-soft text-primary-deep"
                      : "border-border text-text-muted"
                  }`}
                >
                  {LABEL_GRAU[g]}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Observação (opcional) — o que embasa essa nota"
              value={respostas[p.chave]?.observacao ?? ""}
              onChange={(e) => setObs(p.chave, e.target.value)}
              className="input w-full"
            />
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg bg-bg p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold">Valuation pré-money sugerido</span>
          <span className="font-mono text-[18px] font-bold text-primary-deep">{formatBRL(valorSugerido)}</span>
        </div>
        {tetoAtingido && (
          <p className="text-[11px] text-text-faint">Soma bruta ultrapassou o teto de {formatBRL(TETO_BERKUS)} do estágio inicial — sugestão travada no teto.</p>
        )}
        <div className="mt-2 flex flex-col gap-0.5">
          {detalhe.map((d) => (
            <div key={d.chave} className="flex items-center justify-between text-[11.5px] text-text-muted">
              <span>{d.label}</span>
              <span className="font-mono">{formatBRL(d.valor)}</span>
            </div>
          ))}
        </div>
      </div>

      {etapa === "perguntas" && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setEtapa("decisao")}
            className="rounded-lg bg-wine-deep px-4 py-2.5 text-[13px] font-medium text-white"
          >
            Continuar
          </button>
        </div>
      )}

      {(etapa === "decisao" || etapa === "ajuste") && (
        <form ref={formRef} action={formAction} className="mt-5 flex flex-col gap-3 border-t border-border-soft pt-4">
          <input type="hidden" name="programa_id" value={programaId} />
          {PILARES_BERKUS.map((p) => (
            <span key={p.chave}>
              <input type="hidden" name={`grau_${p.chave}`} value={respostas[p.chave]?.grau ?? "nenhum"} />
              <input type="hidden" name={`obs_${p.chave}`} value={respostas[p.chave]?.observacao ?? ""} />
            </span>
          ))}
          <input type="hidden" name="decisao" value={decisao} />
          <input type="hidden" name="valor_final" value={valorFinal} />

          {etapa === "decisao" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-text-muted">O que você quer fazer com essa sugestão?</span>
              <button
                type="button"
                onClick={() => setEtapa("ajuste")}
                className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-medium text-primary-deep"
              >
                Ajustar valor
              </button>
            </div>
          )}

          {etapa === "ajuste" && (
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-text-muted">Valor final do pré-money (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={valorAjustado === "" ? valorSugerido : valorAjustado}
                onChange={(e) => setValorAjustado(e.target.value === "" ? "" : Number(e.target.value))}
                className="input w-[220px]"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-text-muted">Data do aporte</label>
            <input name="data_aporte" type="date" defaultValue={dataAporteAtual ?? ""} className="input w-[180px]" />
          </div>

          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-text-muted">Observações finais (opcional)</label>
            <textarea
              name="observacoes"
              rows={2}
              className="input w-full"
              placeholder="Ex: negociação com o investidor, contexto do momento, ressalvas..."
            />
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-60">
              {pending ? "Salvando…" : etapa === "ajuste" ? "Salvar valor ajustado" : "Acatar sugestão e salvar"}
            </button>
            <button type="button" onClick={() => setEtapa("perguntas")} className="text-[12px] text-text-muted">
              Voltar às perguntas
            </button>
          </div>
          {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
