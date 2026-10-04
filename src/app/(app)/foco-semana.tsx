"use client";

import { useState, useTransition } from "react";
import { alternarEntrega, salvarFoco, type FocoSemana } from "./inicio-actions";

type Pessoa = { id: string; nome: string };

const primeiroNome = (nome: string) => {
  const n = nome.trim().split(" ")[0];
  return n.charAt(0).toUpperCase() + n.slice(1);
};
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Banner "Foco da semana": manchete editável pelas sócias, com prazo, donas e até 5 entregas marcáveis.
 * Vencido sem troca, fica âmbar pedindo o foco novo. */
export function FocoSemanaBanner({ foco, pessoas, hoje }: { foco: FocoSemana | null; pessoas: Pessoa[]; hoje: string }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(foco?.texto ?? "");
  const [prazo, setPrazo] = useState(foco?.prazo ?? "");
  const [donas, setDonas] = useState<string[]>(foco?.donas ?? []);
  const [entregas, setEntregas] = useState((foco?.entregas ?? []).map((e) => e.titulo).join("\n"));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  const vencido = !!foco?.prazo && foco.prazo < hoje;
  const feitas = foco?.entregas.filter((e) => e.feito).length ?? 0;
  const total = foco?.entregas.length ?? 0;
  const nomesDonas = (foco?.donas ?? []).map((id) => pessoas.find((p) => p.id === id)?.nome).filter((n): n is string => !!n).map(primeiroNome);

  function salvar() {
    setErro(null);
    start(async () => {
      const r = await salvarFoco({ id: foco?.id ?? null, texto, prazo: prazo || null, donas, entregas: entregas.split("\n") });
      if (r.error) return setErro(r.error);
      setEditando(false);
    });
  }

  if (editando || !foco) {
    if (!foco && !editando) {
      return (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="flex w-full items-center justify-between rounded-xl border border-dashed border-wine/40 bg-wine-soft/60 px-4 py-3 text-left hover:border-wine"
        >
          <span>
            <span className="block text-[10.5px] font-medium uppercase tracking-wide text-wine/70">Foco da semana</span>
            <span className="block font-heading text-[14px] font-semibold text-wine">Definir o foco desta semana</span>
          </span>
          <span className="text-[12px] font-medium text-wine">+ definir</span>
        </button>
      );
    }
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-[10.5px] font-medium uppercase tracking-wide text-text-faint">Foco da semana</p>
        <div className="mt-2 flex flex-col gap-2">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Uma frase: o que a semana precisa entregar" className="input w-full" autoFocus />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
            <label className="flex items-center gap-1.5">
              até <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="input" />
            </label>
            <span className="flex items-center gap-2">
              donas:
              {pessoas.map((p) => (
                <label key={p.id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={donas.includes(p.id)}
                    onChange={(e) => setDonas((d) => (e.target.checked ? [...d, p.id] : d.filter((x) => x !== p.id)))}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  {primeiroNome(p.nome)}
                </label>
              ))}
            </span>
          </div>
          <textarea value={entregas} onChange={(e) => setEntregas(e.target.value)} rows={3} placeholder="Entregas, uma por linha (até 5)" className="input w-full" />
          {erro && <p className="text-[11px] text-danger">{erro}</p>}
          <div className="flex items-center gap-3">
            <button type="button" disabled={pendente} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-1.5 text-[12px] font-medium text-white disabled:opacity-60">
              {pendente ? "Salvando…" : "Salvar foco"}
            </button>
            <button type="button" onClick={() => setEditando(false)} className="text-[11.5px] text-text-muted">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl px-4 py-3 text-white ${vencido ? "bg-cream-deep" : "bg-wine"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10.5px] font-medium uppercase tracking-wide text-white/70">
          Foco da semana{foco.prazo ? ` · ${vencido ? "venceu" : "até"} ${ddmm(foco.prazo)}` : ""}
        </p>
        <button type="button" onClick={() => setEditando(true)} className="text-[11px] text-white/80 hover:text-white" title="Editar o foco">
          editar ✎
        </button>
      </div>
      <p className="mt-0.5 font-heading text-[15px] font-semibold leading-snug">{foco.texto}</p>
      {vencido && <p className="mt-1 text-[12px] text-white/90">Semana virou. Defina o foco novo.</p>}
      <p className="mt-1 text-[12px] text-white/80">
        {nomesDonas.length > 0 ? nomesDonas.join(" e ") : "Sem dona definida"}
        {total > 0 ? ` · ${feitas} de ${total} entregas concluídas` : ""}
      </p>
      {total > 0 && (
        <>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white/90" style={{ width: `${Math.round((feitas / total) * 100)}%` }} />
          </div>
          <ul className="mt-2 flex flex-col gap-0.5">
            {foco.entregas.map((e, i) => (
              <li key={i}>
                <label className={`flex items-center gap-2 text-[12px] ${e.feito ? "text-white/60 line-through" : "text-white/95"}`}>
                  <input
                    type="checkbox"
                    checked={e.feito}
                    disabled={pendente}
                    onChange={(ev) => start(async () => void (await alternarEntrega(foco.id, i, ev.target.checked)))}
                    className="h-3.5 w-3.5 rounded border-white/50 bg-transparent"
                  />
                  {e.titulo}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
