"use client";

import { useActionState, useRef } from "react";
import { salvarPlanejamentoFase, type CurvaActionState } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";

export type TrimestreDados = { indice: number; taxa_crescimento_mensal: number | null; taxa_churn_mensal: number | null };

type FaseDados = {
  taxa_crescimento_mensal: number | null;
  taxa_churn_mensal: number | null;
  capacidade_vendedor_mes: number | null;
  reunioes_por_oportunidade: number | null;
  span_of_control: number | null;
  horas_suporte_por_cliente_mes: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  trimestres: TrimestreDados[];
} | null;

/** Quantos blocos de 3 meses a fase tem. Fase aberta (sem fim) mostra 4 — o último bloco
 *  cadastrado vale dali em diante, então não precisa de mais. */
function quantidadeTrimestres(d: FaseDados): number {
  if (!d?.data_inicio) return 0;
  if (!d.data_fim) return 4;
  const i = new Date(d.data_inicio + "T00:00:00");
  const f = new Date(d.data_fim + "T00:00:00");
  const meses = (f.getFullYear() - i.getFullYear()) * 12 + (f.getMonth() - i.getMonth()) + 1;
  return Math.max(1, Math.ceil(meses / 3));
}

export type ProdutoCurva = {
  id: string;
  nome: string;
  fases: { fase: string; label: string; ordem: number; dados: FaseDados }[];
};

const initialState: CurvaActionState = { error: null };

function fmtData(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

function pctStr(v: number | null | undefined) {
  return v != null ? (v * 100).toFixed(2) : "";
}

export function CurvaMatriz({ cenarioId, produtos }: { cenarioId: string; produtos: ProdutoCurva[] }) {
  if (produtos.length === 0) {
    return <p className="text-[13px] text-text-muted">Nenhum produto cadastrado ainda — cadastre em Produtos primeiro.</p>;
  }

  const fasesRef = produtos[0].fases;

  return (
    <div className="flex flex-col gap-3">
      {fasesRef.map((faseRef, i) => (
        <FaseSecao
          key={faseRef.fase}
          cenarioId={cenarioId}
          fase={faseRef.fase}
          label={faseRef.label}
          ordem={i + 1}
          produtos={produtos.map((p) => ({
            id: p.id,
            nome: p.nome,
            dados: p.fases[i]?.dados ?? null,
          }))}
        />
      ))}
    </div>
  );
}

function FaseSecao({
  cenarioId,
  fase,
  label,
  ordem,
  produtos,
}: {
  cenarioId: string;
  fase: string;
  label: string;
  ordem: number;
  produtos: { id: string; nome: string; dados: FaseDados }[];
}) {
  const [state, formAction, pending] = useActionState(salvarPlanejamentoFase, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-lg border border-border-soft overflow-hidden">
      <div className="bg-primary-soft px-4 py-2.5">
        <span className="text-[12.5px] font-semibold">
          {ordem}. {label}
        </span>
      </div>

      <form
        ref={formRef}
        action={(formData) => {
          const linhas = produtos.map((p) => {
            const get = (name: string) => formData.get(`${p.id}__${name}`);
            const pct = (name: string) => {
              const v = get(name);
              return v !== null && v !== "" ? Number(v) / 100 : null;
            };
            const trimestres = Array.from({ length: quantidadeTrimestres(p.dados) }, (_, i) => ({
              indice: i,
              taxa_crescimento_mensal: pct(`t${i}_cresc`),
              taxa_churn_mensal: pct(`t${i}_churn`),
            }));
            return {
              produto_id: p.id,
              taxa_crescimento_mensal: pct("taxa_crescimento_mensal"),
              taxa_churn_mensal: pct("taxa_churn_mensal"),
              trimestres,
            };
          });
          const fd = new FormData();
          fd.set("cenario_id", cenarioId);
          fd.set("fase", fase);
          fd.set("linhas", JSON.stringify(linhas));
          formAction(fd);
        }}
        className="overflow-x-auto"
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-[220px]"></th>
              {produtos.map((p) => (
                <th
                  key={p.id}
                  className="border-l border-border-soft px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-text-faint"
                >
                  {p.nome}
                  <span className="mt-0.5 block font-mono text-[10px] normal-case tracking-normal text-text-muted">
                    {p.dados?.data_inicio ? fmtData(p.dados.data_inicio) : "—"} → {p.dados?.data_fim ? fmtData(p.dados.data_fim) : "aberta"}
                    {p.dados?.data_inicio ? ` · ${quantidadeTrimestres(p.dados)} tri` : ""}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <LinhaMatriz
              label="Crescimento padrão da fase (%)"
              tooltip="Vale nos trimestres em que você não preencher taxa própria abaixo. A cada mês, quantos % de clientes novos em relação à base atual."
            >
              {produtos.map((p) => (
                <TdInput
                  key={p.id}
                  name={`${p.id}__taxa_crescimento_mensal`}
                  type="number"
                  step="0.01"
                  defaultValue={pctStr(p.dados?.taxa_crescimento_mensal)}
                  placeholder="16.7"
                />
              ))}
            </LinhaMatriz>
            <LinhaMatriz
              label="Churn padrão da fase (%)"
              tooltip="Vale nos trimestres sem churn próprio abaixo. Taxa mensal — em planos semestrais/anuais é aplicada composta só na renovação."
            >
              {produtos.map((p) => (
                <TdInput
                  key={p.id}
                  name={`${p.id}__taxa_churn_mensal`}
                  type="number"
                  step="0.01"
                  defaultValue={pctStr(p.dados?.taxa_churn_mensal)}
                  placeholder="1.5"
                />
              ))}
            </LinhaMatriz>
            {(() => {
              const maxT = Math.max(0, ...produtos.map((p) => quantidadeTrimestres(p.dados)));
              if (maxT === 0) return null;
              return (
                <>
                  <tr className="bg-bg">
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-text-faint" colSpan={produtos.length + 1}>
                      <span className="flex items-center">
                        Por trimestre da fase — crescimento % / churn %
                        <InfoTooltip texto="Cada fase dividida em blocos de 3 meses contados do início dela. Preencha só onde a taxa difere do padrão: bloco em branco usa o padrão da fase; bloco preenchido vale dele em diante até o próximo preenchido — então, numa fase aberta como a maturidade, o último bloco segue até o fim do cenário. É aqui que uma tração de 24 meses deixa de crescer igual do primeiro ao último trimestre." />
                      </span>
                    </th>
                  </tr>
                  {Array.from({ length: maxT }, (_, i) => (
                    <LinhaMatriz key={`t${i}`} label={`T${i + 1} · meses ${i * 3 + 1}–${i * 3 + 3}`}>
                      {produtos.map((p) => {
                        const n = quantidadeTrimestres(p.dados);
                        if (i >= n) return <td key={p.id} className="border-l border-border-soft px-3 py-1 text-center text-[10px] text-text-faint">—</td>;
                        const t = p.dados?.trimestres.find((x) => x.indice === i);
                        return (
                          <td key={p.id} className="border-l border-border-soft px-2 py-1">
                            <div className="flex items-center gap-1">
                              <input
                                name={`${p.id}__t${i}_cresc`}
                                type="number"
                                step="0.01"
                                defaultValue={pctStr(t?.taxa_crescimento_mensal)}
                                placeholder={pctStr(p.dados?.taxa_crescimento_mensal) || "cresc."}
                                className="w-[64px] rounded border border-border-soft bg-transparent px-1 py-0.5 font-mono text-[11px] outline-none focus:border-primary-fill"
                              />
                              <span className="text-[10px] text-text-faint">/</span>
                              <input
                                name={`${p.id}__t${i}_churn`}
                                type="number"
                                step="0.01"
                                defaultValue={pctStr(t?.taxa_churn_mensal)}
                                placeholder={pctStr(p.dados?.taxa_churn_mensal) || "churn"}
                                className="w-[64px] rounded border border-border-soft bg-transparent px-1 py-0.5 font-mono text-[11px] outline-none focus:border-primary-fill"
                              />
                            </div>
                          </td>
                        );
                      })}
                    </LinhaMatriz>
                  ))}
                </>
              );
            })()}
          </tbody>
        </table>

        <div className="flex items-center gap-3 p-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
          >
            {pending ? "Salvando…" : "Salvar fase"}
          </button>
          {state.error && <p className="text-[11.5px] text-danger">{state.error}</p>}
          {state.success && <p className="text-[11.5px] text-success">Fase salva.</p>}
        </div>
      </form>
    </div>
  );
}

function LinhaMatriz({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <tr>
      <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
        <span className="flex items-center">
          {label}
          {tooltip && <InfoTooltip texto={tooltip} />}
        </span>
      </th>
      {children}
    </tr>
  );
}

function TdInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <td className="border-l border-t border-border-soft px-2 py-1.5">
      <input {...props} className="w-full border-none bg-transparent font-mono text-[12px] outline-none" />
    </td>
  );
}
