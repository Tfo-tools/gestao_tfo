"use client";

import { useActionState, useRef, useState } from "react";
import { criarAtivo, type AtivoFormState } from "./actions";
import { DetalhePagamento } from "../custos/detalhe-pagamento";
import type { MeioPagamento } from "../custos/meios-pagamento-actions";

type PlanoContas = { id: string; codigo: string; conta: string };
type Produto = { id: string; nome: string };
type Pessoa = { id: string; nome: string; cartao_dia_vencimento?: number | null; cartao_dias_fechamento_antes?: number | null };

const initialState: AtivoFormState = { error: null };

export function AtivoForm({
  planoContas,
  produtos,
  pagadores,
  pessoas,
  meiosPagamento,
  usuarioAtual,
}: {
  planoContas: PlanoContas[];
  produtos: Produto[];
  pagadores: string[];
  pessoas: Pessoa[];
  meiosPagamento: MeioPagamento[];
  usuarioAtual?: string | null;
}) {
  const [state, formAction, pending] = useActionState(criarAtivo, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const pagadorPadrao = usuarioAtual && pagadores.includes(usuarioAtual) ? usuarioAtual : "";
  const [pagador, setPagador] = useState(pagadorPadrao);
  const [dataAquisicao, setDataAquisicao] = useState(() => new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState("");
  const [pagamentoKey, setPagamentoKey] = useState(0);
  const nomesSocias = pessoas.map((p) => p.nome);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 font-heading text-[14.5px] font-semibold">Novo ativo</h2>
      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
          setPagador(pagadorPadrao);
          setDataAquisicao(new Date().toISOString().slice(0, 10));
          setValor("");
          setPagamentoKey((k) => k + 1);
        }}
        className="flex flex-col gap-3.5"
      >
        <Field label="Descrição">
          <input name="descricao" type="text" required className="input" placeholder="Ex: Notebook Dell, licença anual do Figma" />
        </Field>

        <Field label="Conta do plano de contas">
          <select name="plano_contas_id" required className="input">
            <option value="">Selecione…</option>
            {planoContas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.conta}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Produto (opcional — vazio = geral da empresa)">
          <select name="produto_id" className="input">
            <option value="">Geral</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor">
            <input
              name="valor"
              type="number"
              step="0.01"
              min="0"
              required
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="input"
              placeholder="0,00"
            />
          </Field>
          <Field label="Data de aquisição">
            <input
              name="data_aquisicao"
              type="date"
              required
              value={dataAquisicao}
              onChange={(e) => setDataAquisicao(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pagador">
            <select name="pagador" value={pagador} onChange={(e) => setPagador(e.target.value)} className="input">
              <option value="">Quem pagou?</option>
              {pagadores.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="Empresa">Empresa (conta/cartão PJ)</option>
            </select>
          </Field>
          <Field label="Forma de pagamento">
            <DetalhePagamento
              key={pagamentoKey}
              name="pagamento_detalhe"
              valorTotal={Number(valor) || 0}
              meios={meiosPagamento}
              pessoas={pessoas}
              pagador={pagador}
              nomesSocias={nomesSocias}
              dataReferencia={dataAquisicao}
            />
          </Field>
        </div>

        <Field label="Vida útil em meses (opcional)">
          <input name="vida_util_meses" type="number" min="1" className="input" placeholder="Ex: 60" />
        </Field>

        <Field label="Observações (opcional)">
          <input name="observacoes" type="text" className="input" />
        </Field>

        {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>}
        {state.success && <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">Ativo registrado.</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Registrar ativo"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  );
}
