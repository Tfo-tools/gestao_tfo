"use client";

import { useState, useTransition } from "react";
import { conectarFathom, desconectarFathom } from "./fathom-actions";

/** Liga/desliga a entrada automática de atas do Fathom. O app cria o webhook pela API e guarda o
 * segredo — a sócia não precisa mexer na tela do Fathom, só ter a FATHOM_API_KEY na Vercel. */
export function FathomCard({ conectado, criadoEm, apiConfigurada }: { conectado: boolean; criadoEm: string | null; apiConfigurada: boolean }) {
  const [pendente, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const agir = (acao: () => Promise<{ error: string | null }>) => {
    setErro(null);
    start(async () => {
      const r = await acao();
      if (r.error) setErro(r.error);
    });
  };

  // Conectado: some da frente. Fica só uma linha apagada no rodapé, pra poder desconectar um dia.
  if (conectado) {
    return (
      <p className="mt-8 text-[10.5px] text-text-faint">
        Fathom conectado{criadoEm ? ` desde ${criadoEm.slice(0, 10).split("-").reverse().join("/")}` : ""} — cada gravação entra como ata na reunião do horário.{" "}
        <button
          type="button"
          disabled={pendente}
          onClick={() => {
            if (!confirm("Desconectar o Fathom? As atas já salvas continuam.")) return;
            agir(desconectarFathom);
          }}
          className="underline disabled:opacity-60"
        >
          {pendente ? "…" : "desconectar"}
        </button>
        {erro && <span className="ml-2 text-danger">{erro}</span>}
      </p>
    );
  }

  return (
    <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div>
        <h2 className="text-[13px] font-semibold">Atas do Fathom</h2>
        <p className="text-[11.5px] text-text-muted">
          {apiConfigurada
            ? "Ao conectar, o app cria o webhook no Fathom e passa a receber resumo, transcrição e ações de cada gravação sua."
            : "Falta a FATHOM_API_KEY na Vercel (Fathom → Settings → API Access → Generate API key)."}
        </p>
        {erro && <p className="mt-1 text-[11px] text-danger">{erro}</p>}
      </div>
      {(
        <button
          type="button"
          disabled={pendente || !apiConfigurada}
          onClick={() => agir(conectarFathom)}
          className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60"
        >
          {pendente ? "Conectando…" : "Conectar Fathom"}
        </button>
      )}
    </section>
  );
}
