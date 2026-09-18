"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { criarNivelModulo, excluirModulo, type ActionState } from "../actions";
import { InfoTooltip } from "@/components/info-tooltip";
import { BetaModuloSection, type BetaModulo } from "./modulos-produto";

type Nivel = {
  id: string;
  nome: string;
  preco: number;
  ordem: number | null;
  tipo_cobranca: string | null;
  data_disponibilidade: string | null;
  quantidade_usuarios_inclusos: number | null;
  preco_usuario_adicional: number | null;
  media_usuarios_por_cliente: number | null;
  percentual_permanencia_estimado: number | null;
  adesao_inicial_pct: number;
  crescimento_adesao_mensal_pct: number;
  desconto_cliente_existente_pct: number | null;
  desconto_cliente_existente_meses: number | null;
  reajuste_pct: number | null;
  reajuste_apos_meses: number | null;
  betaTesters: BetaModulo[];
};

const initialState: ActionState = { error: null };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDataCurta(iso: string | null) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";
}
const LABEL_COBRANCA: Record<string, string> = {
  anual: "compromisso de 12 meses",
  mensal: "sem fidelidade",
};

/** Total pago no ciclo de compromisso — `preco` é sempre o valor MENSAL. */
function totalDoCompromisso(
  preco: number,
  tipoCobranca: string | null,
): string | null {
  if (tipoCobranca !== "anual") return null;
  return `= ${formatBRL(preco * 12)} em 12 parcelas`;
}

export function NiveisModulo({
  produtoId,
  cenarioId,
  niveis,
}: {
  produtoId: string;
  cenarioId: string;
  niveis: Nivel[];
}) {
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [isPending, startTransition] = useTransition();

  const niveisOrdenados = [...niveis].sort(
    (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0),
  );
  const proximoOrdem = (niveisOrdenados.at(-1)?.ordem ?? 0) + 1;
  const primeiroNivel = proximoOrdem === 1;

  return (
    <div className="p-5">
      <div className="mb-1 flex items-center justify-end">
        {niveisOrdenados.length > 0 && (
          <button
            type="button"
            onClick={() => setDrawerAberto(true)}
            className="rounded-lg bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white"
          >
            + Módulo
          </button>
        )}
      </div>
      <p className="mb-4 text-[11px] text-text-muted">
        Nível 1 é o plano base do produto — os próximos níveis são os
        módulos/combos que vão sendo lançados ao longo do tempo.
      </p>

      <div className="flex flex-col gap-3">
        {niveisOrdenados.length === 0 && (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border-soft px-4 py-5">
            <p className="text-[12px] text-text-faint">
              Nenhum nível cadastrado ainda — comece pelo plano base (nível 1).
            </p>
            <button
              type="button"
              onClick={() => setDrawerAberto(true)}
              className="rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white"
            >
              + Criar plano base
            </button>
          </div>
        )}

        {niveisOrdenados.map((n) => (
          <div
            key={n.id}
            className="rounded-lg border border-border-soft px-4 py-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary-fill px-1.5 py-0.5 text-[10px] font-semibold text-primary-deep">
                    NÍVEL {n.ordem}
                  </span>
                  <span className="text-[13px] font-semibold">{n.nome}</span>
                </div>
                <div className="mt-1 text-[10.5px] text-text-faint">
                  lança em {formatDataCurta(n.data_disponibilidade)}
                  {n.tipo_cobranca
                    ? ` · ${LABEL_COBRANCA[n.tipo_cobranca] ?? n.tipo_cobranca}`
                    : ""}
                  {n.quantidade_usuarios_inclusos != null
                    ? ` · ${n.quantidade_usuarios_inclusos} usuário(s) inclusos`
                    : ""}
                  {n.preco_usuario_adicional != null
                    ? ` · +${formatBRL(Number(n.preco_usuario_adicional))}/usuário adicional`
                    : ""}
                </div>
                <div className="mt-0.5 text-[10.5px] text-text-faint">
                  adesão inicial {(n.adesao_inicial_pct * 100).toFixed(1)}% · +
                  {(n.crescimento_adesao_mensal_pct * 100).toFixed(1)}%/mês
                  {n.percentual_permanencia_estimado != null
                    ? ` · estabiliza em ${(n.percentual_permanencia_estimado * 100).toFixed(1)}% dos clientes`
                    : ""}
                  {n.reajuste_pct != null && n.reajuste_apos_meses != null
                    ? ` · +${(n.reajuste_pct * 100).toFixed(2)}% após ${n.reajuste_apos_meses}m (${formatBRL(Number(n.preco) * (1 + n.reajuste_pct))})`
                    : ""}
                  {n.media_usuarios_por_cliente != null
                    ? ` · média de ${n.media_usuarios_por_cliente} usuários/cliente`
                    : ""}
                  {n.desconto_cliente_existente_pct != null &&
                    ` · cliente já existente: ${(n.desconto_cliente_existente_pct * 100).toFixed(1)}% off${
                      n.desconto_cliente_existente_meses != null
                        ? ` por ${n.desconto_cliente_existente_meses}m`
                        : " (permanente)"
                    }`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-right">
                  <span className="block font-mono text-[13px] font-semibold">
                    {formatBRL(Number(n.preco))}/mês
                  </span>
                  {totalDoCompromisso(Number(n.preco), n.tipo_cobranca) && (
                    <span className="block text-[9.5px] text-text-faint">
                      {totalDoCompromisso(Number(n.preco), n.tipo_cobranca)}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(() => excluirModulo(n.id, produtoId))
                  }
                  className="text-[11px] text-danger"
                >
                  Remover
                </button>
              </div>
            </div>
            <BetaModuloSection
              produtoId={produtoId}
              moduloId={n.id}
              itens={n.betaTesters}
            />
          </div>
        ))}
      </div>

      {drawerAberto && (
        <DrawerNivel
          produtoId={produtoId}
          cenarioId={cenarioId}
          ordem={proximoOrdem}
          primeiroNivel={primeiroNivel}
          onClose={() => setDrawerAberto(false)}
        />
      )}
    </div>
  );
}

function DrawerNivel({
  produtoId,
  cenarioId,
  ordem,
  primeiroNivel,
  onClose,
}: {
  produtoId: string;
  cenarioId: string;
  ordem: number;
  primeiroNivel: boolean;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    criarNivelModulo,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const foiSalvo = useRef(false);

  if (pending) foiSalvo.current = true;
  if (foiSalvo.current && !pending && state.error === null && state.success) {
    foiSalvo.current = false;
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 z-50 flex h-full w-full max-w-[420px] flex-col overflow-y-auto bg-surface shadow-xl md:w-1/3">
        <div className="flex items-center justify-between border-b border-border-soft px-5 py-4">
          <h3 className="font-heading text-[14px] font-semibold">
            {primeiroNivel
              ? "Novo plano base (Nível 1)"
              : `Novo módulo (Nível ${ordem})`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-text-muted"
          >
            ✕
          </button>
        </div>

        <form
          ref={formRef}
          action={formAction}
          className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4"
        >
          <input type="hidden" name="produto_id" value={produtoId} />
          <input type="hidden" name="cenario_id" value={cenarioId} />

          <div>
            <label className="mb-1 block text-[10.5px] font-medium text-text-muted">
              Nome do plano
            </label>
            <input
              name="nome"
              placeholder="Ex: Basic, Starter, Premium"
              className="input"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-[10.5px] font-medium text-text-muted">
                Data de lançamento
              </label>
              <input
                name="data_disponibilidade"
                type="date"
                className="input"
                required
              />
            </div>
            {primeiroNivel ? (
              <div>
                <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
                  Cobrança
                  <InfoTooltip texto="Define só o tempo mínimo de permanência do cliente — não muda o valor que você digita no preço, que é sempre mensal. 'Anual' = cliente se compromete por 12 meses, pagos em 12 parcelas mensais. 'Mensal' = sem fidelidade, pode cancelar quando quiser." />
                </label>
                <select
                  name="tipo_cobranca"
                  className="input"
                  defaultValue=""
                  required
                >
                  <option value="" disabled>
                    Selecione…
                  </option>
                  <option value="anual">Anual (compromisso 12 meses)</option>
                  <option value="mensal">Mensal (sem fidelidade)</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-[10.5px] font-medium text-text-muted">
                  Usuários inclusos
                </label>
                <input
                  name="quantidade_usuarios_inclusos"
                  type="number"
                  step="1"
                  min="0"
                  className="input"
                />
              </div>
            )}
          </div>

          {primeiroNivel && (
            <div>
              <label className="mb-1 block text-[10.5px] font-medium text-text-muted">
                Quantidade de usuários no plano
              </label>
              <input
                name="quantidade_usuarios_inclusos"
                type="number"
                step="1"
                min="0"
                className="input"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
                Preço base (R$/mês)
                <InfoTooltip texto="Digite sempre o valor MENSAL do nível, mesmo se a cobrança for anual — a cobrança só define o tempo de compromisso, não este número." />
              </label>
              <input
                name="preco"
                type="number"
                step="0.01"
                placeholder="Ex: 489"
                className="input"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] font-medium text-text-muted">
                Preço usuário adicional (R$)
              </label>
              <input
                name="preco_usuario_adicional"
                type="number"
                step="0.01"
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
                Média de usuários/cliente
                <InfoTooltip texto="Quantos usuários, em média, cada cliente ativa nesse plano — usado pra estimar receita de usuário adicional." />
              </label>
              <input
                name="media_usuarios_por_cliente"
                type="number"
                step="0.01"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
                % que permanece
                <InfoTooltip texto="Percentual estimado de clientes que permanecem nesse nível quando todos os módulos já tiverem sido lançados há pelo menos 1 ano — é o teto da curva de adesão." />
              </label>
              <input
                name="percentual_permanencia_estimado"
                type="number"
                step="0.01"
                placeholder="Ex: 100"
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
                Adesão inicial (%)
                <InfoTooltip texto="No mês em que o nível entra, qual % da base já paga por ele." />
              </label>
              <input
                name="adesao_inicial_pct"
                type="number"
                step="0.01"
                defaultValue={100}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
                Crescimento mensal (%)
                <InfoTooltip texto="A cada mês, quanto a adesão cresce sobre o % atual, até estabilizar no teto de permanência." />
              </label>
              <input
                name="crescimento_adesao_mensal_pct"
                type="number"
                step="0.01"
                defaultValue={0}
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
                Desconto cliente já existente (%)
                <InfoTooltip texto="Opcional. Quem já era cliente do produto (mas não foi beta desse nível) paga com esse desconto quando o nível lança." />
              </label>
              <input
                name="desconto_cliente_existente_pct"
                type="number"
                step="0.01"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] font-medium text-text-muted">
                Duração do desconto (meses)
              </label>
              <input
                name="desconto_cliente_existente_meses"
                type="number"
                placeholder="Em branco = permanente"
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 flex items-center text-[10.5px] font-medium text-text-muted">
                Reajuste de preço (%)
                <InfoTooltip texto="Opcional. Aumento único aplicado ao preço deste nível depois de N meses do lançamento dele. Ex: 8,17% após 6 meses leva R$ 489 a R$ 529." />
              </label>
              <input
                name="reajuste_pct"
                type="number"
                step="0.01"
                placeholder="Ex: 8,17"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] font-medium text-text-muted">
                Reajuste após (meses)
              </label>
              <input
                name="reajuste_apos_meses"
                type="number"
                placeholder="Ex: 6"
                className="input"
              />
            </div>
          </div>

          <p className="mt-1 flex items-center text-[10.5px] text-text-faint">
            Beta testers deste nível são sempre empresas, nunca pessoas —
            cadastre depois de salvar, no card do nível.
          </p>

          {state.error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-[11px] text-danger">
              {state.error}
            </p>
          )}

          <div className="mt-auto flex gap-2 border-t border-border-soft pt-4">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Salvando…" : "Salvar nível"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-[12.5px] text-text-muted"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
