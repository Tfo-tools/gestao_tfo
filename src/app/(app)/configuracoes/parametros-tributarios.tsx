"use client";

import { useActionState, useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import type { ParametrosTributarios } from "@/lib/impostos";
import { salvarParametrosTributarios, type ActionState } from "./tributos-actions";

const initialState: ActionState = { error: null };

const GRUPOS: { titulo: string; nota: string; campos: { k: keyof ParametrosTributarios; label: string; ajuda: string }[] }[] = [
  {
    titulo: "Sobre a receita (acima da margem bruta)",
    nota: "Viram a linha “Impostos sobre a receita” da DRE depois que a empresa sai do Simples.",
    campos: [
      { k: "iss_pct", label: "ISS", ajuda: "Alíquota do seu município para software/SaaS (entre 2% e 5%). Na reforma ele sai aos poucos: 90% em 2029, 80% em 2030… até zerar em 2033, substituído pelo IBS." },
      { k: "pis_pct", label: "PIS", ajuda: "Lucro presumido, regime cumulativo (0,65%). Vale só até 2026 — de 2027 em diante PIS e COFINS viram CBS." },
      { k: "cofins_pct", label: "COFINS", ajuda: "Lucro presumido, cumulativo (3%). Vale só até 2026." },
      { k: "cbs_pct", label: "CBS", ajuda: "Contribuição federal da reforma, a partir de 2027. Alíquota de referência estimada (~8,8%) — ainda será fixada em definitivo." },
      { k: "ibs_pct", label: "IBS (cheio)", ajuda: "Imposto estadual + municipal da reforma (~17,7% estimado). Entra 10% em 2029, 20% em 2030, 30% em 2031, 40% em 2032 e 100% em 2033." },
      { k: "credito_fator", label: "Crédito aproveitado", ajuda: "Quanto das compras de fornecedor (nuvem, LLM, software, gateway, mídia, agências, feiras) vira crédito de CBS/IBS. 100% = tudo; fornecedor no Simples gera crédito menor. Folha e pró-labore nunca geram crédito." },
    ],
  },
  {
    titulo: "Sobre o lucro (abaixo do EBITDA)",
    nota: "IRPJ e CSLL do lucro presumido — no Simples eles estão dentro do DAS.",
    campos: [
      { k: "presuncao_pct", label: "Presunção de lucro", ajuda: "Para serviços, o lucro presumido é 32% da receita." },
      { k: "irpj_pct", label: "IRPJ", ajuda: "15% sobre a base presumida." },
      { k: "irpj_adicional_pct", label: "Adicional de IRPJ", ajuda: "10% sobre a parte da base presumida acima de R$ 20 mil por mês." },
      { k: "csll_pct", label: "CSLL", ajuda: "9% sobre a base presumida." },
    ],
  },
];

function pct(v: number) {
  return Number((v * 100).toFixed(4)).toString();
}

/** Tributação depois do Simples: quando o app troca de regime e com quais alíquotas. */
export function ParametrosTributariosCard({ valores, observacoes }: { valores: ParametrosTributarios; observacoes: string | null }) {
  const [state, formAction, pending] = useActionState(salvarParametrosTributarios, initialState);
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="flex items-center font-heading text-sm font-semibold">
            Impostos depois do Simples
            <InfoTooltip texto="O app mantém o Simples Nacional enquanto o faturamento do ano fica abaixo de R$ 4,8 mi. Passou disso, a empresa sai em janeiro do ano seguinte (ou já no mês seguinte, se passar de R$ 5,76 mi). Daí em diante a projeção usa lucro presumido com a transição da reforma tributária. São estimativas — confirme com o contador." />
          </h2>
          <p className="mt-1 max-w-3xl text-[11.5px] text-text-muted">
            Enquanto estiver no Simples, nada daqui é usado. Depois, os impostos sobre a receita saem já descontado o crédito de
            CBS/IBS sobre compras de fornecedor, e o IRPJ/CSLL aparece abaixo do EBITDA. Alíquotas em %, valem para todos os cenários.
          </p>
        </div>
        <span className="shrink-0 text-[12px] text-primary-deep">{aberto ? "Recolher ▲" : "Gerenciar ▾"}</span>
      </button>
      {aberto && (
      <form action={formAction} className="mt-5 flex flex-col gap-4">
        {GRUPOS.map((g) => (
          <div key={g.titulo}>
            <p className="mb-2 text-[11.5px] font-medium">
              {g.titulo} <span className="font-normal text-text-faint">— {g.nota}</span>
            </p>
            <div className="flex flex-wrap gap-3">
              {g.campos.map((c) => (
                <div key={c.k} className="form-campo">
                  <label className="flex items-center">
                    {c.label} (%)
                    <InfoTooltip texto={c.ajuda} />
                  </label>
                  <input name={c.k} type="number" step="0.01" min="0" max="100" defaultValue={pct(valores[c.k])} className="input campo-pct" />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="form-campo">
          <label>Observações (ex: “validado com o contador em …”)</label>
          <input name="observacoes" defaultValue={observacoes ?? ""} className="input" />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60">
            {pending ? "Salvando…" : "Salvar alíquotas"}
          </button>
          {state.error && <span className="text-[11.5px] text-danger">{state.error}</span>}
          {state.success && <span className="text-[11.5px] text-success">Salvo — as projeções já usam os novos valores.</span>}
        </div>
      </form>
      )}
    </div>
  );
}
