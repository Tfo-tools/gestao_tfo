"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  criarTipoReuniao,
  alternarAtivoTipoReuniao,
  excluirTipoReuniao,
  criarRegraDisponibilidade,
  excluirRegraDisponibilidade,
  cancelarReuniao,
  type ActionState,
} from "./actions";
import type { EventoGoogle } from "@/lib/google-calendar";
import { ConexaoGoogleCard } from "@/components/conexao-google-card";
import { AtaInline, type Ata } from "./atas-manager";
import { CalendarioSemana, type TarefaComPrazo } from "./calendario-semana";

export type TipoReuniao = { id: string; nome: string; slug: string; duracao_minutos: number; descricao: string | null; ativo: boolean };
export type RegraDisponibilidade = { id: string; tipo_reuniao_id: string; dia_semana: number; hora_inicio: string; hora_fim: string };
export type ReuniaoAgendada = {
  id: string;
  data_hora_inicio: string;
  data_hora_fim: string;
  status: string;
  observacoes: string | null;
  tipos_reuniao: { nome: string } | null;
  contatos_externos: { nome: string; email: string; empresa: string | null } | null;
};

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const initialState: ActionState = { error: null };

function formatDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AgendaManager({
  tipos,
  regras,
  reunioes,
  reunioesParaCalendario,
  tarefas,
  contaConectada,
  eventosGoogle,
  contaPessoalConectada,
  eventosPessoais,
  atas,
  pessoas,
  iaConfigurada,
}: {
  tipos: TipoReuniao[];
  regras: RegraDisponibilidade[];
  reunioes: ReuniaoAgendada[];
  reunioesParaCalendario: ReuniaoAgendada[];
  tarefas: TarefaComPrazo[];
  contaConectada: string | null;
  eventosGoogle: EventoGoogle[];
  contaPessoalConectada: string | null;
  eventosPessoais: EventoGoogle[];
  atas: Ata[];
  pessoas: { id: string; nome: string }[];
  iaConfigurada: boolean;
}) {
  const ataPorReuniao = new Map(atas.filter((a) => a.reuniao_id).map((a) => [a.reuniao_id as string, a]));
  const ataPorEvento = new Map(atas.filter((a) => a.google_event_id).map((a) => [a.google_event_id as string, a]));

  return (
    <div className="flex flex-col gap-6">
      <CalendarioSemana
        reunioes={reunioesParaCalendario}
        eventosGoogle={eventosGoogle}
        eventosPessoais={eventosPessoais}
        tarefas={tarefas}
        pessoas={pessoas}
      />

      {!contaConectada && (
        <p className="text-[11.5px] text-text-muted">
          A agenda compartilhada (contato@) ainda não foi conectada —{" "}
          <a href="/configuracoes" className="font-medium text-primary-deep underline">
            conecte em Configurações
          </a>
          .
        </p>
      )}
      {contaConectada && (
        <CompromissosGoogleCard
          titulo="Compromissos na agenda compartilhada"
          explicacao="Tudo que já está marcado nos próximos 30 dias — é contra isso que os horários do agendamento público são calculados. Abra os detalhes de um compromisso pra ver ou adicionar a ata."
          eventos={eventosGoogle}
          ataPorEvento={ataPorEvento}
          pessoas={pessoas}
          iaConfigurada={iaConfigurada}
        />
      )}
      {contaPessoalConectada && (
        <CompromissosGoogleCard
          titulo="Seus compromissos"
          explicacao="Os próximos 30 dias da sua agenda pessoal."
          eventos={eventosPessoais}
          ataPorEvento={ataPorEvento}
          pessoas={pessoas}
          iaConfigurada={iaConfigurada}
        />
      )}

      <TiposReuniaoCard tipos={tipos} regras={regras} />
      <ProximasReunioesCard reunioes={reunioes} ataPorReuniao={ataPorReuniao} pessoas={pessoas} iaConfigurada={iaConfigurada} />

      <ConexaoPessoalColapsavel contaPessoalConectada={contaPessoalConectada} />
    </div>
  );
}

function ConexaoPessoalColapsavel({ contaPessoalConectada }: { contaPessoalConectada: string | null }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="font-heading text-sm font-semibold">Sua agenda pessoal (Google)</span>
        <span className="shrink-0 text-[12px] text-primary-deep">{aberto ? "Recolher ▲" : "Gerenciar ▾"}</span>
      </button>
      {aberto && (
        <div className="mt-4">
          <ConexaoGoogleCard
            titulo="Conexão com sua conta Google"
            explicacao="Conecte sua própria conta Google pra ver seus compromissos aqui — só leitura, isso nunca cria ou altera nada na sua agenda. A agenda compartilhada (contato@) fica em Configurações."
            contaConectada={contaPessoalConectada}
            linkConectar="/api/google/connect?tipo=pessoal"
          />
        </div>
      )}
    </div>
  );
}

function formatEventoData(iso: string, diaTodo: boolean) {
  if (diaTodo) return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  return new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Mostra o que já está de fato numa agenda Google conectada (compartilhada ou pessoal) — não só o
 * que foi marcado pelo link público (isso já aparece em "Próximas reuniões"), mas qualquer
 * compromisso que já existia ou foi criado direto no Google. Cada compromisso carrega seu próprio
 * campo de ata (não é mais uma lista separada). */
function CompromissosGoogleCard({
  titulo,
  explicacao,
  eventos,
  ataPorEvento,
  pessoas,
  iaConfigurada,
}: {
  titulo: string;
  explicacao: string;
  eventos: EventoGoogle[];
  ataPorEvento: Map<string, Ata>;
  pessoas: { id: string; nome: string }[];
  iaConfigurada: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-sm font-semibold">{titulo}</h2>
      <p className="mb-3 text-[11.5px] text-text-muted">{explicacao}</p>
      {eventos.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">Nenhum compromisso encontrado nos próximos 30 dias.</p>
      ) : (
        <div className="flex max-h-[400px] flex-col gap-1.5 overflow-y-auto">
          {eventos.map((ev) => (
            <EventoGoogleRow key={ev.id} evento={ev} ataExistente={ataPorEvento.get(ev.id) ?? null} pessoas={pessoas} iaConfigurada={iaConfigurada} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventoGoogleRow({
  evento,
  ataExistente,
  pessoas,
  iaConfigurada,
}: {
  evento: EventoGoogle;
  ataExistente: Ata | null;
  pessoas: { id: string; nome: string }[];
  iaConfigurada: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const temDetalhe = evento.descricao || evento.local || evento.convidados.length > 0;

  return (
    <div className="rounded-lg border border-border-soft px-3.5 py-2 text-[12px]">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-3 text-left">
        <span className="font-mono text-text-faint">{formatEventoData(evento.inicioIso, evento.diaTodo)}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{evento.titulo}</span>
        {evento.diaTodo && <span className="shrink-0 rounded bg-bg px-1.5 py-0.5 text-[9.5px] text-text-faint">Dia inteiro</span>}
        <span className="shrink-0 text-[10.5px] text-primary-deep">{aberto ? "▲" : "Detalhes ▾"}</span>
      </button>
      {aberto && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-border-soft pt-2 text-[11.5px]">
          {temDetalhe && (
            <>
              {evento.local && <p className="text-text-muted">📍 {evento.local}</p>}
              {evento.descricao && <p className="whitespace-pre-wrap text-text-muted">{evento.descricao}</p>}
              {evento.convidados.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {evento.convidados.map((c) => (
                    <span key={c.email} className="rounded-full bg-bg px-2 py-0.5 text-[10.5px] text-text-faint">
                      {c.nome ?? c.email}
                      {c.status === "accepted" && " ✓"}
                      {c.status === "declined" && " ✕"}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          <AtaInline
            chave={{ google_event_id: evento.id }}
            ataExistente={ataExistente}
            tituloSugerido={evento.titulo}
            dataSugerida={evento.inicioIso.slice(0, 10)}
            pessoas={pessoas}
            iaConfigurada={iaConfigurada}
          />
        </div>
      )}
    </div>
  );
}

function TiposReuniaoCard({ tipos, regras }: { tipos: TipoReuniao[]; regras: RegraDisponibilidade[] }) {
  const [mostrandoForm, setMostrandoForm] = useState(false);
  const [state, formAction, pending] = useActionState(criarTipoReuniao, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  if (state.success && mostrandoForm) {
    setMostrandoForm(false);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-heading text-sm font-semibold">Tipos de reunião</h2>
          <p className="mt-0.5 text-[11.5px] text-text-muted">Cada tipo tem sua duração e seus horários disponíveis próprios.</p>
        </div>
        {!mostrandoForm && (
          <button type="button" onClick={() => setMostrandoForm(true)} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white">
            + Novo tipo
          </button>
        )}
      </div>

      {mostrandoForm && (
        <form
          ref={formRef}
          action={async (fd) => {
            await formAction(fd);
            formRef.current?.reset();
          }}
          className="mb-4 flex flex-wrap items-end gap-2.5 rounded-lg border border-border-soft bg-bg p-4"
        >
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-[10.5px] text-text-faint">Nome</label>
            <input name="nome" type="text" placeholder="Ex: Reunião de diagnóstico" required className="input w-full" />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] text-text-faint">Duração (min)</label>
            <input name="duracao_minutos" type="number" min="5" step="5" defaultValue={30} required className="input w-[100px]" />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-[10.5px] text-text-faint">Descrição (opcional)</label>
            <input name="descricao" type="text" className="input w-full" />
          </div>
          <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">
            {pending ? "…" : "Salvar"}
          </button>
          <button type="button" onClick={() => setMostrandoForm(false)} className="rounded-lg border border-border px-3.5 py-2 text-[12px] text-text-muted">
            Cancelar
          </button>
          {state.error && <p className="w-full text-[11px] text-danger">{state.error}</p>}
        </form>
      )}

      {tipos.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">Nenhum tipo de reunião criado ainda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tipos.map((tipo) => (
            <TipoReuniaoRow key={tipo.id} tipo={tipo} regras={regras.filter((r) => r.tipo_reuniao_id === tipo.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TipoReuniaoRow({ tipo, regras }: { tipo: TipoReuniao; regras: RegraDisponibilidade[] }) {
  const [expandido, setExpandido] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const link = typeof window !== "undefined" ? `${window.location.origin}/agendar` : "/agendar";

  return (
    <div className="rounded-lg border border-border-soft">
      <div className="flex items-center justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold">{tipo.nome}</span>
            <span className="rounded bg-bg px-1.5 py-0.5 text-[9.5px] text-text-faint">{tipo.duracao_minutos} min</span>
            {!tipo.ativo && <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[9.5px] text-danger">Inativo</span>}
          </div>
          {tipo.descricao && <p className="mt-0.5 text-[11px] text-text-faint">{tipo.descricao}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <button type="button" onClick={() => setExpandido((v) => !v)} className="text-[11.5px] font-medium text-primary-deep">
            {expandido ? "Fechar" : "Horários"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => alternarAtivoTipoReuniao(tipo.id, !tipo.ativo))}
            className="text-[11.5px] font-medium text-text-muted disabled:opacity-50"
          >
            {tipo.ativo ? "Desativar" : "Ativar"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Excluir "${tipo.nome}"?`)) return;
              setErro(null);
              startTransition(async () => {
                const resultado = await excluirTipoReuniao(tipo.id);
                if (resultado.error) setErro(resultado.error);
              });
            }}
            className="text-[11.5px] font-medium text-danger disabled:opacity-50"
          >
            Excluir
          </button>
        </div>
      </div>
      {erro && <p className="px-3.5 pb-2 text-[10.5px] text-danger">{erro}</p>}

      {expandido && (
        <div className="border-t border-border-soft bg-bg p-4">
          <p className="mb-2.5 text-[11px] text-text-muted">
            Link público pra esse agendamento: <span className="font-mono text-text">{link}</span>
          </p>
          <RegrasDisponibilidade tipoReuniaoId={tipo.id} regras={regras} />
        </div>
      )}
    </div>
  );
}

function RegrasDisponibilidade({ tipoReuniaoId, regras }: { tipoReuniaoId: string; regras: RegraDisponibilidade[] }) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div>
      {regras.length === 0 ? (
        <p className="mb-2 text-[11.5px] text-text-faint">Nenhum horário definido — esse tipo não aparece pra agendamento ainda.</p>
      ) : (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {regras.map((r) => (
            <span key={r.id} className="flex items-center gap-1.5 rounded-full border border-border-soft bg-surface px-2.5 py-1 text-[11px]">
              {DIAS_SEMANA[r.dia_semana]} {r.hora_inicio.slice(0, 5)}–{r.hora_fim.slice(0, 5)}
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => excluirRegraDisponibilidade(r.id))}
                className="text-danger"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        ref={formRef}
        action={(fd) => {
          setErro(null);
          startTransition(async () => {
            const resultado = await criarRegraDisponibilidade(fd);
            if (resultado.error) setErro(resultado.error);
            else formRef.current?.reset();
          });
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="tipo_reuniao_id" value={tipoReuniaoId} />
        <div>
          <label className="mb-1 block text-[10px] text-text-faint">Dia</label>
          <select name="dia_semana" defaultValue="1" className="input w-[110px]">
            {DIAS_SEMANA.map((nome, i) => (
              <option key={i} value={i}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-faint">Das</label>
          <input name="hora_inicio" type="time" defaultValue="09:00" required className="input w-[100px]" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-faint">Até</label>
          <input name="hora_fim" type="time" defaultValue="18:00" required className="input w-[100px]" />
        </div>
        <button type="submit" disabled={pending} className="rounded-lg border border-border px-3 py-2 text-[11.5px] font-medium text-primary-deep disabled:opacity-60">
          + Horário
        </button>
      </form>
      {erro && <p className="mt-1.5 text-[10.5px] text-danger">{erro}</p>}
    </div>
  );
}

function ProximasReunioesCard({
  reunioes,
  ataPorReuniao,
  pessoas,
  iaConfigurada,
}: {
  reunioes: ReuniaoAgendada[];
  ataPorReuniao: Map<string, Ata>;
  pessoas: { id: string; nome: string }[];
  iaConfigurada: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-3 font-heading text-sm font-semibold">Próximas reuniões</h2>
      {reunioes.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">Nenhuma reunião marcada ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {reunioes.map((r) => (
            <div key={r.id} className="rounded-lg border border-border-soft px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-[12px]">
                  <span className="font-mono text-text-faint">{formatDataHora(r.data_hora_inicio)}</span>
                  <span className="ml-2 font-medium">{r.tipos_reuniao?.nome ?? "—"}</span>
                  <span className="ml-2 text-text-muted">
                    com {r.contatos_externos?.nome} ({r.contatos_externos?.email}
                    {r.contatos_externos?.empresa ? ` — ${r.contatos_externos.empresa}` : ""})
                  </span>
                  {r.observacoes && <p className="mt-0.5 text-[10.5px] text-text-faint">{r.observacoes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <AtaInline
                    chave={{ reuniao_id: r.id }}
                    ataExistente={ataPorReuniao.get(r.id) ?? null}
                    tituloSugerido={`${r.tipos_reuniao?.nome ?? "Reunião"} — ${r.contatos_externos?.nome ?? "—"}`}
                    dataSugerida={r.data_hora_inicio.slice(0, 10)}
                    pessoas={pessoas}
                    iaConfigurada={iaConfigurada}
                  />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm("Cancelar essa reunião?")) return;
                      setErro(null);
                      startTransition(async () => {
                        const resultado = await cancelarReuniao(r.id);
                        if (resultado.error) setErro(resultado.error);
                      });
                    }}
                    className="text-[11.5px] font-medium text-danger disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {erro && <p className="mt-2 text-[10.5px] text-danger">{erro}</p>}
    </div>
  );
}
