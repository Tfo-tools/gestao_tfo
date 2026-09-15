"use client";

import { useActionState, useState, useTransition } from "react";
import { atualizarAtivo, excluirAtivo, type AtivoFormState } from "./actions";
import { DetalhePagamento, type ItemPagamento } from "../custos/detalhe-pagamento";
import type { MeioPagamento } from "../custos/meios-pagamento-actions";

type PlanoContas = { id: string; codigo: string; conta: string };
type Produto = { id: string; nome: string };
type Pessoa = { id: string; nome: string; cartao_dia_vencimento?: number | null; cartao_dias_fechamento_antes?: number | null };

export type AtivoRowData = {
  id: string;
  descricao: string;
  plano_contas_id: string;
  plano_contas: { codigo: string; conta: string } | null;
  produto_id: string | null;
  produto: { nome: string } | null;
  valor: number;
  data_aquisicao: string;
  vida_util_meses: number | null;
  observacoes: string | null;
  pagador: string | null;
  forma_pagamento: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pagamento_detalhe: any;
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

const initialState: AtivoFormState = { error: null };

export function AtivoRow({
  ativo,
  planoContas,
  produtos,
  pagadores,
  pessoas,
  meiosPagamento,
}: {
  ativo: AtivoRowData;
  planoContas: PlanoContas[];
  produtos: Produto[];
  pagadores: string[];
  pessoas: Pessoa[];
  meiosPagamento: MeioPagamento[];
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(atualizarAtivo, initialState);
  const [excluindo, startExcluir] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [pagador, setPagador] = useState(ativo.pagador ?? "");
  const [dataAquisicao, setDataAquisicao] = useState(ativo.data_aquisicao);
  const nomesSocias = pessoas.map((p) => p.nome);
  const itensIniciais: ItemPagamento[] = Array.isArray(ativo.pagamento_detalhe) ? ativo.pagamento_detalhe : [];

  if (state.success && editando) setEditando(false);

  if (editando) {
    return (
      <tr className="border-t border-border-soft bg-primary-soft/20">
        <td colSpan={7} className="px-2 py-3">
          <form action={formAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={ativo.id} />
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-[10.5px] text-text-faint">Descrição</label>
              <input name="descricao" type="text" defaultValue={ativo.descricao} required className="input w-full" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Conta</label>
              <select name="plano_contas_id" defaultValue={ativo.plano_contas_id} required className="input w-[220px]">
                {planoContas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} — {c.conta}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Produto (opcional)</label>
              <select name="produto_id" defaultValue={ativo.produto_id ?? ""} className="input w-[140px]">
                <option value="">Geral</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Valor</label>
              <input name="valor" type="number" step="0.01" min="0" defaultValue={ativo.valor} required className="input w-[110px]" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Data</label>
              <input
                name="data_aquisicao"
                type="date"
                value={dataAquisicao}
                onChange={(e) => setDataAquisicao(e.target.value)}
                required
                className="input w-[135px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Pagador</label>
              <select name="pagador" value={pagador} onChange={(e) => setPagador(e.target.value)} className="input w-[140px]">
                <option value="">—</option>
                {pagadores.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="Empresa">Empresa</option>
              </select>
            </div>
            <div className="w-[220px]">
              <label className="mb-1 block text-[10.5px] text-text-faint">Forma de pagamento</label>
              <DetalhePagamento
                name="pagamento_detalhe"
                valorTotal={Number(ativo.valor)}
                defaultValue={itensIniciais}
                meios={meiosPagamento}
                pessoas={pessoas}
                pagador={pagador}
                nomesSocias={nomesSocias}
                dataReferencia={dataAquisicao}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Vida útil (meses, opcional)</label>
              <input name="vida_util_meses" type="number" min="1" defaultValue={ativo.vida_util_meses ?? ""} className="input w-[110px]" />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-[10.5px] text-text-faint">Observações</label>
              <input name="observacoes" type="text" defaultValue={ativo.observacoes ?? ""} className="input w-full" />
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
      <td className="px-2 py-2.5">
        {ativo.descricao}
        {ativo.observacoes && <div className="text-[10.5px] text-text-faint">{ativo.observacoes}</div>}
      </td>
      <td className="px-2 py-2.5 text-text-muted">{ativo.plano_contas ? `${ativo.plano_contas.codigo} — ${ativo.plano_contas.conta}` : "—"}</td>
      <td className="px-2 py-2.5 text-text-muted">{ativo.produto?.nome ?? "Geral"}</td>
      <td className="px-2 py-2.5 font-mono">{formatDate(ativo.data_aquisicao)}</td>
      <td className="px-2 py-2.5 text-text-muted">
        {ativo.pagador ?? "—"}
        {ativo.forma_pagamento && <div className="text-[10.5px] text-text-faint">{ativo.forma_pagamento}</div>}
      </td>
      <td className="px-2 py-2.5 text-right font-mono">{formatBRL(Number(ativo.valor))}</td>
      <td className="px-2 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2.5">
          <button type="button" onClick={() => setEditando(true)} className="text-[11.5px] font-medium text-primary-deep hover:text-wine">
            Editar
          </button>
          <button
            type="button"
            disabled={excluindo}
            onClick={() =>
              startExcluir(async () => {
                if (!confirm("Excluir esse ativo?")) return;
                setErro(null);
                const result = await excluirAtivo(ativo.id);
                if (result.error) setErro(result.error);
              })
            }
            className="text-[11.5px] font-medium text-danger disabled:opacity-50"
          >
            {excluindo ? "…" : "Excluir"}
          </button>
        </div>
        {erro && <p className="mt-1 text-[10.5px] text-danger">{erro}</p>}
      </td>
    </tr>
  );
}
