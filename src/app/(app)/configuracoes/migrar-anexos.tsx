"use client";

import { useState, useTransition } from "react";
import { migrarAnexosAntigos, reorganizarAnexosDrive } from "./actions";

/** Botão "Migrar anexos antigos": leva os arquivos da Storage do Supabase pro Drive, 5 por vez, até acabar. */
export function MigrarAnexos({ antigos, driveOk }: { antigos: number; driveOk: boolean }) {
  const [restantes, setRestantes] = useState(antigos);
  const [feitos, setFeitos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  const [reorg, setReorg] = useState<string | null>(null);
  const [reorganizando, startReorg] = useTransition();
  const botaoReorganizar = (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
      <button
        type="button"
        disabled={reorganizando || !driveOk}
        title="Põe todos os anexos direto em Arquivos_tarefas com o nome da tarefa no fim e apaga subpastas vazias"
        onClick={() => {
          setReorg(null);
          startReorg(async () => {
            const r = await reorganizarAnexosDrive();
            setReorg(r.error ?? `${r.ajustados} arquivo(s) ajustado(s), ${r.pastasApagadas} pasta(s) vazia(s) removida(s).`);
          });
        }}
        className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-muted hover:border-primary-fill hover:text-primary-deep disabled:opacity-50"
      >
        {reorganizando ? "Reorganizando…" : "Reorganizar arquivos no Drive"}
      </button>
      {reorg && <span className={reorg.includes("ajustado") ? "text-success" : "text-danger"}>{reorg}</span>}
    </div>
  );

  if (antigos === 0 && feitos === 0)
    return (
      <>
        <p className="mt-2 text-[11.5px] text-text-faint">Nenhum anexo antigo no Supabase — a Storage ficou só com comprovantes, faturas e lançamentos.</p>
        {botaoReorganizar}
      </>
    );

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
      <span className="text-text-muted">
        {restantes > 0 ? `${restantes} anexo${restantes === 1 ? "" : "s"} antigo${restantes === 1 ? "" : "s"} ainda no Supabase` : "Migração concluída"}
        {feitos > 0 ? ` · ${feitos} migrado${feitos === 1 ? "" : "s"}` : ""}
      </span>
      {restantes > 0 && (
        <button
          type="button"
          disabled={pendente || !driveOk}
          title={driveOk ? "Leva pro Drive, 5 por vez" : "Libere o Drive primeiro"}
          onClick={() => {
            setErro(null);
            start(async () => {
              let continuar = true;
              while (continuar) {
                const r = await migrarAnexosAntigos();
                setFeitos((f) => f + r.migrados);
                setRestantes(r.restantes);
                if (r.error) {
                  setErro(r.error);
                  continuar = false;
                } else continuar = r.restantes > 0 && r.migrados > 0;
              }
            });
          }}
          className="rounded-lg bg-wine-deep px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
        >
          {pendente ? "Migrando…" : "Migrar anexos antigos pro Drive"}
        </button>
      )}
      {erro && <span className="text-danger">{erro}</span>}
    </div>
  );
}
