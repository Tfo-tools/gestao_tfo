"use client";

import { useEffect, useRef, useState } from "react";
import { SeletorMeioPagamento } from "./seletor-meio-pagamento";
import type { MeioPagamento } from "./meios-pagamento-actions";

type Pessoa = { id: string; nome: string };

function IconCartao(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <line x1="2.5" y1="10" x2="21.5" y2="10" />
      <line x1="5.5" y1="14.5" x2="9.5" y2="14.5" />
    </svg>
  );
}

export type FormaPagamentoTipo = "cartao_credito_socias" | "cartao_corporativo" | "debito_conta" | "boleto" | "pix";

export type ItemPagamento = {
  forma: FormaPagamentoTipo;
  valor: number;
  banco?: string;
  bandeira?: string;
  titular?: string;
  parcelado?: boolean;
  num_parcelas?: number;
  codigo?: string; // boleto ou pix
  meio_pagamento_id?: string;
};

export const LABEL_FORMA: Record<FormaPagamentoTipo, string> = {
  cartao_credito_socias: "Cartão de crédito (sócias)",
  cartao_corporativo: "Cartão corporativo",
  debito_conta: "Débito em conta",
  boleto: "Boleto",
  pix: "Pix",
};

const FORMAS: FormaPagamentoTipo[] = ["cartao_credito_socias", "cartao_corporativo", "debito_conta", "boleto", "pix"];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function itemVazio(forma: FormaPagamentoTipo, valor: number): ItemPagamento {
  return { forma, valor, parcelado: false };
}

/** Botão que abre um modal pra detalhar a forma de pagamento — substitui o antigo select simples.
 * Guarda o resultado num input hidden (JSON) que viaja junto com o form principal; nada é salvo
 * no banco até o form inteiro ser submetido. */
export function DetalhePagamento({
  name,
  valorTotal,
  defaultValue,
  onChange,
  meios,
  pessoas,
}: {
  name: string;
  valorTotal: number;
  defaultValue?: ItemPagamento[];
  onChange?: (itens: ItemPagamento[]) => void;
  meios: MeioPagamento[];
  pessoas: Pessoa[];
}) {
  const [itens, setItens] = useState<ItemPagamento[]>(defaultValue && defaultValue.length > 0 ? defaultValue : [itemVazio("pix", valorTotal)]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rascunho, setRascunho] = useState<ItemPagamento[]>(itens);

  useEffect(() => {
    onChange?.(itens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens]);

  // Se o valor total do lançamento mudar e só houver 1 forma (não combinada), acompanha o valor.
  useEffect(() => {
    setItens((atual) => (atual.length === 1 ? [{ ...atual[0], valor: valorTotal }] : atual));
  }, [valorTotal]);

  function abrir() {
    setRascunho(itens.map((i) => ({ ...i })));
    dialogRef.current?.showModal();
  }
  function cancelar() {
    dialogRef.current?.close();
  }
  function confirmar() {
    setItens(rascunho);
    dialogRef.current?.close();
  }

  function resumo() {
    if (itens.length === 0) return "+ Detalhar forma de pagamento";
    if (itens.length === 1) return LABEL_FORMA[itens[0].forma];
    return `Combinada — ${itens.map((i) => LABEL_FORMA[i.forma]).join(" + ")}`;
  }

  const somaRascunho = rascunho.reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const diferenca = Math.round((valorTotal - somaRascunho) * 100) / 100;

  function atualizarItem(idx: number, patch: Partial<ItemPagamento>) {
    setRascunho((atual) => atual.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function adicionarForma() {
    const usadas = new Set(rascunho.map((i) => i.forma));
    const proxima = FORMAS.find((f) => !usadas.has(f)) ?? FORMAS[0];
    setRascunho((atual) => [...atual, itemVazio(proxima, Math.max(diferenca, 0))]);
  }

  function removerForma(idx: number) {
    setRascunho((atual) => atual.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(itens)} />
      <button
        type="button"
        onClick={abrir}
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12.5px] text-text-muted transition-colors hover:border-primary-fill hover:text-primary-deep"
      >
        <IconCartao className="h-4 w-4 shrink-0" />
        <span className="truncate">{resumo()}</span>
      </button>

      <dialog
        ref={dialogRef}
        className="w-[560px] max-w-[92vw] rounded-xl border border-border bg-surface p-0 backdrop:bg-black/40"
        onCancel={(e) => {
          e.preventDefault();
          cancelar();
        }}
      >
        <div className="flex max-h-[85vh] flex-col">
          <div className="border-b border-border-soft px-5 py-4">
            <h3 className="font-heading text-[14px] font-semibold">Forma de pagamento</h3>
            <p className="mt-0.5 text-[11.5px] text-text-muted">Valor do lançamento: {formatBRL(valorTotal)}</p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-4">
              {rascunho.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-border-soft bg-bg p-3.5">
                  <div className="mb-2.5 flex items-center gap-2">
                    <select
                      value={item.forma}
                      onChange={(e) => atualizarItem(idx, { forma: e.target.value as FormaPagamentoTipo })}
                      className="input flex-1"
                    >
                      {FORMAS.map((f) => (
                        <option key={f} value={f}>
                          {LABEL_FORMA[f]}
                        </option>
                      ))}
                    </select>
                    {rascunho.length > 1 && (
                      <>
                        <div className="w-[110px]">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.valor}
                            onChange={(e) => atualizarItem(idx, { valor: Number(e.target.value) })}
                            className="input w-full"
                            placeholder="Valor"
                          />
                        </div>
                        <button type="button" onClick={() => removerForma(idx)} className="text-[12px] text-danger">
                          ×
                        </button>
                      </>
                    )}
                  </div>

                  {(item.forma === "cartao_credito_socias" || item.forma === "cartao_corporativo") && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="col-span-2">
                        <SeletorMeioPagamento
                          tipo="cartao"
                          meiosIniciais={meios}
                          pessoas={pessoas}
                          bancoAtual={item.banco}
                          onSelecionar={(d) =>
                            atualizarItem(idx, { banco: d.banco, bandeira: d.bandeira, titular: d.titular, meio_pagamento_id: d.meio_pagamento_id })
                          }
                        />
                      </div>
                      {item.titular && (
                        <p className="col-span-2 -mt-1 text-[11px] text-text-faint">
                          Titular: {item.titular}
                          {item.bandeira ? ` · ${item.bandeira}` : ""}
                        </p>
                      )}
                      <label className="col-span-2 flex items-center gap-2 text-[12px]">
                        <input
                          type="checkbox"
                          checked={!!item.parcelado}
                          onChange={(e) => atualizarItem(idx, { parcelado: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-border"
                        />
                        Parcelado
                      </label>
                      {item.parcelado && (
                        <div className="col-span-2 w-[120px]">
                          <label className="mb-1 block text-[10.5px] text-text-faint">Quantas parcelas</label>
                          <input
                            type="number"
                            min="2"
                            value={item.num_parcelas ?? ""}
                            onChange={(e) => atualizarItem(idx, { num_parcelas: Number(e.target.value) })}
                            className="input w-full"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {item.forma === "boleto" && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <label className="col-span-2 flex items-center gap-2 text-[12px]">
                        <input
                          type="checkbox"
                          checked={!!item.parcelado}
                          onChange={(e) => atualizarItem(idx, { parcelado: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-border"
                        />
                        Parcelado (desmarcado = à vista)
                      </label>
                      {item.parcelado && (
                        <div className="w-[120px]">
                          <label className="mb-1 block text-[10.5px] text-text-faint">Quantas parcelas</label>
                          <input
                            type="number"
                            min="2"
                            value={item.num_parcelas ?? ""}
                            onChange={(e) => atualizarItem(idx, { num_parcelas: Number(e.target.value) })}
                            className="input w-full"
                          />
                        </div>
                      )}
                      <CampoTexto
                        label="Código do boleto (opcional)"
                        value={item.codigo}
                        onChange={(v) => atualizarItem(idx, { codigo: v })}
                        className="col-span-2"
                      />
                    </div>
                  )}

                  {item.forma === "pix" && (
                    <CampoTexto label="Código do Pix (opcional)" value={item.codigo} onChange={(v) => atualizarItem(idx, { codigo: v })} />
                  )}

                  {item.forma === "debito_conta" && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="col-span-2">
                        <SeletorMeioPagamento
                          tipo="conta"
                          meiosIniciais={meios}
                          pessoas={pessoas}
                          bancoAtual={item.banco}
                          onSelecionar={(d) => atualizarItem(idx, { banco: d.banco, titular: d.titular, meio_pagamento_id: d.meio_pagamento_id })}
                        />
                      </div>
                      <p className="col-span-2 -mt-1 text-[11px] text-text-faint">Conta é sempre da empresa — pra conta pessoal, use Cartão.</p>
                    </div>
                  )}
                </div>
              ))}

              {rascunho.length < FORMAS.length && (
                <button type="button" onClick={adicionarForma} className="self-start text-[12px] font-medium text-primary-deep">
                  + Combinar com outra forma de pagamento
                </button>
              )}

              {rascunho.length > 1 && Math.abs(diferenca) > 0.01 && (
                <p className="text-[11.5px] text-danger">
                  {diferenca > 0 ? `Falta ${formatBRL(diferenca)} pra completar o valor total.` : `Passou ${formatBRL(-diferenca)} do valor total.`}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border-soft px-5 py-3.5">
            <button type="button" onClick={cancelar} className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] text-text-muted">
              Cancelar
            </button>
            <button type="button" onClick={confirmar} className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white">
              Confirmar
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function CampoTexto({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[10.5px] text-text-faint">{label}</label>
      <input type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="input w-full" />
    </div>
  );
}

export type Efetivacao = { banco?: string; conta?: string; data?: string; observacao?: string };

const FORMAS_CARTAO = new Set<FormaPagamentoTipo>(["cartao_credito_socias", "cartao_corporativo"]);

/** Aparece só quando a despesa é marcada como comprovada e tem pelo menos uma forma de pagamento
 * que não é cartão (boleto/pix/débito) — pede onde o pagamento efetivamente saiu, pra fechar a
 * conferência contábil. Cartão não pede isso porque a fatura consolida depois. */
export function EfetivacaoPagamento({
  name,
  itens,
  defaultValue,
}: {
  name: string;
  itens: ItemPagamento[];
  defaultValue?: Record<number, Efetivacao>;
}) {
  const [valores, setValores] = useState<Record<number, Efetivacao>>(defaultValue ?? {});
  const naoCartao = itens.map((item, idx) => ({ item, idx })).filter(({ item }) => !FORMAS_CARTAO.has(item.forma));

  if (naoCartao.length === 0) return null;

  function atualizar(idx: number, patch: Partial<Efetivacao>) {
    setValores((atual) => ({ ...atual, [idx]: { ...atual[idx], ...patch } }));
  }

  return (
    <div className="rounded-lg border border-border-soft bg-bg p-3.5">
      <input type="hidden" name={name} value={JSON.stringify(valores)} />
      <p className="mb-2.5 text-[11.5px] font-medium text-text-muted">Onde foi efetivado o pagamento?</p>
      <div className="flex flex-col gap-3">
        {naoCartao.map(({ item, idx }) => (
          <div key={idx} className="grid grid-cols-2 gap-2.5">
            <span className="col-span-2 text-[11px] font-medium text-text-faint">
              {LABEL_FORMA[item.forma]} — {formatBRL(item.valor)}
            </span>
            <CampoTexto label="Banco de saída" value={valores[idx]?.banco} onChange={(v) => atualizar(idx, { banco: v })} />
            <CampoTexto label="Conta (opcional)" value={valores[idx]?.conta} onChange={(v) => atualizar(idx, { conta: v })} />
            <div>
              <label className="mb-1 block text-[10.5px] text-text-faint">Data</label>
              <input
                type="date"
                value={valores[idx]?.data ?? ""}
                onChange={(e) => atualizar(idx, { data: e.target.value })}
                className="input w-full"
              />
            </div>
            <CampoTexto
              label="Observação (opcional)"
              value={valores[idx]?.observacao}
              onChange={(v) => atualizar(idx, { observacao: v })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
