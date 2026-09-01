"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { criarCustoEmpresa, atualizarCustoEmpresa, type ActionState } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";
import { FASES } from "@/lib/fases";
import type { ParametrosCustoEmpresa, TipoCustoEmpresa } from "@/lib/custos-empresa";

type PlanoContas = { id: string; codigo: string; conta: string };
type Produto = { id: string; nome: string };

const initialState: ActionState = { error: null };

type CustoExistente = {
  id: string;
  item: string;
  plano_contas_id: string | null;
  tipo_custo: TipoCustoEmpresa;
  valor_mensal: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  parametros: ParametrosCustoEmpresa;
  observacoes: string | null;
};

export function CustoEmpresaForm({
  cenarioId,
  planoContas,
  produtos,
  custoExistente,
  onSaved,
  onCancelar,
}: {
  cenarioId: string;
  planoContas: PlanoContas[];
  produtos: Produto[];
  custoExistente?: CustoExistente;
  onSaved?: () => void;
  onCancelar?: () => void;
}) {
  const acao = custoExistente ? atualizarCustoEmpresa : criarCustoEmpresa;
  const [state, formAction, pending] = useActionState(acao, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<TipoCustoEmpresa>(custoExistente?.tipo_custo ?? "fixo");
  const p = custoExistente?.parametros ?? {};
  const [baseadoEm, setBaseadoEm] = useState<"receita" | "clientes" | "fase">(p.baseado_em ?? "receita");
  const [faixas, setFaixas] = useState(
    (p.faixas ?? []).length > 0 ? (p.faixas ?? []).map((_, i) => ({ id: i })) : [{ id: 0 }, { id: 1 }],
  );
  const foiPending = useRef(false);

  useEffect(() => {
    if (foiPending.current && !pending && state.success) onSaved?.();
    foiPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state.success]);

  const valoresPorFase = new Map((p.faixasPorFase ?? []).map((f) => [f.fase, f.valor]));

  return (
    <div className={custoExistente ? "rounded-lg border border-primary-fill bg-surface p-4" : "rounded-xl border border-border bg-surface p-6"}>
      {!custoExistente && (
        <>
          <h2 className="mb-1 flex items-center font-heading text-sm font-semibold">
            Novo custo da empresa
            <InfoTooltip texto="Custos que não são de UM produto específico — contador, jurídico, escritório, infraestrutura cloud compartilhada, equipe comercial (via Modelos de Contratação). Entram uma vez no EBITDA consolidado da empresa, não são rateados entre produtos." />
          </h2>
          <p className="mb-4 text-[12px] text-text-muted">
            Escritório, contador, jurídico, cloud, gateway de pagamento etc. — não ligados a um produto
          </p>
        </>
      )}
      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          if (!custoExistente) {
            formRef.current?.reset();
            setTipo("fixo");
            setBaseadoEm("receita");
          }
        }}
        className="flex flex-col gap-3"
      >
        {custoExistente ? <input type="hidden" name="id" value={custoExistente.id} /> : <input type="hidden" name="cenario_id" value={cenarioId} />}

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Item</label>
          <input name="item" defaultValue={custoExistente?.item} placeholder="Ex: Contador, Escritório, Google Cloud" className="input" required />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Categoria (plano de contas)</label>
          <select name="plano_contas_id" className="input" defaultValue={custoExistente?.plano_contas_id ?? ""}>
            <option value="">Sem categoria</option>
            {planoContas.map((pc) => (
              <option key={pc.id} value={pc.id}>
                {pc.codigo} {pc.conta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Tipo de custo</label>
          <select name="tipo_custo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCustoEmpresa)} className="input">
            <option value="fixo">Fixo (mesmo valor todo mês)</option>
            <option value="escalonado">Escalonado por faixa (faturamento, clientes ou fase)</option>
            <option value="cronograma">Cronograma mensal explícito</option>
            <option value="variavel_receita">Variável — % da receita</option>
            <option value="variavel_cliente">Variável — valor por cliente ativo</option>
          </select>
        </div>

        {tipo === "fixo" && (
          <div>
            <label className="mb-1 block text-[10.5px] text-text-muted">Valor mensal (R$)</label>
            <input name="valor_mensal" type="number" step="0.01" defaultValue={custoExistente?.valor_mensal ?? undefined} className="input" required />
          </div>
        )}

        {tipo === "escalonado" && (
          <div className="rounded-lg bg-bg p-3">
            <label className="mb-2 flex items-center text-[10.5px] font-medium text-text-muted">
              Baseado em
              <InfoTooltip texto="Faturamento/clientes: pra custos que crescem com o volume real. Fase: pra custos de mercado (contador, jurídico, infra) que mudam de patamar conforme a empresa avança de estágio — é uma referência de planejamento, não de volume real." />
            </label>
            <select name="baseado_em" value={baseadoEm} onChange={(e) => setBaseadoEm(e.target.value as typeof baseadoEm)} className="input mb-3">
              <option value="receita">Faturamento mensal</option>
              <option value="clientes">Clientes ativos</option>
              <option value="fase">Fase da empresa (planejamento)</option>
            </select>

            {baseadoEm === "fase" ? (
              <>
                <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
                  Produto de referência
                  <InfoTooltip texto="Produto cuja fase (Ideação → Maturidade) serve de referência pro estágio geral da empresa nesse cenário." />
                </label>
                <select name="produto_referencia_id" defaultValue={p.produto_referencia_id ?? ""} className="input mb-3" required>
                  <option value="">Selecione um produto</option>
                  {produtos.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.nome}
                    </option>
                  ))}
                </select>
                <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Valor mensal por fase (R$)</label>
                <div className="flex flex-col gap-1.5">
                  {FASES.map((f) => (
                    <div key={f.value} className="flex items-center gap-1.5">
                      <span className="w-[110px] shrink-0 text-[10.5px] text-text-faint">{f.label}</span>
                      <input
                        name={`fase_${f.value}`}
                        type="number"
                        step="0.01"
                        defaultValue={valoresPorFase.get(f.value)}
                        placeholder="0,00"
                        className="input w-[110px]"
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label className="mb-1 block text-[10.5px] font-medium text-text-muted">Faixas</label>
                <div className="flex flex-col gap-1.5">
                  {faixas.map((f, i) => (
                    <div key={f.id} className="flex items-center gap-1.5">
                      <input
                        name="faixa_minimo"
                        type="number"
                        step="0.01"
                        placeholder="De"
                        defaultValue={p.faixas?.[i]?.minimo}
                        className="input w-[100px]"
                      />
                      <span className="text-[11px] text-text-faint">até</span>
                      <input
                        name="faixa_maximo"
                        type="number"
                        step="0.01"
                        placeholder="Até (vazio = sem limite)"
                        defaultValue={p.faixas?.[i]?.maximo ?? undefined}
                        className="input w-[130px]"
                      />
                      <span className="text-[11px] text-text-faint">=</span>
                      <input
                        name="faixa_valor"
                        type="number"
                        step="0.01"
                        placeholder="Valor R$"
                        defaultValue={p.faixas?.[i]?.valor}
                        className="input w-[110px]"
                      />
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
              </>
            )}
          </div>
        )}

        {tipo === "cronograma" && (
          <div className="rounded-lg bg-bg p-3">
            <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
              Mês de início
              <InfoTooltip texto="A partir de qual mês os valores abaixo começam a valer, em sequência." />
            </label>
            <input name="mes_inicio" type="date" defaultValue={p.mes_inicio} className="input mb-3" required />
            <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
              Valores mensais, em sequência (separados por vírgula)
              <InfoTooltip texto="Ex: cronograma de um projeto financiado, com valor diferente a cada mês. Cole os 12 (ou quantos precisar) valores separados por vírgula, na ordem em que ocorrem." />
            </label>
            <textarea
              name="valores_mensais"
              defaultValue={p.valores_mensais?.join(", ")}
              placeholder="Ex: 1380, 2617.5, 3337.5, 3337.5, 3337.5, 2460, 1260, 540, 540, 540, 180, 180"
              className="input min-h-[70px]"
              required
            />
          </div>
        )}

        {tipo === "variavel_receita" && (
          <div>
            <label className="mb-1 block text-[10.5px] text-text-muted">Percentual da receita total (%)</label>
            <input
              name="percentual"
              type="number"
              step="0.01"
              defaultValue={p.percentual != null ? p.percentual * 100 : undefined}
              placeholder="Ex: 2.5"
              className="input"
              required
            />
          </div>
        )}

        {tipo === "variavel_cliente" && (
          <div>
            <label className="mb-1 block text-[10.5px] text-text-muted">Valor por cliente ativo (R$/mês)</label>
            <input name="valor_por_cliente" type="number" step="0.01" defaultValue={p.valor_por_cliente} className="input" required />
          </div>
        )}

        {tipo !== "cronograma" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Início (opcional)</label>
              <input name="data_inicio" type="date" defaultValue={custoExistente?.data_inicio ?? undefined} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Fim (opcional)</label>
              <input name="data_fim" type="date" defaultValue={custoExistente?.data_fim ?? undefined} className="input" />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Observações</label>
          <input name="observacoes" type="text" defaultValue={custoExistente?.observacoes ?? ""} className="input" placeholder="Opcional" />
        </div>

        {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>}

        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Salvando…" : "Salvar custo"}
          </button>
          {custoExistente && (
            <button type="button" onClick={onCancelar} className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-muted">
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
