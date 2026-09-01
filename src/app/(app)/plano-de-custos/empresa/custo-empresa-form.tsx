"use client";

import { useActionState, useRef, useState } from "react";
import { criarCustoEmpresa, type ActionState } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";
import type { TipoCustoEmpresa } from "@/lib/custos-empresa";

type PlanoContas = { id: string; codigo: string; conta: string };

const initialState: ActionState = { error: null };

export function CustoEmpresaForm({ cenarioId, planoContas }: { cenarioId: string; planoContas: PlanoContas[] }) {
  const [state, formAction, pending] = useActionState(criarCustoEmpresa, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<TipoCustoEmpresa>("fixo");
  const [faixas, setFaixas] = useState([{ id: 0 }, { id: 1 }]);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 flex items-center font-heading text-sm font-semibold">
        Novo custo da empresa
        <InfoTooltip texto="Custos que não são de UM produto específico — contador, jurídico, escritório, infraestrutura cloud compartilhada, equipe comercial (via Modelos de Contratação). Entram uma vez no EBITDA consolidado da empresa, não são rateados entre produtos." />
      </h2>
      <p className="mb-4 text-[12px] text-text-muted">
        Escritório, contador, jurídico, cloud, gateway de pagamento etc. — não ligados a um produto
      </p>
      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="cenario_id" value={cenarioId} />

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Item</label>
          <input name="item" placeholder="Ex: Contador, Escritório, Google Cloud" className="input" required />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Categoria (plano de contas)</label>
          <select name="plano_contas_id" className="input" defaultValue="">
            <option value="">Sem categoria</option>
            {planoContas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} {p.conta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Tipo de custo</label>
          <select name="tipo_custo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCustoEmpresa)} className="input">
            <option value="fixo">Fixo (mesmo valor todo mês)</option>
            <option value="escalonado">Escalonado por faixa (faturamento ou clientes)</option>
            <option value="cronograma">Cronograma mensal explícito</option>
            <option value="variavel_receita">Variável — % da receita</option>
            <option value="variavel_cliente">Variável — valor por cliente ativo</option>
          </select>
        </div>

        {tipo === "fixo" && (
          <div>
            <label className="mb-1 block text-[10.5px] text-text-muted">Valor mensal (R$)</label>
            <input name="valor_mensal" type="number" step="0.01" className="input" required />
          </div>
        )}

        {tipo === "escalonado" && (
          <div className="rounded-lg bg-bg p-3">
            <label className="mb-2 flex items-center text-[10.5px] font-medium text-text-muted">
              Baseado em
              <InfoTooltip texto="Ex: contador que cobra mais conforme o faturamento sobe, ou escritório que só se justifica a partir de X clientes." />
            </label>
            <select name="baseado_em" defaultValue="receita" className="input mb-3">
              <option value="receita">Faturamento mensal</option>
              <option value="clientes">Clientes ativos</option>
            </select>
            <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Faixas</label>
            <div className="flex flex-col gap-1.5">
              {faixas.map((f) => (
                <div key={f.id} className="flex items-center gap-1.5">
                  <input name="faixa_minimo" type="number" step="0.01" placeholder="De" className="input w-[100px]" />
                  <span className="text-[11px] text-text-faint">até</span>
                  <input name="faixa_maximo" type="number" step="0.01" placeholder="Até (vazio = sem limite)" className="input w-[130px]" />
                  <span className="text-[11px] text-text-faint">=</span>
                  <input name="faixa_valor" type="number" step="0.01" placeholder="Valor R$" className="input w-[110px]" />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFaixas((prev) => [...prev, { id: prev.length }])}
              className="mt-2 text-[11px] text-primary-deep underline"
            >
              + Adicionar faixa
            </button>
          </div>
        )}

        {tipo === "cronograma" && (
          <div className="rounded-lg bg-bg p-3">
            <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
              Mês de início
              <InfoTooltip texto="A partir de qual mês os valores abaixo começam a valer, em sequência." />
            </label>
            <input name="mes_inicio" type="date" className="input mb-3" required />
            <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
              Valores mensais, em sequência (separados por vírgula)
              <InfoTooltip texto="Ex: cronograma de um projeto financiado, com valor diferente a cada mês. Cole os 12 (ou quantos precisar) valores separados por vírgula, na ordem em que ocorrem." />
            </label>
            <textarea
              name="valores_mensais"
              placeholder="Ex: 1380, 2617.5, 3337.5, 3337.5, 3337.5, 2460, 1260, 540, 540, 540, 180, 180"
              className="input min-h-[70px]"
              required
            />
          </div>
        )}

        {tipo === "variavel_receita" && (
          <div>
            <label className="mb-1 block text-[10.5px] text-text-muted">Percentual da receita total (%)</label>
            <input name="percentual" type="number" step="0.01" placeholder="Ex: 2.5" className="input" required />
          </div>
        )}

        {tipo === "variavel_cliente" && (
          <div>
            <label className="mb-1 block text-[10.5px] text-text-muted">Valor por cliente ativo (R$/mês)</label>
            <input name="valor_por_cliente" type="number" step="0.01" className="input" required />
          </div>
        )}

        {tipo !== "cronograma" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Início (opcional)</label>
              <input name="data_inicio" type="date" className="input" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Fim (opcional)</label>
              <input name="data_fim" type="date" className="input" />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Observações</label>
          <input name="observacoes" type="text" className="input" placeholder="Opcional" />
        </div>

        {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar custo"}
        </button>
      </form>
    </div>
  );
}
