"use client";

import { useActionState, useMemo, useState } from "react";
import { alternarRecorrente } from "./actions";
import { atualizarRecorrente, type DespesaFormState } from "../actions";
import { categoriaDeConta, CATEGORIAS_NEGOCIO } from "@/lib/categoria-negocio";

type PlanoContas = { id: string; codigo: string; conta: string; tipo: string };
type Produto = { id: string; nome: string };

export type RecorrenteRowData = {
  id: string;
  descricao: string;
  valor: number;
  pagador: string | null;
  dia_do_mes: number;
  data_inicio: string;
  data_fim: string | null;
  ativo: boolean;
  plano_contas_id: string | null;
  plano_contas: { codigo: string; conta: string } | null;
  produtoIds: string[];
  produtoNomes: string[];
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const initialState: DespesaFormState = { error: null };

export function RecorrenteRow({
  recorrente,
  planoContas,
  produtos,
  pagadores,
}: {
  recorrente: RecorrenteRowData;
  planoContas: PlanoContas[];
  produtos: Produto[];
  pagadores: string[];
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(atualizarRecorrente, initialState);
  const contaAtual = recorrente.plano_contas_id ? planoContas.find((c) => c.id === recorrente.plano_contas_id) : null;
  const [grupo, setGrupo] = useState(contaAtual ? categoriaDeConta(contaAtual) : "");

  const categorias = useMemo(() => {
    const presentes = new Set(planoContas.map((c) => categoriaDeConta(c)));
    return CATEGORIAS_NEGOCIO.filter((c) => presentes.has(c.chave));
  }, [planoContas]);

  const contasDaCategoria = useMemo(() => planoContas.filter((c) => categoriaDeConta(c) === grupo), [planoContas, grupo]);

  if (state.success && editando) setEditando(false);

  if (editando) {
    return (
      <tr className="border-t border-border-soft bg-primary-soft/20">
        <td colSpan={7} className="px-2 py-3">
          <form action={formAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={recorrente.id} />
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Do que se trata</label>
              <select value={grupo} onChange={(e) => setGrupo(e.target.value)} required className="input w-[200px]">
                <option value="">Selecione…</option>
                {categorias.map((c) => (
                  <option key={c.chave} value={c.chave}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Item exatamente</label>
              <select name="plano_contas_id" defaultValue={recorrente.plano_contas_id ?? ""} required disabled={!grupo} className="input w-[220px] disabled:opacity-50">
                <option value="">Selecione…</option>
                {contasDaCategoria.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.conta}
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
                      defaultChecked={recorrente.produtoIds.includes(p.id)}
                      className="h-3 w-3 rounded border-border"
                    />
                    {p.nome}
                  </label>
                ))}
              </div>
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-[10.5px] text-text-faint">Descrição</label>
              <input name="descricao" type="text" defaultValue={recorrente.descricao} required className="input w-full" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Pagador</label>
              <select name="pagador" defaultValue={recorrente.pagador ?? ""} className="input w-[130px]">
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
              <label className="mb-1 block text-[10.5px] text-text-faint">Valor mensal</label>
              <input name="valor" type="number" step="0.01" min="0" defaultValue={recorrente.valor} required className="input w-[110px]" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Dia do vencimento</label>
              <input name="dia_do_mes" type="number" min="1" max="31" defaultValue={recorrente.dia_do_mes} required className="input w-[90px]" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Começa em</label>
              <input name="data_inicio" type="date" defaultValue={recorrente.data_inicio} required className="input w-[150px]" />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Até quando (opcional)</label>
              <input name="data_fim" type="date" defaultValue={recorrente.data_fim ?? ""} className="input w-[150px]" />
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
      <td className="px-2 py-2.5">{recorrente.descricao}</td>
      <td className="px-2 py-2.5 text-text-muted">
        {recorrente.plano_contas ? `${recorrente.plano_contas.codigo} — ${recorrente.plano_contas.conta}` : "—"}
      </td>
      <td className="px-2 py-2.5 text-text-muted">{recorrente.produtoNomes.length > 0 ? recorrente.produtoNomes.join(", ") : "—"}</td>
      <td className="px-2 py-2.5 text-right font-mono">{formatBRL(Number(recorrente.valor))}</td>
      <td className="px-2 py-2.5 text-center font-mono">{recorrente.dia_do_mes}</td>
      <td className="px-2 py-2.5 text-center">
        <span
          className={`rounded px-2 py-0.5 text-[10.5px] font-semibold ${
            recorrente.ativo ? "bg-success-soft text-success" : "bg-bg text-text-faint"
          }`}
        >
          {recorrente.ativo ? "Ativa" : "Pausada"}
        </span>
      </td>
      <td className="px-2 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2.5">
          <button type="button" onClick={() => setEditando(true)} className="text-[11.5px] font-medium text-primary-deep hover:text-wine">
            Editar
          </button>
          <form action={alternarRecorrente.bind(null, recorrente.id, !recorrente.ativo)}>
            <button type="submit" className="text-[11.5px] font-medium text-primary-deep hover:text-wine">
              {recorrente.ativo ? "Pausar" : "Reativar"}
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}
