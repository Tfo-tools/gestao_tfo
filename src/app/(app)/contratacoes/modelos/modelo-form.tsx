"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { criarModeloContratacao, atualizarModeloContratacao, type ActionState } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";
import type { ParametrosModelo, TipoModelo } from "@/lib/modelos-contratacao";
import { cargoChave } from "@/lib/necessidade-contratacao";

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
  const [cargo, setCargo] = useState(modeloExistente?.cargo ?? "");
  // SDR e vendedor trabalham reunião; suporte trabalha hora; coordenador, pessoas.
  // "Vendedor Pleno", "SDR Júnior": reconhece o cargo pelo que ele contém.
  const unidadeEhReuniao = ["sdr", "vendedor"].includes(cargoChave(cargo) ?? "");
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
            <input
              name="cargo"
              list="cargos-modelo"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              placeholder="Ex: SDR"
              className="input"
              required
            />
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Nome do modelo</label>
            <input name="nome" defaultValue={modeloExistente?.nome} placeholder="Ex: SDR — CLT dedicado" className="input" required />
          </div>
          <div>
            <label className="mb-1 flex items-center text-[11px] font-medium text-text-muted">
              {unidadeEhReuniao ? "Reuniões entregues por mês (capacidade máxima)" : "Capacidade por mês"}
              <InfoTooltip
                texto={
                  unidadeEhReuniao
                    ? "Quantas reuniões UMA unidade deste modelo entrega por mês trabalhando no máximo — a SDR CLT da operação real entregava 6. É por este número que o app calcula quantas pessoas/pacotes o volume exige. Junto do teto de ligações, ele também define a eficiência: 6 reuniões em 2.000 ligações = 0,3% de qualificação, e é isso que separa um SDR humano de um bot."
                    : "Quanto de demanda 1 unidade deste modelo cobre por mês — horas (Suporte) ou pessoas supervisionadas (Coordenador), dependendo do cargo."
                }
              />
            </label>
            <input
              name="capacidade_unidade_mes"
              type="number"
              step="0.01"
              min="0"
              defaultValue={p.capacidade_unidade_mes}
              placeholder={unidadeEhReuniao ? "Ex: 6" : "Ex: 160"}
              className="input"
              required
            />
          </div>
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
            <option value="empresa_ia_atendimento">Empresa — IA de atendimento (SDR via WhatsApp)</option>
          </select>
        </div>

        {(tipo === "clt" || tipo === "pj") && (
          <div className="rounded-lg bg-bg p-3">
            <p className="mb-2 flex items-center text-[10.5px] font-medium text-text-muted">
              Remuneração variável
              <InfoTooltip texto="O que se paga além (ou no lugar) do fixo. A SDR CLT da operação real ganhava 1.600 fixo + 100 por reunião agendada + 0,10 por ligação. A PJ não tinha fixo e cobrava o dobro nos dois — em troca, se empenhava mais, o que aparece na taxa de qualificação melhor lá em cima. Deixe 0 no que não se aplica." />
            </p>
            <div className="form-linha">
              <div className="form-campo">
                <label>Por reunião agendada (R$)</label>
                <input name="valor_por_reuniao" type="number" step="0.01" defaultValue={p.valor_por_reuniao ?? 0} className="input campo-dinheiro" />
              </div>
              <div className="form-campo">
                <label>Por ligação / contato (R$)</label>
                <input name="valor_por_ligacao" type="number" step="0.01" defaultValue={p.valor_por_ligacao ?? 0} className="input campo-dinheiro" />
              </div>
              <div className="form-campo">
                <label>
                  Teto de ligações/mês
                  <InfoTooltip texto="Produtividade combinada com o prestador. Com PJ dá pra contratar um volume menor e pagar menos — o custo para de subir aqui, mesmo que a meta peça mais ligações. 0 = sem teto." />
                </label>
                <input name="ligacoes_maximas_mes" type="number" step="1" defaultValue={p.ligacoes_maximas_mes ?? 0} placeholder="0 = sem teto" className="input campo-num" />
              </div>
              <div className="form-campo">
                <label>Por venda fechada (R$)</label>
                <input name="valor_por_venda" type="number" step="0.01" defaultValue={p.valor_por_venda ?? 0} className="input campo-dinheiro" />
              </div>
              <div className="form-campo">
                <label>
                  Comissão sobre a venda (%)
                  <InfoTooltip texto="Percentual sobre a receita do primeiro mês de cada contrato fechado. Use isto ou o valor fixo por venda, não os dois." />
                </label>
                <input
                  name="comissao_por_venda_pct"
                  type="number"
                  step="0.01"
                  defaultValue={p.comissao_por_venda_pct != null ? (p.comissao_por_venda_pct * 100).toFixed(2) : undefined}
                  placeholder="0"
                  className="input campo-pct"
                />
              </div>
            </div>
          </div>
        )}

        {tipo === "clt" && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-bg p-3">
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
            {tipo === "empresa_fixo_escopo" && (
              <div>
                <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                  Reuniões por pacote / mês
                  <InfoTooltip texto="Volume coberto por 1 pacote. Pacotes só são vendidos inteiros: se você precisa de 100 reuniões e o pacote entrega 200, paga o pacote cheio — leva 100 pelo preço de 200." />
                </label>
                <input name="capacidade_pacote" type="number" step="0.01" defaultValue={p.capacidade_unidade_mes} className="input" required />
              </div>
            )}
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Valor mensal (R$, capacidade cheia)</label>
              <input name="valor_mensal" type="number" step="0.01" defaultValue={p.valor_mensal} className="input" required />
            </div>
            {tipo === "pj" && (
              <label className="col-span-2 flex items-center gap-2 text-[11px] text-text-muted">
                <input type="checkbox" name="fixo_por_pessoa_inteira" defaultChecked={p.fixo_por_pessoa_inteira === true} />
                Fixo mensal por pessoa inteira
                <InfoTooltip texto="Marque quando o PJ tem um fixo de contrato (ex: vendedor R$ 4.500/mês): cada pessoa necessária paga o fixo cheio. Desmarcado, o PJ é proporcional às horas/volume usados — como um suporte por hora ou uma SDR que só cobra por reunião." />
              </label>
            )}
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

        {tipo === "empresa_ia_atendimento" && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-bg p-3">
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Leads/mês no pacote
                <InfoTooltip texto="Teto de LEADS incluído no plano contratado (ex: 1.000 no plano Starter) — não confundir com as reuniões entregues, que ficam no campo lá em cima. Deixe 0 se for mensalidade única sem limite de volume." />
              </label>
              <input name="leads_maximos_pacote" type="number" step="1" defaultValue={p.leads_maximos_pacote ?? 0} placeholder="0 = sem limite" className="input" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-muted">Mensalidade do pacote (R$)</label>
              <input name="valor_mensal" type="number" step="0.01" defaultValue={p.valor_mensal} className="input" required />
            </div>
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Disparos/mês na capacidade máxima
                <InfoTooltip texto="Quantos leads o bot dispara por mês trabalhando no máximo. Junto das reuniões entregues (campo do topo), define a eficiência dele: 6 reuniões em 5.000 disparos = 0,12%. É o que faz um bot barato por disparo sair caro por reunião." />
              </label>
              <input name="ligacoes_maximas_mes" type="number" step="1" defaultValue={p.ligacoes_maximas_mes ?? 0} className="input" />
            </div>
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Valor por lead trabalhado (R$)
                <InfoTooltip texto="Taxa de uso cobrada por lead que o bot atende, além da mensalidade (ex: R$0,40 por lead no plano Starter da SDRaaS). 0 se não houver." />
              </label>
              <input name="valor_por_lead_trabalhado" type="number" step="0.01" defaultValue={p.valor_por_lead_trabalhado ?? 0} className="input" />
            </div>
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Valor por lead qualificado (R$)
                <InfoTooltip texto="Taxa cobrada só pelos leads que o bot classifica como qualificados/quentes (ex: R$25 por lead qualificado). 0 se não houver." />
              </label>
              <input name="valor_por_lead_qualificado" type="number" step="0.01" defaultValue={p.valor_por_lead_qualificado ?? 0} className="input" />
            </div>
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Taxa de qualificação estimada (%)
                <InfoTooltip texto="De cada 100 leads trabalhados pelo bot, quantos % você espera que virem 'qualificados' — usado só pra estimar o custo por lead qualificado acima." />
              </label>
              <input name="taxa_qualificacao_estimada" type="number" step="0.01" defaultValue={p.taxa_qualificacao_estimada != null ? (p.taxa_qualificacao_estimada * 100).toFixed(2) : undefined} placeholder="Ex: 2" className="input" />
            </div>
            <div className="col-span-2 border-t border-border-soft pt-3">
              <p className="mb-2 text-[10.5px] font-medium text-text-muted">
                Repasse da API oficial do WhatsApp (Meta) — cobrado à parte da mensalidade, direto pela Meta
              </p>
            </div>
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Valor por sessão Meta (R$)
                <InfoTooltip texto="Custo médio por sessão de conversa de 24h cobrada pela Meta (varia se quem inicia é o cliente ou a empresa — use uma média). 0 se a ferramenta já incluir isso na mensalidade." />
              </label>
              <input name="valor_sessao_meta" type="number" step="0.01" defaultValue={p.valor_sessao_meta ?? 0} className="input" />
            </div>
            <div>
              <label className="mb-1 flex items-center text-[10.5px] text-text-muted">
                Sessões Meta por lead
                <InfoTooltip texto="Quantas sessões de 24h em média um lead gera até virar cliente ou esfriar." />
              </label>
              <input name="sessoes_meta_por_lead" type="number" step="0.1" defaultValue={p.sessoes_meta_por_lead ?? 0} className="input" />
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
