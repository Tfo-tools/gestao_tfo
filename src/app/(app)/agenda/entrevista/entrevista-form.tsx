"use client";

import { useActionState, useMemo, useState } from "react";
import { criarEntrevista, type EntrevistaState } from "./actions";

type Slot = { inicioIso: string; fimIso: string };
const TZ = "America/Sao_Paulo";
const diaLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" });
const horaLabel = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const chaveDia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

const inicial: EntrevistaState = { error: null };

export function EntrevistaForm({ slots }: { slots: Slot[] }) {
  const [state, formAction, pending] = useActionState(criarEntrevista, inicial);
  const [sel, setSel] = useState<Slot | null>(null);
  const [copiado, setCopiado] = useState(false);

  const dias = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = chaveDia(s.inicioIso);
      (map.get(k) ?? map.set(k, []).get(k)!).push(s);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [slots]);

  if (state.sucesso) {
    const s = state.sucesso;
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-heading text-[15px] font-semibold text-success">Entrevista agendada ✓</h2>
        <p className="mt-1 text-[13px]"><b>{s.titulo}</b> · {new Date(s.inicioIso).toLocaleString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
        {s.meetLink && <p className="mt-1 text-[12.5px]">Google Meet: <a href={s.meetLink} target="_blank" rel="noopener noreferrer" className="text-primary-deep underline">{s.meetLink}</a></p>}
        <div className="mt-3 rounded-lg border border-border-soft bg-bg p-3">
          <p className="mb-1 text-[11px] font-medium text-text-muted">Mensagem pronta pro WhatsApp:</p>
          <pre className="whitespace-pre-wrap text-[12px] text-text">{s.textoWhatsapp}</pre>
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(s.textoWhatsapp).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2500); }); }}
            className="mt-2 rounded-lg bg-wine-deep px-3.5 py-1.5 text-[12px] font-medium text-white"
          >
            {copiado ? "Copiado!" : "Copiar para WhatsApp"}
          </button>
        </div>
        <a href="/agenda/entrevista" className="mt-3 inline-block text-[12px] text-primary-deep underline">Agendar outra</a>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <input type="hidden" name="inicio_iso" value={sel?.inicioIso ?? ""} />
      <input type="hidden" name="fim_iso" value={sel?.fimIso ?? ""} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px]">Empresa <span className="text-text-faint">(obrigatório)</span>
          <input name="empresa" required placeholder="Nome da marca" className="input" />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">Pessoa de contato <span className="text-text-faint">(opcional)</span>
          <input name="nome" placeholder="Quem vai participar" className="input" />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">E-mail do cliente <span className="text-text-faint">(opcional — sem ele, você copia o link)</span>
          <input name="email" type="email" placeholder="email@marca.com" className="input" />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">Observações <span className="text-text-faint">(opcional)</span>
          <input name="observacoes" placeholder="Ex.: indicação do sindicato" className="input" />
        </label>
      </div>

      <div>
        <p className="mb-1.5 text-[12px] font-medium">Horário <span className="font-normal text-text-faint">(dias úteis: seg/qua 9:30–11h e 15–17h; ter/qui/sex 15–17h)</span></p>
        {dias.length === 0 ? (
          <p className="text-[12px] text-text-muted">Nenhum horário livre nas próximas semanas. Verifique a agenda.</p>
        ) : (
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg border border-border-soft p-2">
            {dias.map(([k, lista]) => (
              <div key={k}>
                <p className="mb-1 text-[11px] font-medium capitalize text-text-muted">{diaLabel(lista[0].inicioIso)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {lista.map((s) => {
                    const ativo = sel?.inicioIso === s.inicioIso;
                    return (
                      <button key={s.inicioIso} type="button" onClick={() => setSel(s)}
                        className={`rounded-lg border px-2.5 py-1 text-[12px] ${ativo ? "border-wine bg-wine-deep text-white" : "border-border text-text hover:border-primary-fill"}`}>
                        {horaLabel(s.inicioIso)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {state.error && <p className="text-[12px] text-danger">{state.error}</p>}
      <div>
        <button type="submit" disabled={pending || !sel} className="rounded-lg bg-wine-deep px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50">
          {pending ? "Agendando…" : "Agendar entrevista"}
        </button>
      </div>
    </form>
  );
}
