"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { criarModeloContratacao, atualizarModeloContratacao, type ActionState } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";
import type { ParametrosModelo, TipoModelo } from "@/lib/modelos-contratacao";

const initialState: ActionState = { error: null };

type ModeloExistente = {
  id: string;
  cargo: string;
  tipo_modelo: string;
  nome: string;
  categoria: string;
  parametros: ParametrosModelo;
  observacoes: string | null;
};

export function ModeloForm({
  cargosSugeridos,
  modeloExistente,
  onSaved,
  onCancelar,
}: {
  cargosSugeridos: string[];
  modeloExistente?: ModeloExistente;
  onSaved?: () => void;
  onCancelar?: () => void;
}) {
  const acao = modeloExistente ? atualizarModeloContratacao : criarModeloContratacao;
  const [state, formAction, pending] = useActionState(acao, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<TipoModelo>((modeloExistente?.tipo_modelo as TipoModelo) ?? "clt");
  const p = modeloExistente?.parametros ?? {};
  const foiPending = useRef(false);

  useEffect(() => {
    if (foiPending.current && !pending && state.success) onSaved?.();
    foiPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state.success]);

  return (
    <div className={modeloExistente ? "rounded-lg border border-primary-fill bg-surface p-4" : "rounded-xl border border-border bg-surface p-6"}>
      {!modeloExistente && (
        <>
          <h2 className="mb-1 font-heading text-sm font-semibold">Novo modelo de contratação</h2>
          <p className="mb-4 text-[12px] text-text-muted">
            Um cargo pode ter vários modelos (CLT, PJ, Empresa) — o sistema compara o custo de cada um pra cobrir a demanda
          </p>
        </>
      )}
      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          if (!modeloExistente) {
            formRef.current?.reset();
            setTipo("clt");
          }
        }}
        className="flex flex-col gap-3"
      >
        {modeloExistente && <input type="hidden" name="id" value={modeloExistente.id} />}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Cargo</label>
            <input name="cargo" list="cargos-modelo" defaultValue={modeloExistente?.cargo} placeholder="Ex: SDR" className="input" required />
            <datalist id="cargos-modelo">
              {cargosSugeridos.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Categoria</label>
            <select name="categoria" defaultValue={modeloExistente?.categoria ?? "sm"} className="input">
              <option value="sm">S&amp;M — Vendas e Marketing</option>
              <option value="pd">P&amp;D — Produto e Tecnologia</option>
              <option value="ga">G&amp;A — Geral e Administrativo</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Nome do modelo</label>
          <input name="nome" defaultValue={modeloExistente?.nome} placeholder="Ex: SDR — CLT dedicado" className="input" required />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Tipo</label>
          <select
            name="tipo_modelo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoModelo)}
            className="input"
          >
            <option value="clt">CLT</option>
            <option value="pj">PJ (prestador individual)</option>
            <option value="empresa_fixo_escopo">Empresa — fixo por escopo</option>
            <option value="empresa_hibrido">Empresa — híbrido (fixo + por resultado)</option>
            <option value="empresa_creditos">Empresa — créditos / pay-per-use</option>
          </select>
        </div>

        {tipo === "clt" && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-bg p-3">
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Capacidade / mês
                <InfoTooltip texto="Quanto de demanda 1 pessoa nesse modelo cobre por mês — contatos (SDR), vendedores supervisionados (Coordenador) ou horas (Suporte), dependendo do cargo." />
              </label>
              <input name="capacidade_unidade_mes" type="number" step="0.01" defaultValue={p.capacidade_unidade_mes} className="input" required />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Horas semanais</label>
              <input name="horas_semanais" type="number" step="0.5" defaultValue={p.horas_semanais} placeholder="Ex: 30" className="input" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Salário bruto (R$)</label>
              <input name="salario_bruto" type="number" step="0.01" defaultValue={p.salario_bruto} className="input" required />
            </div>
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Encargos (%)
                <InfoTooltip texto="Percentual de encargos trabalhistas sobre o salário bruto (veja a referência em Configurações)." />
              </label>
              <input
                name="aliquota_encargos"
                type="number"
                step="0.01"
                defaultValue={p.aliquota_encargos != null ? (p.aliquota_encargos * 100).toFixed(2) : undefined}
                placeholder="Ex: 60.83"
                className="input"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Estrutura mensal (R$)
                <InfoTooltip texto="Custo de telefone, computador, sistema etc. que a empresa precisa fornecer pra essa pessoa." />
              </label>
              <input name="custo_estrutura_mensal" type="number" step="0.01" defaultValue={p.custo_estrutura_mensal} placeholder="0,00" className="input" />
            </div>
          </div>
        )}

        {(tipo === "pj" || tipo === "empresa_fixo_escopo") && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-bg p-3">
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Capacidade / mês
                <InfoTooltip
                  texto={
                    tipo === "pj"
                      ? "Quanto de demanda 1 PJ full-time cobre por mês, na carga horária de referência — o custo é proporcional às horas realmente usadas, não precisa contratar a capacidade inteira."
                      : "Volume de demanda coberto por 1 pacote — pacotes só são vendidos inteiros, não dá pra comprar fração."
                  }
                />
              </label>
              <input name="capacidade_unidade_mes" type="number" step="0.01" defaultValue={p.capacidade_unidade_mes} className="input" required />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Valor mensal (R$, capacidade cheia)</label>
              <input name="valor_mensal" type="number" step="0.01" defaultValue={p.valor_mensal} className="input" required />
            </div>
            {tipo === "pj" && (
              <div className="col-span-2">
                <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                  Estrutura mensal (R$)
                  <InfoTooltip texto="PJ usa o computador próprio, mas normalmente a empresa ainda fornece central/sistema — custo disso aqui." />
                </label>
                <input
                  name="custo_estrutura_mensal"
                  type="number"
                  step="0.01"
                  defaultValue={p.custo_estrutura_mensal}
                  placeholder="0,00"
                  className="input"
                />
              </div>
            )}
            {tipo === "empresa_fixo_escopo" && (
              <div className="col-span-2">
                <label className="mb-1 block text-[10.5px] text-text-muted">Canal</label>
                <select name="canal" defaultValue={p.canal ?? "multicanal"} className="input">
                  <option value="email">Só e-mail (mais barato)</option>
                  <option value="multicanal">Multicanal (e-mail + LinkedIn + ligação)</option>
                </select>
              </div>
            )}
          </div>
        )}

        {tipo === "empresa_hibrido" && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-bg p-3">
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Fixo mensal (R$)</label>
              <input name="valor_fixo_mensal" type="number" step="0.01" defaultValue={p.valor_fixo_mensal} className="input" required />
            </div>
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Valor por resultado (R$)
                <InfoTooltip texto="Bônus por cada reunião qualificada agendada/realizada (ou contato convertido, dependendo de como você definir o resultado)." />
              </label>
              <input
                name="valor_por_unidade_convertida"
                type="number"
                step="0.01"
                defaultValue={p.valor_por_unidade_convertida}
                className="input"
                required
              />
            </div>
          </div>
        )}

        {tipo === "empresa_creditos" && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-bg p-3">
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Valor por crédito (R$)</label>
              <input name="valor_por_credito" type="number" step="0.01" defaultValue={p.valor_por_credito} className="input" required />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Créditos por contato</label>
              <input name="creditos_por_unidade" type="number" step="0.01" defaultValue={p.creditos_por_unidade ?? 1} className="input" />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Observações</label>
          <input name="observacoes" type="text" defaultValue={modeloExistente?.observacoes ?? ""} className="input" placeholder="Opcional" />
        </div>

        {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>}

        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Salvando…" : "Salvar modelo"}
          </button>
          {modeloExistente && (
            <button type="button" onClick={onCancelar} className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-muted">
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
