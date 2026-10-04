"use client";

import { useState, useTransition } from "react";
import { aprovarSugestao, recusarSugestao } from "./sugestoes-actions";

export type Sugestao = {
  id: string;
  titulo: string;
  responsavel_sugerido: string | null;
  responsavel_id: string | null;
  prazo_sugerido: string | null;
  ata_titulo: string | null;
  ata_data: string | null;
  parecida_titulo: string | null;
};

/** Fila de aprovação das sugestões que a IA tirou das atas (Fathom). Nada vira tarefa sem um
 * clique aqui — e o que parece repetir uma tarefa aberta chega com aviso, pra recusar em 1 clique. */
export function SugestoesPanel({ sugestoes, pessoas, projetos }: { sugestoes: Sugestao[]; pessoas: { id: string; nome: string }[]; projetos: { id: string; nome: string }[] }) {
  const [edicao, setEdicao] = useState<Record<string, { titulo: string; responsavel_id: string; prazo: string; projeto_id: string }>>(() =>
    Object.fromEntries(sugestoes.map((s) => [s.id, { titulo: s.titulo, responsavel_id: s.responsavel_id ?? "", prazo: s.prazo_sugerido ?? "", projeto_id: "" }])),
  );
  const [pendente, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [feitas, setFeitas] = useState<Set<string>>(new Set());

  const visiveis = sugestoes.filter((s) => !feitas.has(s.id));
  if (visiveis.length === 0) return null;

  const decidir = (id: string, acao: () => Promise<{ error: string | null }>) => {
    setErro(null);
    start(async () => {
      const r = await acao();
      if (r.error) setErro(r.error);
      else setFeitas((f) => new Set(f).add(id));
    });
  };

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50/60 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-amber-900">
          Aguardando aprovação · {visiveis.length} sugest{visiveis.length === 1 ? "ão" : "ões"} da IA
        </h2>
        <span className="text-[11px] text-amber-800">Vindas das atas de reunião. Aprove (ajustando se quiser) ou recuse — nada vira tarefa sozinho.</span>
      </div>
      {erro && <p className="mt-1 text-[11px] text-danger">{erro}</p>}
      <div className="mt-2 flex flex-col gap-1.5">
        {visiveis.map((s) => {
          const e = edicao[s.id];
          return (
            <div key={s.id} className="rounded-lg border border-border-soft bg-surface px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <input value={e.titulo} onChange={(ev) => setEdicao((x) => ({ ...x, [s.id]: { ...e, titulo: ev.target.value } }))} className="input input-compacto min-w-[220px] flex-1" />
                <select value={e.responsavel_id} onChange={(ev) => setEdicao((x) => ({ ...x, [s.id]: { ...e, responsavel_id: ev.target.value } }))} className="input input-compacto w-[120px]">
                  <option value="">quem?</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome.split(" ")[0]}
                    </option>
                  ))}
                </select>
                <input type="date" value={e.prazo} onChange={(ev) => setEdicao((x) => ({ ...x, [s.id]: { ...e, prazo: ev.target.value } }))} className="input input-compacto w-[135px]" />
                <select value={e.projeto_id} onChange={(ev) => setEdicao((x) => ({ ...x, [s.id]: { ...e, projeto_id: ev.target.value } }))} className="input input-compacto w-[150px]">
                  <option value="">sem projeto</option>
                  {projetos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => decidir(s.id, () => aprovarSugestao(s.id, { titulo: e.titulo, responsavel_id: e.responsavel_id || null, prazo: e.prazo || null, projeto_id: e.projeto_id || null }))}
                  className="rounded-lg bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60"
                >
                  Aprovar
                </button>
                <button type="button" disabled={pendente} onClick={() => decidir(s.id, () => recusarSugestao(s.id))} className="rounded-lg border border-border px-3 py-1.5 text-[11.5px] text-text-muted disabled:opacity-60">
                  Recusar
                </button>
              </div>
              <p className="mt-1 text-[10.5px] text-text-faint">
                {s.ata_titulo ? `Ata: ${s.ata_titulo}${s.ata_data ? ` (${s.ata_data.split("-").reverse().join("/")})` : ""}` : "Sem ata vinculada"}
                {s.responsavel_sugerido && !s.responsavel_id ? ` · a IA sugeriu "${s.responsavel_sugerido}" (não bate com ninguém da equipe)` : ""}
              </p>
              {s.parecida_titulo && (
                <p className="mt-0.5 text-[11px] text-amber-800">
                  ⚠ Parece repetir uma tarefa aberta: <span className="font-medium">{s.parecida_titulo}</span> — se for a mesma, recuse.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
