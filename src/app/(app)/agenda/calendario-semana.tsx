"use client";

import { useMemo, useState } from "react";
import { dataParaChaveSP } from "@/lib/agenda-slots";
import type { ReuniaoAgendada } from "./agenda-manager";
import type { EventoGoogle } from "@/lib/google-calendar";

export type TarefaComPrazo = { id: string; titulo: string; prazo: string; responsavel_id: string | null; status: string };

const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type ItemDia =
  | { tipo: "reuniao"; hora: string; titulo: string }
  | { tipo: "tarefa"; titulo: string; responsavelIniciais: string | null; feita: boolean }
  | { tipo: "google"; hora: string | null; titulo: string };

function inicioDaSemana(referencia: Date): Date {
  const d = new Date(referencia);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function chaveLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function iniciais(nome: string): string {
  return nome
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/** Visão semanal cruzando reuniões marcadas, compromissos do Google (agenda compartilhada + a
 * pessoal de quem está logada) e tarefas com prazo — pra ver de um jeito só como está o dia,
 * sem precisar abrir três telas diferentes. Tudo calculado a partir do que a própria página de
 * Agenda já buscou, então não faz nenhuma chamada extra ao navegar entre semanas. */
export function CalendarioSemana({
  reunioes,
  eventosGoogle,
  eventosPessoais,
  tarefas,
  pessoas,
}: {
  reunioes: ReuniaoAgendada[];
  eventosGoogle: EventoGoogle[];
  eventosPessoais: EventoGoogle[];
  tarefas: TarefaComPrazo[];
  pessoas: { id: string; nome: string }[];
}) {
  const [offsetSemana, setOffsetSemana] = useState(0);

  const dias = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + offsetSemana * 7);
    const domingo = inicioDaSemana(base);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(domingo);
      d.setDate(domingo.getDate() + i);
      return d;
    });
  }, [offsetSemana]);

  const hojeChave = chaveLocal(new Date());

  const itensPorDia = useMemo(() => {
    const mapa = new Map<string, ItemDia[]>();
    for (const d of dias) mapa.set(chaveLocal(d), []);

    function add(chave: string, item: ItemDia) {
      mapa.get(chave)?.push(item);
    }

    for (const r of reunioes) {
      add(dataParaChaveSP(new Date(r.data_hora_inicio)), {
        tipo: "reuniao",
        hora: formatHora(r.data_hora_inicio),
        titulo: `${r.tipos_reuniao?.nome ?? "Reunião"} — ${r.contatos_externos?.nome ?? "—"}`,
      });
    }

    for (const t of tarefas) {
      const responsavel = pessoas.find((p) => p.id === t.responsavel_id);
      add(t.prazo, {
        tipo: "tarefa",
        titulo: t.titulo,
        responsavelIniciais: responsavel ? iniciais(responsavel.nome) : null,
        feita: t.status === "feito",
      });
    }

    for (const ev of [...eventosGoogle, ...eventosPessoais]) {
      const chave = ev.diaTodo ? ev.inicioIso.slice(0, 10) : dataParaChaveSP(new Date(ev.inicioIso));
      add(chave, { tipo: "google", hora: ev.diaTodo ? null : formatHora(ev.inicioIso), titulo: ev.titulo });
    }

    for (const lista of mapa.values()) {
      lista.sort((a, b) => {
        const horaA = a.tipo === "tarefa" ? "" : (a.hora ?? "");
        const horaB = b.tipo === "tarefa" ? "" : (b.hora ?? "");
        return horaA.localeCompare(horaB);
      });
    }

    return mapa;
  }, [dias, reunioes, eventosGoogle, eventosPessoais, tarefas, pessoas]);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">Calendário da semana</h2>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setOffsetSemana((v) => v - 1)} className="rounded-lg border border-border px-2.5 py-1 text-[12px] text-text-muted">
            ← Anterior
          </button>
          <button type="button" onClick={() => setOffsetSemana(0)} className="rounded-lg border border-border px-2.5 py-1 text-[12px] text-text-muted">
            Hoje
          </button>
          <button type="button" onClick={() => setOffsetSemana((v) => v + 1)} className="rounded-lg border border-border px-2.5 py-1 text-[12px] text-text-muted">
            Próxima →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {dias.map((d) => {
          const chave = chaveLocal(d);
          const itens = itensPorDia.get(chave) ?? [];
          const ehHoje = chave === hojeChave;
          return (
            <div key={chave} className={`rounded-lg border p-2.5 ${ehHoje ? "border-primary-fill bg-primary-soft/30" : "border-border-soft"}`}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-text-faint">{DIAS_SEMANA_CURTO[d.getDay()]}</span>
                <span className={`text-[12px] font-mono ${ehHoje ? "font-bold text-primary-deep" : "text-text-muted"}`}>{d.getDate()}</span>
              </div>
              <div className="flex flex-col gap-1">
                {itens.length === 0 && <span className="text-[10.5px] text-text-faint">—</span>}
                {itens.map((item, i) => <ItemChip key={i} item={item} />)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[10.5px] text-text-faint">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-wine-deep" /> Reunião
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#c9962c]" /> Tarefa
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-primary-fill" /> Google Calendar
        </span>
      </div>
    </div>
  );
}

function ItemChip({ item }: { item: ItemDia }) {
  if (item.tipo === "reuniao") {
    return (
      <div className="rounded bg-wine-deep/10 px-1.5 py-1 text-[10.5px] leading-tight text-wine">
        <span className="font-mono font-medium">{item.hora}</span> {item.titulo}
      </div>
    );
  }
  if (item.tipo === "tarefa") {
    return (
      <div className={`flex items-center gap-1 rounded bg-[#c9962c]/12 px-1.5 py-1 text-[10.5px] leading-tight text-[#8a6519] ${item.feita ? "opacity-50 line-through" : ""}`}>
        <span className="flex-1">{item.titulo}</span>
        {item.responsavelIniciais && <span className="shrink-0 font-medium">{item.responsavelIniciais}</span>}
      </div>
    );
  }
  return (
    <div className="rounded bg-primary-soft px-1.5 py-1 text-[10.5px] leading-tight text-primary-deep">
      {item.hora && <span className="font-mono font-medium">{item.hora} </span>}
      {item.titulo}
    </div>
  );
}
