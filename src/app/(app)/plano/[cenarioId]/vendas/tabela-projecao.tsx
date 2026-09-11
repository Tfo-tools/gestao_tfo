"use client";

import { useMemo, useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";

export type LinhaProjecao = {
  produto_id: string;
  mes_referencia: string;
  fase: string | null;
  clientes_ativos: number;
  novos_clientes: number;
  novos_direto: number;
  novos_representante: number;
  novos_associacao: number;
  clientes_perdidos: number;
  churn_pct: number | null;
  receita_bruta: number;
  /** Só o recorrente — é o que se compara com o preço de tabela. */
  mrr: number;
  receita_implementacao: number;
  implementacoes_ativas: number;
};

export type ProdutoOpcao = { id: string; nome: string };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function formatMes(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}
function num(v: number, casas = 1) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function TabelaProjecao({ linhas, produtos, cenarioId }: { linhas: LinhaProjecao[]; produtos: ProdutoOpcao[]; cenarioId: string }) {
  const [selecionados, setSelecionados] = useState<string[]>(produtos.map((p) => p.id));
  // A quebra por canal é detalhe de diagnóstico: fica fora do caminho até ser pedida.
  const [detalharCanais, setDetalharCanais] = useState(false);

  function alternar(id: string) {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Com um produto só dá pra mostrar a fase; com vários, a fase de cada um seria diferente no
  // mesmo mês, então a coluna não faz sentido.
  const umProdutoSo = selecionados.length === 1;

  const agregado = useMemo(() => {
    const porMes = new Map<string, LinhaProjecao & { produtosNoMes: number }>();
    for (const l of linhas) {
      if (!selecionados.includes(l.produto_id)) continue;
      const atual = porMes.get(l.mes_referencia);
      if (!atual) {
        porMes.set(l.mes_referencia, { ...l, produtosNoMes: 1 });
        continue;
      }
      atual.clientes_ativos += l.clientes_ativos;
      atual.novos_clientes += l.novos_clientes;
      atual.novos_direto += l.novos_direto;
      atual.novos_representante += l.novos_representante;
      atual.novos_associacao += l.novos_associacao;
      atual.clientes_perdidos += l.clientes_perdidos;
      atual.receita_bruta += l.receita_bruta;
      atual.mrr += l.mrr;
      atual.receita_implementacao += l.receita_implementacao;
      atual.implementacoes_ativas += l.implementacoes_ativas;
      // Churn consolidado: média ponderada pela base de clientes de cada produto.
      if (l.churn_pct != null) {
        const pesoAtual = (atual.churn_pct ?? 0) * (atual.clientes_ativos - l.clientes_ativos);
        atual.churn_pct = atual.clientes_ativos > 0 ? (pesoAtual + l.churn_pct * l.clientes_ativos) / atual.clientes_ativos : l.churn_pct;
      }
      atual.produtosNoMes += 1;
    }
    return [...porMes.values()]
      .filter((l) => l.clientes_ativos > 0 || l.novos_clientes > 0)
      .sort((a, b) => (a.mes_referencia < b.mes_referencia ? -1 : 1));
  }, [linhas, selecionados]);

  // Intercala uma linha de fechamento depois do último mês de cada ano. O número de meses vai
  // junto de propósito: quando o cenário começa ou termina no meio do ano, somar o que tem e
  // comparar com um ano cheio dá a falsa impressão de queda.
  const comFechamentos = useMemo(() => {
    const saida: (({ tipo: "mes" } & (typeof agregado)[number]) | { tipo: "ano"; ano: string; meses: number; clientesFim: number; novosDireto: number; novosRepresentante: number; novosAssociacao: number; novosTotal: number; saidas: number; receita: number; receitaImpl: number; implementacoes: number; arpu: number })[] = [];
    let acc: (typeof agregado)[number][] = [];

    const fechar = () => {
      if (acc.length === 0) return;
      const receita = acc.reduce((s, l) => s + l.receita_bruta, 0);
      const recorrente = acc.reduce((s, l) => s + l.mrr, 0);
      const receitaImpl = acc.reduce((s, l) => s + l.receita_implementacao, 0);
      const implMes = acc.reduce((s, l) => s + l.implementacoes_ativas, 0);
      const clientesMes = acc.reduce((s, l) => s + l.clientes_ativos, 0);
      saida.push({
        tipo: "ano",
        ano: acc[0].mes_referencia.slice(0, 4),
        meses: acc.length,
        clientesFim: acc[acc.length - 1].clientes_ativos,
        novosDireto: acc.reduce((s, l) => s + l.novos_direto, 0),
        novosRepresentante: acc.reduce((s, l) => s + l.novos_representante, 0),
        novosAssociacao: acc.reduce((s, l) => s + l.novos_associacao, 0),
        novosTotal: acc.reduce((s, l) => s + l.novos_clientes, 0),
        saidas: acc.reduce((s, l) => s + l.clientes_perdidos, 0),
        receita,
        receitaImpl,
        implementacoes: implMes,
        // Ticket médio por cobrança: assinaturas + parcelas de implementação no denominador.
        arpu: clientesMes + implMes > 0 ? receita / (clientesMes + implMes) : 0,
      });
      acc = [];
    };

    for (const l of agregado) {
      if (acc.length > 0 && l.mes_referencia.slice(0, 4) !== acc[0].mes_referencia.slice(0, 4)) fechar();
      saida.push({ tipo: "mes", ...l });
      acc.push(l);
    }
    fechar();
    return saida;
  }, [agregado]);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center font-heading text-[13px] font-semibold">
          Projeção de vendas
          <InfoTooltip texto="Resultado dos indicadores que você definiu acima. Ajuste crescimento, churn e os canais até esta tabela mostrar um número que faça sentido. A linha destacada ao fim de cada ano soma o faturamento do exercício — quando o ano não tem 12 meses dentro do cenário, ela mostra quantos meses entraram e o valor anualizado, pra não parecer queda." />
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDetalharCanais((v) => !v)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
              detalharCanais ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border text-text-muted"
            }`}
          >
            {detalharCanais ? "Ocultar canais" : "Detalhar canais"}
          </button>
          <a
            href={`/plano/${cenarioId}/vendas/export?produtos=${selecionados.join(",")}`}
            className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-primary-deep hover:bg-bg"
          >
            Exportar Excel
          </a>
          <span className="ml-2 text-[10.5px] text-text-faint">Produtos:</span>
          {produtos.map((p) => {
            const ativo = selecionados.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => alternar(p.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  ativo ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border text-text-faint"
                }`}
              >
                {p.nome}
              </button>
            );
          })}
        </div>
      </div>

      {selecionados.length === 0 ? (
        <p className="text-[12px] text-text-faint">Selecione pelo menos um produto.</p>
      ) : agregado.length === 0 ? (
        <p className="text-[12px] text-text-faint">
          Sem projeção ainda — preencha os indicadores acima e recalcule a simulação em Produtos.
        </p>
      ) : (
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-[9.5px] uppercase tracking-wide text-text-faint">
                <th className="px-2 py-1.5 font-medium">Mês</th>
                {umProdutoSo && <th className="px-2 py-1.5 font-medium">Fase</th>}
                <th className="px-2 py-1.5 text-right font-medium">Clientes</th>
                {detalharCanais && (
                  <>
                    <th className="px-2 py-1.5 text-right font-medium">Novos direto</th>
                    <th className="px-2 py-1.5 text-right font-medium">Novos repres.</th>
                    <th className="px-2 py-1.5 text-right font-medium">Novos assoc.</th>
                  </>
                )}
                <th className="px-2 py-1.5 text-right font-medium">Total novos</th>
                <th className="px-2 py-1.5 text-right font-medium">Saíram</th>
                <th className="px-2 py-1.5 text-right font-medium">Implementações</th>
                <th className="px-2 py-1.5 text-right font-medium">Receita implant.</th>
                <th className="px-2 py-1.5 text-right font-medium">Faturamento</th>
                <th className="px-2 py-1.5 text-right font-medium">
                  Ticket médio
                  <InfoTooltip texto="Receita total ÷ número de cobranças do mês, onde cobranças = assinaturas ativas de cada produto + parcelas de implementação em andamento. Como o cliente vindo de associação tem desconto na implementação, ele entra no denominador inteiro mas soma menos receita — e o ticket médio cai, que é o efeito esperado." />
                </th>
              </tr>
            </thead>
            <tbody>
              {comFechamentos.map((item) => {
                if (item.tipo === "ano") {
                  const completo = item.meses === 12;
                  return (
                    <tr key={`ano-${item.ano}`} className="border-t-2 border-border bg-bg text-[11.5px] font-semibold">
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {item.ano}
                        {!completo && (
                          <span className="ml-1 font-normal text-[9px] text-text-faint">
                            ({item.meses} {item.meses === 1 ? "mês" : "meses"})
                          </span>
                        )}
                      </td>
                      {umProdutoSo && <td className="px-2 py-1.5" />}
                      <td className="px-2 py-1.5 text-right font-mono">{item.clientesFim}</td>
                      {detalharCanais && (
                        <>
                          <td className="px-2 py-1.5 text-right font-mono text-text-muted">{num(item.novosDireto)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-text-muted">{num(item.novosRepresentante)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-text-muted">{num(item.novosAssociacao)}</td>
                        </>
                      )}
                      <td className="px-2 py-1.5 text-right font-mono">{num(item.novosTotal, 0)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-text-muted">
                        {item.saidas > 0 ? `-${num(item.saidas)}` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-text-muted">
                        {item.implementacoes > 0 ? num(item.implementacoes, 0) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-text-muted">
                        {item.receitaImpl > 0 ? formatBRL(item.receitaImpl) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {formatBRL(item.receita)}
                        {!completo && (
                          <span className="ml-1 block font-normal text-[9px] text-text-faint">
                            {formatBRL((item.receita / item.meses) * 12)}/ano
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-text-muted">{formatBRL(item.arpu)}</td>
                    </tr>
                  );
                }
                const l = item;
                // Preço médio é do RECORRENTE: implementação é cobrança única e distorceria a
                // comparação com o preço de tabela.
                // Cada assinatura ativa e cada parcela de implementação é uma cobrança. O ticket
                // médio é a receita total dividida pelo número de cobranças — cliente de canal com
                // desconto na implementação puxa esse número pra baixo, que é o comportamento certo.
                const cobrancas = l.clientes_ativos + l.implementacoes_ativas;
                const precoMedio = cobrancas > 0 ? l.receita_bruta / cobrancas : 0;
                return (
                  <tr key={l.mes_referencia} className="border-t border-border-soft text-[11.5px]">
                    <td className="whitespace-nowrap px-2 py-1.5 capitalize">{formatMes(l.mes_referencia)}</td>
                    {umProdutoSo && <td className="px-2 py-1.5 capitalize text-text-muted">{l.fase ?? "—"}</td>}
                    <td className="px-2 py-1.5 text-right font-mono font-semibold">{l.clientes_ativos}</td>
                    {detalharCanais && (
                      <>
                        <td className="px-2 py-1.5 text-right font-mono text-text-muted">{num(l.novos_direto)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-text-muted">{num(l.novos_representante)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-text-muted">{num(l.novos_associacao)}</td>
                      </>
                    )}
                    <td className="px-2 py-1.5 text-right font-mono">{l.novos_clientes}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-text-muted">
                      {l.clientes_perdidos > 0 ? `-${num(l.clientes_perdidos)}` : "—"}
                      {l.churn_pct ? <span className="ml-1 text-[9px] text-text-faint">({(l.churn_pct * 100).toFixed(1)}%)</span> : null}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-text-muted">
                      {l.implementacoes_ativas > 0 ? num(l.implementacoes_ativas, 0) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-text-muted">
                      {l.receita_implementacao > 0 ? formatBRL(l.receita_implementacao) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatBRL(l.receita_bruta)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-text-muted">{formatBRL(precoMedio)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
