"use client";

import { useState, useTransition } from "react";
import { investimentoSocias, type InvestimentoSocias } from "../entre-socias-actions";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function InvestimentoFooter({ inicial }: { inicial: InvestimentoSocias }) {
  const [dados, setDados] = useState(inicial);
  const [desde, setDesde] = useState("");
  const [ate, setAte] = useState("");
  const [descricao, setDescricao] = useState("");
  const [pending, start] = useTransition();

  function filtrar() {
    start(async () => setDados(await investimentoSocias({ desde: desde || undefined, ate: ate || undefined, descricao: descricao.trim() || undefined })));
  }
  function limpar() {
    setDesde("");
    setAte("");
    setDescricao("");
    start(async () => setDados(await investimentoSocias({})));
  }

  const total = dados.investimento.reduce((s, x) => s + x.valor, 0) + dados.totalEmpresa;
  const temFiltro = !!(desde || ate || descricao);

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-0.5 font-heading text-sm font-semibold">Investimento por sócia</h2>
      <p className="mb-3 text-[11.5px] text-text-muted">
        Quanto cada uma tirou do bolso de fato{temFiltro ? " no recorte filtrado" : ""} — o que a outra já reembolsou conta pra quem reembolsou. Não é 50/50.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-text-faint">De (mês)</span>
          <input type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-text-faint">Até (mês)</span>
          <input type="month" value={ate} onChange={(e) => setAte(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-text-faint">Descrição (evento…)</span>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} onKeyDown={(e) => e.key === "Enter" && filtrar()} placeholder="feira, viagem…" className="input" />
        </label>
        <div className="flex items-end gap-1.5">
          <button type="button" onClick={filtrar} disabled={pending} className="flex-1 rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60">
            {pending ? "…" : "Filtrar"}
          </button>
          {temFiltro && (
            <button type="button" onClick={limpar} className="rounded-lg border border-border px-2 py-2 text-[11px] text-text-muted">limpar</button>
          )}
        </div>
      </div>

      {dados.investimento.length === 0 ? (
        <p className="text-[11.5px] text-text-muted">Nada lançado nesse recorte.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {dados.investimento.map(({ nome, valor }) => {
            const pct = total > 0 ? (valor / total) * 100 : 0;
            return (
              <div key={nome}>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold">{cap(nome)}</span>
                  <span className="font-mono font-semibold">{fmt(valor)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border-soft">
                  <div className="h-full rounded-full bg-primary-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-0.5 text-[10.5px] text-text-faint">{pct.toFixed(0)}% do total investido</div>
              </div>
            );
          })}
          {dados.totalEmpresa > 0 && (
            <div className="mt-1 flex items-center justify-between border-t border-border-soft pt-2 text-[11.5px] text-text-muted">
              <span>Pela empresa (conta/cartão PJ)</span>
              <span className="font-mono">{fmt(dados.totalEmpresa)}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
