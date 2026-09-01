"use client";

import { useActionState, useRef, useState } from "react";
import { criarModeloContratacao, type ActionState } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";
import type { TipoModelo } from "@/lib/modelos-contratacao";

const initialState: ActionState = { error: null };

export function ModeloForm({ cargosSugeridos }: { cargosSugeridos: string[] }) {
  const [state, formAction, pending] = useActionState(criarModeloContratacao, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<TipoModelo>("clt");

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-sm font-semibold">Novo modelo de contratação</h2>
      <p className="mb-4 text-[12px] text-text-muted">
        Um cargo pode ter vários modelos (CLT, PJ, Empresa) — o sistema compara o custo de cada um pra cobrir a demanda
      </p>
      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
          setTipo("clt");
        }}
        className="flex flex-col gap-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Cargo</label>
            <input name="cargo" list="cargos-modelo" placeholder="Ex: SDR" className="input" required />
            <datalist id="cargos-modelo">
              {cargosSugeridos.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Categoria</label>
            <select name="categoria" defaultValue="sm" className="input">
              <option value="sm">S&amp;M — Vendas e Marketing</option>
              <option value="pd">P&amp;D — Produto e Tecnologia</option>
              <option value="ga">G&amp;A — Geral e Administrativo</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Nome do modelo</label>
          <input name="nome" placeholder="Ex: SDR — CLT dedicado" className="input" required />
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
              <input name="capacidade_unidade_mes" type="number" step="0.01" className="input" required />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Horas semanais</label>
              <input name="horas_semanais" type="number" step="0.5" placeholder="Ex: 30" className="input" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Salário bruto (R$)</label>
              <input name="salario_bruto" type="number" step="0.01" className="input" required />
            </div>
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Encargos (%)
                <InfoTooltip texto="Percentual de encargos trabalhistas sobre o salário bruto (veja a referência em Configurações)." />
              </label>
              <input name="aliquota_encargos" type="number" step="0.01" placeholder="Ex: 60.83" className="input" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Estrutura mensal (R$)
                <InfoTooltip texto="Custo de telefone, computador, sistema etc. que a empresa precisa fornecer pra essa pessoa." />
              </label>
              <input name="custo_estrutura_mensal" type="number" step="0.01" placeholder="0,00" className="input" />
            </div>
          </div>
        )}

        {(tipo === "pj" || tipo === "empresa_fixo_escopo") && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-bg p-3">
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Capacidade / mês
                <InfoTooltip texto="Volume de demanda (contatos, vendedores supervisionados ou horas) coberto por um pacote/pessoa desse modelo." />
              </label>
              <input name="capacidade_unidade_mes" type="number" step="0.01" className="input" required />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Valor mensal (R$)</label>
              <input name="valor_mensal" type="number" step="0.01" className="input" required />
            </div>
            {tipo === "pj" && (
              <div className="col-span-2">
                <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                  Estrutura mensal (R$)
                  <InfoTooltip texto="PJ usa o computador próprio, mas normalmente a empresa ainda fornece central/sistema — custo disso aqui." />
                </label>
                <input name="custo_estrutura_mensal" type="number" step="0.01" placeholder="0,00" className="input" />
              </div>
            )}
            {tipo === "empresa_fixo_escopo" && (
              <div className="col-span-2">
                <label className="mb-1 block text-[10.5px] text-text-muted">Canal</label>
                <select name="canal" defaultValue="multicanal" className="input">
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
              <input name="valor_fixo_mensal" type="number" step="0.01" className="input" required />
            </div>
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Valor por resultado (R$)
                <InfoTooltip texto="Bônus por cada reunião qualificada agendada/realizada (ou contato convertido, dependendo de como você definir o resultado)." />
              </label>
              <input name="valor_por_unidade_convertida" type="number" step="0.01" className="input" required />
            </div>
          </div>
        )}

        {tipo === "empresa_creditos" && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-bg p-3">
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Valor por crédito (R$)</label>
              <input name="valor_por_credito" type="number" step="0.01" className="input" required />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Créditos por contato</label>
              <input name="creditos_por_unidade" type="number" step="0.01" defaultValue={1} className="input" />
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
          {pending ? "Salvando…" : "Salvar modelo"}
        </button>
      </form>
    </div>
  );
}
