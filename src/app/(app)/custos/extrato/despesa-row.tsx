"use client";

import { useActionState, useState } from "react";
import { atualizarDespesa, excluirDespesa, type DespesaFormState } from "../actions";
import { AnexoButton } from "./anexo-button";

type PlanoContas = { id: string; codigo: string; conta: string };
type Produto = { id: string; nome: string };
type Anexo = { caminho_arquivo: string; nome_arquivo: string; tipo?: string };

export type DespesaRowData = {
  id: string;
  data_gasto: string;
  valor_total: number;
  comprovado: boolean;
  descricao: string | null;
  pagador: string | null;
  plano_contas_id: string | null;
  plano_contas: { codigo: string; conta: string } | null;
  despesa_produtos: { produtos: { id: string; nome: string } | null }[];
  anexos_despesa: Anexo[];
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

const initialState: DespesaFormState = { error: null };

export function DespesaRow({
  despesa,
  planoContas,
  produtos,
  pagadores,
  fechado,
}: {
  despesa: DespesaRowData;
  planoContas: PlanoContas[];
  produtos: Produto[];
  pagadores: string[];
  fechado: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(atualizarDespesa, initialState);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  if (state.success && editando) setEditando(false);

  const produtosVinculados = despesa.despesa_produtos.map((dp) => dp.produtos).filter((p): p is { id: string; nome: string } => !!p);
  const produtoIdsVinculados = new Set(produtosVinculados.map((p) => p.id));

  if (editando) {
    return (
      <tr className="border-t border-border-soft bg-primary-soft/20">
        <td colSpan={8} className="px-2 py-3">
          <form action={formAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={despesa.id} />
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Data</label>
              <input name="data_gasto" type="date" defaultValue={despesa.data_gasto} required className="input w-[135px]" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Categoria</label>
              <select name="plano_contas_id" defaultValue={despesa.plano_contas_id ?? ""} required className="input w-[220px]">
                {planoContas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} — {c.conta}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Produto(s)</label>
              <div className="flex flex-wrap gap-1.5">
                {produtos.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] has-[:checked]:border-primary-fill has-[:checked]:bg-primary-soft has-[:checked]:text-primary-deep"
                  >
                    <input
                      type="checkbox"
                      name="produtos"
                      value={p.id}
                      defaultChecked={produtoIdsVinculados.has(p.id)}
                      className="h-3 w-3 rounded border-border"
                    />
                    {p.nome}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Pagador</label>
              <select name="pagador" defaultValue={despesa.pagador ?? ""} className="input w-[140px]">
                <option value="">—</option>
                {pagadores.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="Empresa">Empresa</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Valor</label>
              <input name="valor_total" type="number" step="0.01" min="0" defaultValue={despesa.valor_total} required className="input w-[110px]" />
            </div>
            <div className="min-w-[140px] flex-1">
              <label className="mb-1 block text-[10.5px] text-text-faint">Descrição</label>
              <input name="descricao" type="text" defaultValue={despesa.descricao ?? ""} className="input w-full" />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-[11px]">
              <input name="comprovado" type="checkbox" defaultChecked={despesa.comprovado} className="h-3.5 w-3.5 rounded border-border" />
              Comprovado
            </label>
            <div className="w-full">
              <div className="mb-1 flex flex-wrap gap-3 text-[11px] text-text-faint">
                {despesa.anexos_despesa.map((a, i) => (
                  <span key={i}>
                    <AnexoButton path={a.caminho_arquivo} tipo={a.tipo} />
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                {!temAnexoTipo(despesa.anexos_despesa, "fatura") && (
                  <div>
                    <label className="mb-1 block text-[10.5px] text-text-faint">+ Anexar fatura/NF</label>
                    <input name="fatura" type="file" accept="image/*,application/pdf" className="w-[190px] text-[11px]" />
                  </div>
                )}
                {!temAnexoTipo(despesa.anexos_despesa, "comprovante_pagamento") && (
                  <div>
                    <label className="mb-1 block text-[10.5px] text-text-faint">+ Anexar comprovante de pagamento</label>
                    <input name="comprovante_pagamento" type="file" accept="image/*,application/pdf" className="w-[190px] text-[11px]" />
                  </div>
                )}
              </div>
            </div>
            <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60">
              {pending ? "…" : "Salvar"}
            </button>
            <button type="button" onClick={() => setEditando(false)} className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
              Cancelar
            </button>
            {state.error && <p className="w-full text-[11px] text-danger">{state.error}</p>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border-soft">
      <td className="px-2 py-2.5 font-mono">{formatDate(despesa.data_gasto)}</td>
      <td className="px-2 py-2.5">{despesa.plano_contas ? `${despesa.plano_contas.codigo} — ${despesa.plano_contas.conta}` : "—"}</td>
      <td className="px-2 py-2.5 text-text-muted">{produtosVinculados.length > 0 ? produtosVinculados.map((p) => p.nome).join(", ") : "—"}</td>
      <td className="px-2 py-2.5 text-text-muted">{despesa.pagador ?? "—"}</td>
      <td className="px-2 py-2.5 text-text-muted">{despesa.descricao ?? "—"}</td>
      <td className="px-2 py-2.5 text-right font-mono">{formatBRL(Number(despesa.valor_total))}</td>
      <td className="px-2 py-2.5 text-center">
        <span
          className={`rounded px-2 py-0.5 text-[10.5px] font-semibold ${
            despesa.comprovado ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          {despesa.comprovado ? "Comprovado" : "Pendente"}
        </span>
      </td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2.5">
          {despesa.anexos_despesa.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {despesa.anexos_despesa.map((a, i) => (
                <AnexoButton key={i} path={a.caminho_arquivo} tipo={a.tipo} />
              ))}
            </div>
          ) : (
            <span className="text-text-faint">—</span>
          )}
          {fechado ? (
            <span className="text-[11px] text-text-faint" title="Mês fechado">
              🔒
            </span>
          ) : (
            <>
              <button type="button" onClick={() => setEditando(true)} className="text-[11.5px] font-medium text-primary-deep hover:text-wine">
                Editar
              </button>
              <button
                type="button"
                disabled={excluindo}
                onClick={async () => {
                  if (!confirm("Excluir esse lançamento?")) return;
                  setExcluindo(true);
                  setErroExclusao(null);
                  const result = await excluirDespesa(despesa.id);
                  if (result.error) {
                    setErroExclusao(result.error);
                    setExcluindo(false);
                  }
                }}
                className="text-[11.5px] font-medium text-danger disabled:opacity-50"
              >
                {excluindo ? "…" : "Excluir"}
              </button>
            </>
          )}
        </div>
        {erroExclusao && <p className="mt-1 text-[10.5px] text-danger">{erroExclusao}</p>}
      </td>
    </tr>
  );
}

function temAnexoTipo(anexos: Anexo[], tipo: string) {
  return anexos.some((a) => a.tipo === tipo);
}
