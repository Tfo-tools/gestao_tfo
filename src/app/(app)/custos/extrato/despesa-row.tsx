"use client";

import { useActionState, useState } from "react";
import { atualizarDespesa, excluirDespesa, type DespesaFormState } from "../actions";
import { AnexoButton } from "./anexo-button";

type PlanoContas = { id: string; codigo: string; conta: string };
type Produto = { id: string; nome: string };
type Anexo = { caminho_arquivo: string; nome_arquivo: string };

export type DespesaRowData = {
  id: string;
  data_gasto: string;
  valor_total: number;
  comprovado: boolean;
  descricao: string | null;
  pagador: string | null;
  plano_contas_id: string | null;
  produto_id: string | null;
  plano_contas: { codigo: string; conta: string } | null;
  produtos: { nome: string } | null;
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
              <label className="mb-1 block text-[10.5px] text-text-faint">Produto</label>
              <select name="produto_id" defaultValue={despesa.produto_id ?? ""} className="input w-[150px]">
                <option value="">Nenhum</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
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
      <td className="px-2 py-2.5 text-text-muted">{despesa.produtos?.nome ?? "—"}</td>
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
          {despesa.anexos_despesa[0] ? (
            <AnexoButton path={despesa.anexos_despesa[0].caminho_arquivo} />
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
