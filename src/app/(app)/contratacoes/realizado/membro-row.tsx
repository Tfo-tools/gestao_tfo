"use client";

import { useActionState, useState, useTransition } from "react";
import {
  atualizarMembroEquipe,
  desligarMembroEquipe,
  reativarMembroEquipe,
  excluirMembroEquipe,
  type EquipeFormState,
} from "./actions";
import { AlocacoesEditor, type AlocacaoEdit } from "./alocacoes-editor";
import {
  calcularCustoClt,
  custoMensalPJ,
  distribuirPorAlocacao,
  LABEL_CATEGORIA_ALOCACAO,
  type CategoriaAlocacao,
} from "@/lib/custo-equipe";

type Regime = { id: string; nome: string; aliquota_total_efetiva: number };
type Produto = { id: string; nome: string };

export type MembroEquipeData = {
  id: string;
  nome: string;
  tipo_contratacao: "clt" | "pj";
  data_inicio: string;
  data_fim: string | null;
  ativo: boolean;
  salario_bruto: number | null;
  regime_id: string | null;
  beneficios_mensal: number;
  valor_hora: number | null;
  observacoes: string | null;
  alocacoes: { categoria: CategoriaAlocacao; produto_id: string | null; horas_por_dia: number; produtoNome?: string }[];
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

const initialState: EquipeFormState = { error: null };

export function MembroRow({ membro, regimes, produtos }: { membro: MembroEquipeData; regimes: Regime[]; produtos: Produto[] }) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(atualizarMembroEquipe, initialState);
  const [acao, startAcao] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  if (state.success && editando) setEditando(false);

  const regime = regimes.find((r) => r.id === membro.regime_id);
  const alocacoesEdit: AlocacaoEdit[] = membro.alocacoes.map((a) => ({
    categoria: a.categoria,
    produtoId: a.produto_id,
    horasPorDia: Number(a.horas_por_dia),
  }));

  let custoTotalMensal = 0;
  if (membro.tipo_contratacao === "clt" && membro.salario_bruto && regime) {
    custoTotalMensal = calcularCustoClt(Number(membro.salario_bruto), Number(regime.aliquota_total_efetiva), Number(membro.beneficios_mensal)).custoTotalMensal;
  } else if (membro.tipo_contratacao === "pj" && membro.valor_hora) {
    custoTotalMensal = custoMensalPJ(Number(membro.valor_hora), alocacoesEdit.map((a) => ({ ...a, categoria: a.categoria, produtoId: a.produtoId }))).custoTotalMensal;
  }
  const alocacoesComCusto = distribuirPorAlocacao(custoTotalMensal, alocacoesEdit);

  if (editando) {
    return (
      <div className="rounded-lg border border-primary-fill bg-primary-soft/20 p-4">
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={membro.id} />
          <input type="hidden" name="tipo_contratacao" value={membro.tipo_contratacao} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Nome</label>
              <input name="nome" type="text" defaultValue={membro.nome} required className="input w-full" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Início</label>
              <input name="data_inicio" type="date" defaultValue={membro.data_inicio} required className="input w-full" />
            </div>
          </div>

          {membro.tipo_contratacao === "pj" ? (
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Valor da hora</label>
              <input name="valor_hora" type="number" step="0.01" min="0" defaultValue={membro.valor_hora ?? ""} required className="input w-[160px]" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10.5px] text-text-faint">Salário bruto</label>
                <input name="salario_bruto" type="number" step="0.01" min="0" defaultValue={membro.salario_bruto ?? ""} required className="input w-full" />
              </div>
              <div>
                <label className="mb-1 block text-[10.5px] text-text-faint">Regime</label>
                <select name="regime_id" defaultValue={membro.regime_id ?? ""} required className="input w-full">
                  {regimes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-[10.5px] text-text-faint">Benefícios mensais</label>
                <input name="beneficios_mensal" type="number" step="0.01" min="0" defaultValue={membro.beneficios_mensal} className="input w-[160px]" />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Alocação</label>
            <AlocacoesEditor name="alocacoes" produtos={produtos} defaultValue={alocacoesEdit} />
          </div>

          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Observações</label>
            <input name="observacoes" type="text" defaultValue={membro.observacoes ?? ""} className="input w-full" />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60">
              {pending ? "…" : "Salvar"}
            </button>
            <button type="button" onClick={() => setEditando(false)} className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
              Cancelar
            </button>
          </div>
          {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-border-soft p-4 ${!membro.ativo ? "bg-bg opacity-70" : "bg-surface"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold">{membro.nome}</span>
            <span className="rounded bg-bg px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
              {membro.tipo_contratacao === "clt" ? "CLT" : "PJ"}
            </span>
            {!membro.ativo && <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-semibold text-danger">Desligado</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-text-muted">
            Desde {formatDate(membro.data_inicio)}
            {membro.data_fim && ` até ${formatDate(membro.data_fim)}`}
            {membro.tipo_contratacao === "pj" ? ` · R$ ${Number(membro.valor_hora).toFixed(2)}/h` : regime ? ` · ${regime.nome}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[15px] font-semibold">{formatBRL(custoTotalMensal)}</div>
          <div className="text-[10px] text-text-faint">custo mensal</div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {alocacoesComCusto.map((a, i) => (
          <span key={i} className="rounded-full bg-bg px-2.5 py-1 text-[10.5px] text-text-muted">
            {LABEL_CATEGORIA_ALOCACAO[a.categoria]}
            {a.produtoId && ` — ${produtos.find((p) => p.id === a.produtoId)?.nome ?? ""}`} · {a.horasPorDia}h/dia · {formatBRL(a.custoMes)}
          </span>
        ))}
      </div>

      {membro.tipo_contratacao === "clt" && membro.salario_bruto && regime && (
        <details className="mt-2.5">
          <summary className="cursor-pointer text-[11px] text-primary-deep">Ver composição do custo</summary>
          {(() => {
            const c = calcularCustoClt(Number(membro.salario_bruto), Number(regime.aliquota_total_efetiva), Number(membro.beneficios_mensal));
            return (
              <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-text-muted">
                <span>Salário bruto</span>
                <span className="text-right font-mono">{formatBRL(c.salarioBruto)}</span>
                <span>Provisão 13º</span>
                <span className="text-right font-mono">{formatBRL(c.provisaoDecimoTerceiro)}</span>
                <span>Provisão férias (+1/3)</span>
                <span className="text-right font-mono">{formatBRL(c.provisaoFerias)}</span>
                <span>FGTS</span>
                <span className="text-right font-mono">{formatBRL(c.fgts)}</span>
                <span>Demais encargos ({regime.nome})</span>
                <span className="text-right font-mono">{formatBRL(c.demaisEncargos)}</span>
                {c.beneficios > 0 && (
                  <>
                    <span>Benefícios</span>
                    <span className="text-right font-mono">{formatBRL(c.beneficios)}</span>
                  </>
                )}
              </div>
            );
          })()}
        </details>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => setEditando(true)} className="text-[11.5px] font-medium text-primary-deep">
          Editar
        </button>
        {membro.ativo ? (
          <button
            type="button"
            disabled={acao}
            onClick={() =>
              startAcao(async () => {
                const dataFim = prompt("Data de desligamento (AAAA-MM-DD)?", new Date().toISOString().slice(0, 10));
                if (!dataFim) return;
                setErro(null);
                const result = await desligarMembroEquipe(membro.id, dataFim);
                if (result.error) setErro(result.error);
              })
            }
            className="text-[11.5px] font-medium text-danger"
          >
            Desligar
          </button>
        ) : (
          <button
            type="button"
            disabled={acao}
            onClick={() =>
              startAcao(async () => {
                await reativarMembroEquipe(membro.id);
              })
            }
            className="text-[11.5px] font-medium text-primary-deep"
          >
            Reativar
          </button>
        )}
        <button
          type="button"
          disabled={acao}
          onClick={() =>
            startAcao(async () => {
              if (!confirm("Excluir esse registro de vez?")) return;
              const result = await excluirMembroEquipe(membro.id);
              if (result.error) setErro(result.error);
            })
          }
          className="text-[11.5px] text-text-faint"
        >
          Excluir
        </button>
      </div>
      {erro && <p className="mt-1 text-[10.5px] text-danger">{erro}</p>}
    </div>
  );
}
