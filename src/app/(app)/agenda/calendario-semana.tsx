"use client";

import { useMemo, useState } from "react";
import { dataParaChaveSP } from "@/lib/agenda-slots";
import type { ReuniaoAgendada } from "./agenda-manager";
import type { EventoGoogle } from "@/lib/google-calendar";

export type TarefaComPrazo = {
  id: string;
  titulo: string;
  prazo: string;
  responsavel_id: string | null;
  /** Quem faz junto (tarefa "juntas" da rotina): o chip mostra "Tarefa V+E". */
  participantes?: string[] | null;
  status: string;
};

const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type ItemDia =
  | { tipo: "reuniao"; hora: string; titulo: string }
  | { tipo: "tarefa"; titulo: string; letra: string | null; cor: string; responsavelNome: string | null; feita: boolean }
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

/**
 * Cor e letra de cada pessoa nas tarefas do calendário: "Tarefa V", "Tarefa E". A letra é a inicial
 * do primeiro nome; se duas pessoas começarem igual, usa as iniciais do nome completo. A cor segue a
 * pessoa pela ordem do cadastro — não muda de uma semana pra outra.
 */
const CORES_PESSOA = ["#b0781a", "#1f7f73", "#6a52b0", "#b8456f"];

export function marcaDaPessoa(pessoas: { id: string; nome: string }[]) {
  const primeira = (n: string) => (n.trim()[0] ?? "?").toUpperCase();
  return new Map(
    pessoas.map((p, i) => {
      const repetida = pessoas.some((o) => o.id !== p.id && primeira(o.nome) === primeira(p.nome));
      return [p.id, { letra: repetida ? iniciais(p.nome) : primeira(p.nome), cor: CORES_PESSOA[i % CORES_PESSOA.length], nome: p.nome }];
    }),
  );
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

    const marcas = marcaDaPessoa(pessoas);
    for (const t of tarefas) {
      const marca = t.responsavel_id ? marcas.get(t.responsavel_id) : undefined;
      // Tarefa em conjunto: as letras de todas ("V+E"), na cor de quem é a responsável.
      const juntas = (t.participantes ?? []).map((id) => marcas.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
      add(t.prazo, {
        tipo: "tarefa",
        titulo: t.titulo,
        letra: marca ? [marca, ...juntas].map((m) => m.letra).join("+") : null,
        cor: marca?.cor ?? "#8a6519",
        responsavelNome: marca ? [marca, ...juntas].map((m) => m.nome.split(" ")[0]).join(" e ") : null,
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
        {[...marcaDaPessoa(pessoas).values()].map((m) => (
          <span key={m.letra} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: m.cor }} /> Tarefa {m.letra} ({m.nome.split(" ")[0]})
          </span>
        ))}
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
    // Compacto de propósito: no calendário a tarefa só marca presença ("Tarefa V"); o nome aparece ao
    // passar o mouse. Reunião segue com hora e título, que é o que importa ver de relance.
    return (
      <div
        tabIndex={0}
        title={`${item.titulo}${item.responsavelNome ? ` — ${item.responsavelNome}` : ""}`}
        className={`group relative w-fit rounded px-1.5 py-0.5 text-[10.5px] font-semibold leading-tight text-white outline-none ${item.feita ? "opacity-45 line-through" : ""}`}
        style={{ background: item.cor }}
      >
        Tarefa{item.letra ? ` ${item.letra}` : ""}
        <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-max max-w-[220px] rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-normal leading-snug text-text shadow-sm group-hover:block group-focus:block">
          {item.titulo}
          {item.responsavelNome && <span className="block text-[10px] text-text-faint">{item.responsavelNome}</span>}
        </span>
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
