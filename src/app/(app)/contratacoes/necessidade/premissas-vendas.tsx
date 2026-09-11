"use client";

import { useActionState, useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import { salvarPremissasVendas, type ActionState } from "./actions";

export type PremissaVendasProduto = {
  produto_id: string;
  nome: string;
  capacidade_vendedor_mes: number | null;
  reunioes_por_oportunidade: number | null;
  span_of_control: number | null;
};

const initialState: ActionState = { error: null };

/** Premissas que dimensionam vendedor e coordenador — por produto, editáveis aqui, onde o
 *  resultado delas aparece. Saíram da matriz de crescimento porque não variam por fase. */
export function PremissasVendas({ cenarioId, produtos }: { cenarioId: string; produtos: PremissaVendasProduto[] }) {
  const [aberto, setAberto] = useState(false);
  if (produtos.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center font-heading text-[13px] font-semibold">
          Premissas do time de vendas
          <InfoTooltip texto="Valem pro produto inteiro, em todas as fases. Reuniões por closer/mês dimensiona a aba Vendedor; reuniões por oportunidade é a carga extra de produtos de ciclo mais longo (Mind = 1,25); vendedores por coordenador dimensiona a aba Coordenador. Horas de suporte não ficam aqui: vêm das regras de COGS do produto (Plano de Custos → CSP)." />
        </span>
        <span className="text-[11px] text-text-faint">
          {produtos
            .map((p) =>
              p.capacidade_vendedor_mes == null
                ? `${p.nome.replace("Fashion ", "")}: venda automática`
                : `${p.nome.replace("Fashion ", "")}: ${p.capacidade_vendedor_mes} reun/closer · ${p.reunioes_por_oportunidade != null ? Math.round((p.reunioes_por_oportunidade - 1) * 100) : 0}% 2ª reunião`,
            )
            .join(" · ")}{" "}
          {aberto ? "▲" : "▼"}
        </span>
      </button>
      {aberto && (
        <div className="mt-3 flex flex-col gap-2">
          {produtos.map((p) => (
            <FormProduto key={p.produto_id} cenarioId={cenarioId} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function FormProduto({ cenarioId, p }: { cenarioId: string; p: PremissaVendasProduto }) {
  const [state, formAction, pending] = useActionState(salvarPremissasVendas, initialState);
  return (
    <form action={formAction} className="form-linha items-end rounded-lg bg-bg p-2.5">
      <input type="hidden" name="cenario_id" value={cenarioId} />
      <input type="hidden" name="produto_id" value={p.produto_id} />
      <span className="mb-1.5 w-[130px] text-[12px] font-medium">{p.nome}</span>
      <label className="mb-1.5 flex items-center gap-1.5 text-[11.5px]">
        <input type="checkbox" name="sem_vendedor" defaultChecked={p.capacidade_vendedor_mes == null} />
        Venda automática
        <InfoTooltip texto="O cliente assina sozinho (bot, teste grátis, checkout) — sem reunião com vendedor. O produto deixa de gerar demanda de vendedor e as vendas dele não pagam comissão nem valor por venda. A prospecção continua podendo ser feita por um SDR (humano ou bot)." />
      </label>
      <div className="form-campo">
        <label className="flex items-center">
          Reuniões por closer/mês
          <InfoTooltip texto="Quantas reuniões UM vendedor consegue conduzir por mês — 20 por semana ≈ 80. Reuniões do mês ÷ isso = vendedores necessários (aba Vendedor)." />
        </label>
        <input name="capacidade_vendedor_mes" type="number" step="1" min="1" defaultValue={p.capacidade_vendedor_mes ?? ""} placeholder="80" className="input campo-num" />
      </div>
      <div className="form-campo">
        <label className="flex items-center">
          2ª reunião pra fechar (%)
          <InfoTooltip texto="De cada 100 primeiras reuniões, quantas precisam de uma segunda conversa antes de fechar. Não é a taxa de fechamento (essa está na matriz de canais) — é carga extra na agenda do vendedor. Fashion Mind: a cada 20 reuniões, 5 pedem uma segunda = 25%. Price e Skills fecham na primeira = 0%." />
        </label>
        <input
          name="segunda_reuniao_pct"
          type="number"
          step="1"
          min="0"
          max="100"
          defaultValue={p.reunioes_por_oportunidade != null ? Math.round((p.reunioes_por_oportunidade - 1) * 100) : ""}
          placeholder="0"
          className="input campo-pct"
        />
      </div>
      <div className="form-campo">
        <label className="flex items-center">
          Vendedores por coordenador
          <InfoTooltip texto="Quantos vendedores um coordenador supervisiona. Vendedores ÷ isso = coordenadores necessários (aba Coordenador). Só passa a importar quando houver mais de um vendedor." />
        </label>
        <input name="span_of_control" type="number" step="1" min="1" defaultValue={p.span_of_control ?? ""} placeholder="8" className="input campo-num" />
      </div>
      <button type="submit" disabled={pending} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-primary-deep disabled:opacity-60">
        {pending ? "…" : "Salvar"}
      </button>
      {state.error && <span className="text-[11px] text-danger">{state.error}</span>}
      {state.success && <span className="text-[11px] text-success">Salvo.</span>}
    </form>
  );
}
