"use client";

import { useActionState, useRef, useState } from "react";
import { criarLancamento, lerNotaDespesa, type DespesaFormState } from "./actions";
import { BuscaConta } from "./busca-conta";
import { PasteableFileInput } from "./pasteable-file-input";
import { DetalhePagamento, EfetivacaoPagamento, type ItemPagamento } from "./detalhe-pagamento";
import type { MeioPagamento } from "./meios-pagamento-actions";

type PlanoContas = { id: string; codigo: string; conta: string; tipo: string };
type Pessoa = { id: string; nome: string; cartao_dia_vencimento?: number | null; cartao_dias_fechamento_antes?: number | null };

const initialState: DespesaFormState = { error: null };

export function DespesaForm({
  planoContas,
  pagadores,
  usoPorConta,
  usuarioAtual,
  meiosPagamento,
  pessoas,
  programas = [],
}: {
  /** Programas de fomento/investimento que uma despesa pode comprovar. */
  programas?: { id: string; nome: string }[];
  planoContas: PlanoContas[];
  pagadores: string[];
  usoPorConta: Record<string, number>;
  usuarioAtual?: string | null;
  meiosPagamento: MeioPagamento[];
  pessoas: Pessoa[];
}) {
  const [state, formAction, pending] = useActionState(criarLancamento, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [recorrente, setRecorrente] = useState(false);
  const [ultimoFoiRecorrente, setUltimoFoiRecorrente] = useState(false);
  const [valorPago, setValorPago] = useState("");
  const [valorFatura, setValorFatura] = useState("");
  const [buscaKey, setBuscaKey] = useState(0);
  const [pagamentoKey, setPagamentoKey] = useState(0);
  const [itensPagamento, setItensPagamento] = useState<ItemPagamento[]>([]);
  const [comprovado, setComprovado] = useState(false);
  const [dataGasto, setDataGasto] = useState(() => new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");
  // Leitura de nota com IA (preenche data/valor/descrição e sugere a conta).
  const [lendoNota, setLendoNota] = useState(false);
  const [notaErro, setNotaErro] = useState<string | null>(null);
  const [sugestaoConta, setSugestaoConta] = useState<string | null>(null);
  async function lerNota(file: File) {
    setNotaErro(null);
    setLendoNota(true);
    const fd = new FormData();
    fd.append("arquivo", file);
    const r = await lerNotaDespesa(fd);
    setLendoNota(false);
    if (r.error || !r.nota) { setNotaErro(r.error ?? "Não consegui ler a nota."); return; }
    const n = r.nota;
    if (n.data) setDataGasto(n.data);
    if (n.valor != null) setValorPago(String(n.valor));
    const desc = n.descricao || n.fornecedor;
    if (desc) setDescricao(desc);
    setSugestaoConta(n.conta_codigo && n.conta_nome ? `${n.conta_codigo} — ${n.conta_nome}` : null);
  }
  // Programa que a despesa comprova. Preenchido sozinho quando o pagamento sai da conta específica
  // do programa; depois que a pessoa mexe no campo, a escolha dela prevalece.
  const [programaId, setProgramaId] = useState("");
  const [programaTocado, setProgramaTocado] = useState(false);
  const aoMudarPagamento = (itens: ItemPagamento[]) => {
    setItensPagamento(itens);
    if (programaTocado) return;
    const daConta = itens.map((i) => meiosPagamento.find((m) => m.id === i.meio_pagamento_id)?.programa_id).find(Boolean);
    if (daConta) setProgramaId(daConta);
  };

  const pagadorPadrao = usuarioAtual && pagadores.includes(usuarioAtual) ? usuarioAtual : "";
  const [pagador, setPagador] = useState(pagadorPadrao);
  const nomesSocias = pessoas.map((p) => p.nome);
  const juros = valorPago && valorFatura ? Number(valorPago) - Number(valorFatura) : 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-3 font-heading text-[14.5px] font-semibold">Novo lançamento</h2>
      <div className="mb-4 rounded-lg border border-border-soft bg-bg p-3">
        <label className="cursor-pointer text-[12.5px] font-medium text-primary-deep">
          {lendoNota ? "Lendo a nota com IA… (pode levar até 1 min)" : "Ler nota/comprovante com IA (preenche os campos)"}
          <input type="file" accept="application/pdf,image/*" className="hidden" disabled={lendoNota}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) lerNota(f); }} />
        </label>
        <p className="mt-0.5 text-[10.5px] text-text-faint">Anexe a NF/recibo: a IA preenche data, valor e descrição e sugere a conta. Você confere antes de salvar.</p>
        {notaErro && <p className="mt-1 text-[11px] text-danger">{notaErro}</p>}
      </div>
      <form
        ref={formRef}
        action={async (formData) => {
          setUltimoFoiRecorrente(recorrente);
          await formAction(formData);
          formRef.current?.reset();
          setRecorrente(false);
          setValorPago("");
          setValorFatura("");
          setComprovado(false);
          setItensPagamento([]);
          setProgramaId("");
          setProgramaTocado(false);
          setPagador(pagadorPadrao);
          setDataGasto(new Date().toISOString().slice(0, 10));
          setDescricao("");
          setSugestaoConta(null);
          setBuscaKey((k) => k + 1);
          setPagamentoKey((k) => k + 1);
        }}
        className="flex flex-col gap-3.5"
      >
        <label className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2.5 text-[12.5px]">
          <input
            name="recorrente"
            type="checkbox"
            checked={recorrente}
            onChange={(e) => setRecorrente(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Isso se repete todo mês?
        </label>

        {recorrente ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Começa em">
              <input name="data_inicio" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="input" />
            </Field>
            <Field label="Dia do vencimento">
              <input name="dia_do_mes" type="number" min="1" max="31" defaultValue={5} required className="input" />
            </Field>
            <Field label="Até quando (opcional)">
              <input name="data_fim" type="date" className="input" />
            </Field>
          </div>
        ) : (
          <Field label="Data do gasto">
            <input
              name="data_gasto"
              type="date"
              required
              value={dataGasto}
              onChange={(e) => setDataGasto(e.target.value)}
              className="input"
            />
          </Field>
        )}
        {recorrente && (
          <p className="-mt-2 text-[10.5px] text-text-faint">
            Se o mês não tiver esse dia (ex: dia 30 em fevereiro), o lançamento cai no dia 1º do mês seguinte.
          </p>
        )}

        <Field label="Do que se trata esse gasto?">
          <BuscaConta key={buscaKey} planoContas={planoContas} usoPorConta={usoPorConta} />
          {sugestaoConta && <p className="mt-1 text-[11px] text-primary-deep">Sugestão da IA: <b>{sugestaoConta}</b> — selecione acima.</p>}
        </Field>

        {/* Vínculo com produto foi removido: agora é uma plataforma só (cérebro / custos & confecção / preço),
            não mais produtos separados. A coluna despesa_produtos continua no banco (histórico preservado). */}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pagador">
            <select
              name="pagador"
              value={pagador}
              onChange={(e) => setPagador(e.target.value)}
              required={!recorrente}
              className="input"
            >
              <option value="">{recorrente ? "Quem costuma pagar? (pode mudar por mês depois)" : "Quem pagou?"}</option>
              {pagadores.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="Empresa">Empresa (conta/cartão PJ)</option>
            </select>
            {pagadorPadrao && <p className="mt-1 text-[10.5px] text-text-faint">Preenchido com seu usuário — troque se foi a Empresa quem pagou.</p>}
          </Field>

          <Field label="Forma de pagamento">
            <DetalhePagamento
              key={pagamentoKey}
              name="pagamento_detalhe"
              valorTotal={Number(valorPago) || 0}
              onChange={aoMudarPagamento}
              meios={meiosPagamento}
              programas={programas}
              pessoas={pessoas}
              pagador={pagador}
              nomesSocias={nomesSocias}
              dataReferencia={recorrente ? null : dataGasto}
            />
          </Field>

          {programas.length > 0 && !recorrente && (
            <Field label="Comprova o programa">
              <select
                name="programa_id"
                value={programaId}
                onChange={(e) => {
                  setProgramaId(e.target.value);
                  setProgramaTocado(true);
                }}
                className="input w-full"
              >
                <option value="">Não — despesa da empresa</option>
                {programas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] text-text-faint">
                Pago com o recurso do programa: entra no “usado” e na prestação de contas dele.
              </p>
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={recorrente ? "Valor mensal (pago)" : "Valor pago"}>
            <input
              name="valor_total"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="0,00"
              value={valorPago}
              onChange={(e) => setValorPago(e.target.value)}
              className="input"
            />
          </Field>

          {!recorrente && (
            <Field label="Valor da fatura, se pagou com atraso (opcional)">
              <input
                name="valor_fatura"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={valorFatura}
                onChange={(e) => setValorFatura(e.target.value)}
                className="input"
              />
            </Field>
          )}
        </div>
        {juros > 0.01 && (
          <p className="-mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] text-danger">
            ⚠ Diferença de R$ {juros.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} entre o valor pago e o da fatura — provavelmente
            juros/multa por atraso.
          </p>
        )}

        <Field label={recorrente ? "Descrição" : "Descrição (opcional)"}>
          <input name="descricao" type="text" required={recorrente} value={descricao} onChange={(e) => setDescricao(e.target.value)} className="input" placeholder="Ex: campanha Meta Ads agosto" />
        </Field>

        {recorrente ? (
          <p className="rounded-lg bg-bg px-3 py-2.5 text-[11.5px] text-text-muted">
            O comprovante de cada mês é anexado depois, em Recorrentes → Pendentes de comprovante — assim que a NF/recibo daquele mês
            sair.
          </p>
        ) : (
          <>
            <PasteableFileInput name="fatura" label="Fatura / Nota Fiscal (opcional)" />

            <PasteableFileInput
              name="comprovante_pagamento"
              label="Comprovante de pagamento (opcional)"
              hint="Boleto costuma precisar dos dois — o boleto em si (fatura) e o comprovante depois de pago. Se ainda não pagou, deixe esse em branco e volte aqui pra anexar depois, editando o lançamento. No celular, dá pra tirar a foto na hora; no computador, cola direto o print do comprovante copiado pelo app do banco."
            />

            <label className="flex items-center gap-2 pt-1 text-[12px]">
              <input
                name="comprovado"
                type="checkbox"
                checked={comprovado}
                onChange={(e) => setComprovado(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Marcar como comprovado (auditado internamente)
            </label>

            {comprovado && (
              <EfetivacaoPagamento
                name="efetivacao_detalhe"
                itens={itensPagamento}
                pagador={pagador}
                nomesSocias={nomesSocias}
                valorPago={Number(valorPago) || 0}
                valorFatura={valorFatura ? Number(valorFatura) : null}
              />
            )}
          </>
        )}

        {state.error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
        )}
        {state.success && (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
            {ultimoFoiRecorrente ? "Recorrência criada — os lançamentos mensais aparecem em Custos → Recorrentes." : "Despesa lançada."}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : recorrente ? "Criar recorrência" : "Lançar despesa"}
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
