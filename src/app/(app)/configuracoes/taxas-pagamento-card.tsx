"use client";

import { useState, useTransition } from "react";
import { MEIOS, PRAZOS, type MeioPagamento, type PrazoPagamento, type TaxaPagamento } from "@/lib/taxas-pagamento";
import { excluirTaxaPagamento, salvarTaxasPagamento, type LinhaTaxa } from "./taxas-actions";

type Linha = LinhaTaxa & { chave: string; pctTexto: string; fixoTexto: string };

const hojeIso = () => new Date().toISOString().slice(0, 10);
const rotuloMeio = (m: MeioPagamento) => MEIOS.find((x) => x.valor === m)?.rotulo ?? m;
const rotuloPrazo = (p: PrazoPagamento) => PRAZOS.find((x) => x.valor === p)?.rotulo ?? p;

/**
 * Cadastro único das taxas de meios de pagamento (Asaas). O COGS (bloco gateway) e a proposta
 * comercial leem daqui; a taxa vale na data de início da vigência. Uma linha por meio × prazo;
 * para trocar uma taxa sem perder o histórico, acrescente uma linha com a vigência nova.
 */
export function TaxasPagamentoCard({ taxas }: { taxas: TaxaPagamento[] }) {
  const [linhas, setLinhas] = useState<Linha[]>(
    taxas.map((t) => ({ ...t, chave: t.id, pctTexto: (t.pct * 100).toFixed(2).replace(".", ","), fixoTexto: t.fixo.toFixed(2).replace(".", ",") })),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, start] = useTransition();

  const num = (t: string) => Number(String(t).replace(",", "."));
  const editar = (chave: string, mudanca: Partial<Linha>) => {
    setSalvo(false);
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));
  };
  const adicionar = () =>
    setLinhas((ls) => [
      ...ls,
      { chave: `nova-${Date.now()}`, meio: "cartao", prazo: "mensal", pct: 0, fixo: 0, pctTexto: "0", fixoTexto: "0", uso: "", vigencia_inicio: hojeIso(), vigencia_fim: null, ativo: true },
    ]);
  const salvar = () => {
    setErro(null);
    start(async () => {
      const r = await salvarTaxasPagamento(
        linhas.map((l) => ({ id: l.id, meio: l.meio, prazo: l.prazo, pct: num(l.pctTexto) / 100, fixo: num(l.fixoTexto), uso: l.uso, vigencia_inicio: l.vigencia_inicio, vigencia_fim: l.vigencia_fim, ativo: l.ativo })),
      );
      if (r.error) setErro(r.error);
      else setSalvo(true);
    });
  };

  const grupos: { titulo: string; nota: string; prazos: PrazoPagamento[] }[] = [
    { titulo: "Assinatura (parcela mensal do plano anual)", nota: "Mind só por boleto; Skills e Price para clientes pequenos aceitam também Pix e cartão.", prazos: ["mensal"] },
    { titulo: "Implantação", nota: "Só à vista, em 3x ou em 5x. No cartão parcelado o Asaas cobra o percentual sobre o valor total.", prazos: ["avista", "3x", "5x"] },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-heading text-sm font-semibold">Taxas de meios de pagamento (Asaas)</h2>
          <p className="mt-0.5 max-w-2xl text-[12px] text-text-muted">
            Cadastro único: o COGS de cada produto (bloco gateway, em Plano → Custos) e a proposta comercial leem daqui. Para mudar uma taxa sem perder o histórico, adicione uma linha com a vigência nova; a antiga continua valendo até a data de fim.
          </p>
        </div>
        <button type="button" onClick={adicionar} className="rounded-lg border border-border px-3 py-1.5 text-[12px] text-text-muted hover:border-primary-fill hover:text-primary-deep">
          + linha
        </button>
      </div>

      {grupos.map((g) => {
        const doGrupo = linhas.filter((l) => g.prazos.includes(l.prazo));
        return (
          <div key={g.titulo} className="mt-4">
            <p className="text-[12px] font-semibold">{g.titulo}</p>
            <p className="mb-2 text-[11px] text-text-faint">{g.nota}</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="text-left text-text-muted">
                    <th className="px-2 py-1 font-medium">Meio</th>
                    <th className="px-2 py-1 font-medium">Prazo</th>
                    <th className="px-2 py-1 font-medium">% sobre o valor</th>
                    <th className="px-2 py-1 font-medium">Fixo por cobrança (R$)</th>
                    <th className="px-2 py-1 font-medium">Uso</th>
                    <th className="px-2 py-1 font-medium">Vigência</th>
                    <th className="px-2 py-1 font-medium">Ativa</th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {doGrupo.map((l) => (
                    <tr key={l.chave} className={`border-t border-border-soft ${l.ativo ? "" : "opacity-50"}`}>
                      <td className="px-2 py-1">
                        <select value={l.meio} onChange={(e) => editar(l.chave, { meio: e.target.value as MeioPagamento })} className="input input-compacto">
                          {MEIOS.map((m) => (
                            <option key={m.valor} value={m.valor}>{m.rotulo}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select value={l.prazo} onChange={(e) => editar(l.chave, { prazo: e.target.value as PrazoPagamento })} className="input input-compacto">
                          {PRAZOS.map((p) => (
                            <option key={p.valor} value={p.valor}>{p.rotulo}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1"><input value={l.pctTexto} onChange={(e) => editar(l.chave, { pctTexto: e.target.value })} className="input input-compacto w-[80px] text-right" inputMode="decimal" /></td>
                      <td className="px-2 py-1"><input value={l.fixoTexto} onChange={(e) => editar(l.chave, { fixoTexto: e.target.value })} className="input input-compacto w-[80px] text-right" inputMode="decimal" /></td>
                      <td className="px-2 py-1"><input value={l.uso ?? ""} onChange={(e) => editar(l.chave, { uso: e.target.value })} className="input input-compacto w-[260px]" placeholder="onde se aplica" /></td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        <input type="date" value={l.vigencia_inicio} onChange={(e) => editar(l.chave, { vigencia_inicio: e.target.value })} className="input input-compacto" />
                        <span className="mx-1 text-text-faint">→</span>
                        <input type="date" value={l.vigencia_fim ?? ""} onChange={(e) => editar(l.chave, { vigencia_fim: e.target.value || null })} className="input input-compacto" title="Vazio = sem fim" />
                      </td>
                      <td className="px-2 py-1 text-center"><input type="checkbox" checked={l.ativo} onChange={(e) => editar(l.chave, { ativo: e.target.checked })} className="accent-wine" /></td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          title="Excluir linha"
                          disabled={pendente}
                          onClick={() => {
                            if (!confirm(`Excluir a taxa ${rotuloMeio(l.meio)} · ${rotuloPrazo(l.prazo)}?`)) return;
                            if (!l.id) return setLinhas((ls) => ls.filter((x) => x.chave !== l.chave));
                            start(async () => {
                              const r = await excluirTaxaPagamento(l.id!);
                              if (r.error) setErro(r.error);
                              else setLinhas((ls) => ls.filter((x) => x.chave !== l.chave));
                            });
                          }}
                          className="text-[12px] text-text-faint hover:text-danger"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  {doGrupo.length === 0 && (
                    <tr><td colSpan={8} className="px-2 py-2 text-[11.5px] text-text-faint">Nenhuma taxa cadastrada neste grupo.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={pendente} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">
          {pendente ? "Salvando…" : "Salvar taxas"}
        </button>
        {salvo && !pendente && <span className="text-[11.5px] text-success">Salvo — o plano e a proposta já usam estes valores.</span>}
        {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
        <span className="ml-auto text-[10.5px] text-text-faint">Fonte: asaas.com/precos-e-taxas, tabela padrão, 07/10/2026.</span>
      </div>
    </div>
  );
}
