"use client";

import { useActionState, useMemo, useState } from "react";
import { criarAgendamento, type AgendamentoState } from "./actions";
import { calcularSlotsDisponiveis, type ReuniaoExistente, type SlotDisponivel } from "@/lib/agenda-slots";

type TipoReuniao = { id: string; nome: string; slug: string; duracao_minutos: number; descricao: string | null };
type RegraDB = { tipo_reuniao_id: string; dia_semana: number; hora_inicio: string; hora_fim: string };

const initialState: AgendamentoState = { error: null };

function formatDia(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}
function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function AgendarForm({
  tipos,
  regras,
  reunioes,
}: {
  tipos: TipoReuniao[];
  regras: RegraDB[];
  reunioes: ReuniaoExistente[];
}) {
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoReuniao | null>(tipos.length === 1 ? tipos[0] : null);
  const [slotSelecionado, setSlotSelecionado] = useState<SlotDisponivel | null>(null);
  const [state, formAction, pending] = useActionState(criarAgendamento, initialState);

  const slots = useMemo(() => {
    if (!tipoSelecionado) return [];
    const regrasDoTipo = regras.filter((r) => r.tipo_reuniao_id === tipoSelecionado.id);
    return calcularSlotsDisponiveis(regrasDoTipo, tipoSelecionado.duracao_minutos, reunioes);
  }, [tipoSelecionado, regras, reunioes]);

  const slotsPorDia = useMemo(() => {
    const mapa = new Map<string, SlotDisponivel[]>();
    for (const s of slots) {
      const chave = s.inicioIso.slice(0, 10);
      const atual = mapa.get(chave) ?? [];
      atual.push(s);
      mapa.set(chave, atual);
    }
    return mapa;
  }, [slots]);

  if (state.sucesso) {
    return (
      <div className="rounded-xl border border-border bg-surface p-7 text-center">
        <p className="text-[15px] font-semibold text-success">Reunião confirmada!</p>
        <p className="mt-2 text-[13px] text-text-muted">
          {formatDia(state.sucesso.dataHora)}, às {formatHora(state.sucesso.dataHora)}. Você recebe um convite por e-mail com os
          detalhes{state.sucesso.meetLink ? " e o link da videochamada" : ""}.
        </p>
        {state.sucesso.meetLink && (
          <a
            href={state.sucesso.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white"
          >
            Link do Google Meet
          </a>
        )}
      </div>
    );
  }

  if (tipos.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-7 text-center text-[13px] text-text-muted">
        Nenhum horário disponível pra agendamento no momento.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-7">
      {!tipoSelecionado ? (
        <div className="flex flex-col gap-2.5">
          <p className="mb-1 text-[12.5px] font-medium text-text-muted">Sobre o que você quer conversar?</p>
          {tipos.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipoSelecionado(t)}
              className="rounded-lg border border-border-soft px-4 py-3 text-left transition-colors hover:border-primary-fill"
            >
              <span className="text-[13px] font-semibold">{t.nome}</span>
              <span className="ml-2 text-[11px] text-text-faint">{t.duracao_minutos} min</span>
              {t.descricao && <p className="mt-0.5 text-[11.5px] text-text-muted">{t.descricao}</p>}
            </button>
          ))}
        </div>
      ) : !slotSelecionado ? (
        <div>
          {tipos.length > 1 && (
            <button type="button" onClick={() => setTipoSelecionado(null)} className="mb-3 text-[11.5px] text-text-muted">
              ← Trocar tipo de reunião
            </button>
          )}
          <p className="mb-3 text-[12.5px] font-medium text-text-muted">
            {tipoSelecionado.nome} — {tipoSelecionado.duracao_minutos} min. Escolha um horário:
          </p>
          {slotsPorDia.size === 0 ? (
            <p className="text-[12.5px] text-text-muted">Nenhum horário livre nos próximos dias — tente mais tarde.</p>
          ) : (
            <div className="flex max-h-[360px] flex-col gap-3 overflow-y-auto pr-1">
              {[...slotsPorDia.entries()].map(([dia, slotsDoDia]) => (
                <div key={dia}>
                  <p className="mb-1.5 text-[11.5px] font-semibold capitalize text-text">{formatDia(slotsDoDia[0].inicioIso)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {slotsDoDia.map((s) => (
                      <button
                        key={s.inicioIso}
                        type="button"
                        onClick={() => setSlotSelecionado(s)}
                        className="rounded-lg border border-border-soft px-3 py-1.5 text-[12px] font-medium text-text transition-colors hover:border-primary-fill hover:text-primary-deep"
                      >
                        {formatHora(s.inicioIso)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="tipo_reuniao_id" value={tipoSelecionado.id} />
          <input type="hidden" name="inicio_iso" value={slotSelecionado.inicioIso} />
          <input type="hidden" name="fim_iso" value={slotSelecionado.fimIso} />

          <button type="button" onClick={() => setSlotSelecionado(null)} className="self-start text-[11.5px] text-text-muted">
            ← Trocar horário
          </button>
          <p className="rounded-lg bg-primary-soft px-3.5 py-2.5 text-[12.5px] text-primary-deep">
            <span className="font-semibold capitalize">{formatDia(slotSelecionado.inicioIso)}</span>, às{" "}
            {formatHora(slotSelecionado.inicioIso)} — {tipoSelecionado.nome}
          </p>

          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Seu nome</label>
            <input name="nome" type="text" required className="input w-full" />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">E-mail</label>
            <input name="email" type="email" required className="input w-full" />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Empresa (opcional)</label>
            <input name="empresa" type="text" className="input w-full" />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Quer adiantar algo? (opcional)</label>
            <textarea name="observacoes" rows={2} className="input w-full" />
          </div>

          {state.error && <p className="text-[11.5px] text-danger">{state.error}</p>}

          <button type="submit" disabled={pending} className="mt-1 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
            {pending ? "Confirmando…" : "Confirmar reunião"}
          </button>
        </form>
      )}
    </div>
  );
}
