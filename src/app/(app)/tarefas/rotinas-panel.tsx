"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { SecaoRecolhivel } from "@/components/secao-recolhivel";
import { alternarRotina, criarRotina, excluirRotina, type RotinaFormState } from "./rotinas-actions";
import { LABEL_FREQUENCIA, ROTINAS_SUGERIDAS, descreverFrequencia, type Frequencia, type Rotina } from "@/lib/rotinas";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const initialState: RotinaFormState = { error: null };

const dataCurta = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—";

type Rascunho = { titulo: string; descricao: string; frequencia: Frequencia; dia_semana: number; dia_mes: number; mes_inicio: number };
const VAZIO: Rascunho = { titulo: "", descricao: "", frequencia: "mensal", dia_semana: 1, dia_mes: 5, mes_inicio: 1 };

/**
 * Rotina de gestão em grade compacta, recolhida atrás de um "+". As sugestões só preenchem o
 * formulário — nada é criado sem a sócia confirmar.
 */
export function RotinasPanel({
  rotinas,
  pessoas,
  proximas,
}: {
  rotinas: Rotina[];
  pessoas: { id: string; nome: string }[];
  /** Próxima data de cada rotina ativa (calculada no servidor, pela data de São Paulo). */
  proximas: Record<string, string | null>;
}) {
  const [state, formAction, pending] = useActionState(criarRotina, initialState);
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO);
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [mexendo, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const ativas = rotinas.filter((r) => r.ativo);
  const semana = rascunho.frequencia === "semanal" || rascunho.frequencia === "quinzenal";
  const comMes = rascunho.frequencia === "trimestral" || rascunho.frequencia === "anual";
  const jaTem = new Set(rotinas.map((r) => r.titulo.toLowerCase()));
  const sugestoes = ROTINAS_SUGERIDAS.filter((s) => !jaTem.has(s.titulo.toLowerCase()));
  const nomeDe = (id: string | null) => pessoas.find((p) => p.id === id)?.nome.split(" ")[0] ?? "—";

  const usarSugestao = (s: (typeof ROTINAS_SUGERIDAS)[number]) => {
    setRascunho({
      titulo: s.titulo,
      descricao: s.descricao ?? "",
      frequencia: s.frequencia,
      dia_semana: s.dia_semana ?? 1,
      dia_mes: s.dia_mes ?? 5,
      mes_inicio: s.mes_inicio ?? 1,
    });
    setVersao((v) => v + 1);
  };

  return (
    <SecaoRecolhivel
      titulo="Rotina de gestão"
      resumo={ativas.length > 0 ? `${ativas.length} ativa${ativas.length === 1 ? "" : "s"} · cada ocorrência vira tarefa 14 dias antes` : "tarefas recorrentes pra agir antes do problema"}
      tooltip="Calendário fixo: a tarefa nasce na data dela mesmo que a anterior esteja atrasada — a atrasada fica destacada. Cada ocorrência aparece 14 dias antes do vencimento, com a etiqueta “rotina”, na lista, no calendário da agenda e no resumo da manhã."
    >
      <div className="p-4">
        {rotinas.length > 0 && (
          <table className="mb-4 w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[10.5px] text-text-faint">
                <th className="px-2 pb-1.5 font-medium">Rotina</th>
                <th className="px-2 pb-1.5 font-medium">Quando</th>
                <th className="px-2 pb-1.5 font-medium">Responsável</th>
                <th className="px-2 pb-1.5 font-medium">Próxima</th>
                <th className="px-2 pb-1.5" />
              </tr>
            </thead>
            <tbody>
              {rotinas.map((r) => (
                <tr key={r.id} className={`border-t border-border-soft ${r.ativo ? "" : "opacity-50"}`}>
                  <td className="px-2 py-1.5 font-medium">
                    {r.titulo}
                    {r.descricao && <span className="block text-[10.5px] font-normal text-text-faint">{r.descricao}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-text-muted">{descreverFrequencia(r)}</td>
                  <td className="px-2 py-1.5 text-text-muted">{nomeDe(r.responsavel_id)}</td>
                  <td className="px-2 py-1.5 font-mono text-text-muted">{r.ativo ? dataCurta(proximas[r.id] ?? null) : "pausada"}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <button
                      type="button"
                      disabled={mexendo}
                      onClick={() => startTransition(async () => setErro((await alternarRotina(r.id, !r.ativo)).error))}
                      className="mr-3 text-[11px] font-medium text-text-muted"
                    >
                      {r.ativo ? "Pausar" : "Retomar"}
                    </button>
                    <button
                      type="button"
                      disabled={mexendo}
                      onClick={() => {
                        if (!confirm(`Excluir a rotina "${r.titulo}"? As tarefas abertas dela saem junto; as já feitas ficam como histórico.`)) return;
                        startTransition(async () => setErro((await excluirRotina(r.id)).error));
                      }}
                      className="text-[11px] font-medium text-danger"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Linha de cadastro: tudo numa faixa só, sem card por rotina. */}
        <form
          key={versao}
          ref={formRef}
          action={async (fd) => {
            await formAction(fd);
            setRascunho(VAZIO);
            setVersao((v) => v + 1);
          }}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-border-soft bg-bg p-3"
        >
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-[10px] text-text-faint">Nova rotina</label>
            <input name="titulo" defaultValue={rascunho.titulo} placeholder="Ex: Revisar caixa real × plano" required className="input w-full" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-text-faint">Frequência</label>
            <select
              name="frequencia"
              value={rascunho.frequencia}
              onChange={(e) => setRascunho((r) => ({ ...r, frequencia: e.target.value as Frequencia }))}
              className="input w-[120px]"
            >
              {(Object.keys(LABEL_FREQUENCIA) as Frequencia[]).map((f) => (
                <option key={f} value={f}>
                  {LABEL_FREQUENCIA[f]}
                </option>
              ))}
            </select>
          </div>
          {semana ? (
            <div>
              <label className="mb-1 block text-[10px] text-text-faint">Dia da semana</label>
              <select name="dia_semana" defaultValue={rascunho.dia_semana} className="input w-[115px]">
                {DIAS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[10px] text-text-faint">Dia do mês</label>
              <input name="dia_mes" type="number" min={1} max={31} defaultValue={rascunho.dia_mes} className="input w-[80px]" />
            </div>
          )}
          {comMes && (
            <div>
              <label className="mb-1 block text-[10px] text-text-faint">{rascunho.frequencia === "anual" ? "Mês" : "A partir de"}</label>
              <select name="mes_inicio" defaultValue={rascunho.mes_inicio} className="input w-[120px]">
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-[10px] text-text-faint">Responsável</label>
            <select name="responsavel_id" defaultValue="" className="input w-[130px]">
              <option value="">—</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome.split(" ")[0]}
                </option>
              ))}
            </select>
          </div>
          <input type="hidden" name="descricao" value={rascunho.descricao} />
          <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">
            {pending ? "…" : "+ Rotina"}
          </button>
        </form>
        {(state.error || erro) && <p className="mt-1.5 text-[11px] text-danger">{state.error ?? erro}</p>}

        {sugestoes.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[10.5px] text-text-faint">Sugestões — clique pra preencher o formulário:</p>
            <div className="flex flex-wrap gap-1.5">
              {sugestoes.map((s) => (
                <button
                  key={s.titulo}
                  type="button"
                  onClick={() => usarSugestao(s)}
                  className="rounded-full border border-border-soft px-2.5 py-1 text-[11px] text-text-muted hover:border-primary-fill hover:text-primary-deep"
                  title={`${descreverFrequencia(s)} — ${s.descricao}`}
                >
                  {s.titulo}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </SecaoRecolhivel>
  );
}
