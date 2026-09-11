"use client";

import { useActionState, useState } from "react";
import { criarCenario, type CenarioFormState } from "./actions";

type Cenario = { id: string; nome: string; is_base: boolean; data_inicio: string; data_fim: string };
type Programa = { id: string; nome: string; tipo: string };

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}
function maisAnos(mesIso: string, anos: number) {
  const [y, m] = mesIso.split("-").map(Number);
  return `${y + anos}-${String(m).padStart(2, "0")}`;
}
function formatMesAno(mesIso: string) {
  return new Date(`${mesIso}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

const TIPO_LABEL: Record<string, string> = {
  fomento: "Fomento",
  investimento: "Investimento",
  mutuo: "Mútuo conversível",
  emprestimo: "Empréstimo",
};

const initialState: CenarioFormState = { error: null };

export function NovoCenarioForm({
  cenarios,
  programas,
  programasPorCenario,
}: {
  cenarios: Cenario[];
  programas: Programa[];
  programasPorCenario: Record<string, string[]>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(criarCenario, initialState);
  const inicioPadrao = mesAtual();
  const [dataInicio, setDataInicio] = useState(inicioPadrao);
  const [dataFim, setDataFim] = useState(maisAnos(inicioPadrao, 5));
  // Se a pessoa já escolheu o período, espelhar um cenário não pode apagar a escolha dela — antes
  // o período era sempre sobrescrito pelo da origem, e o cenário nascia no tempo errado.
  const [periodoEditado, setPeriodoEditado] = useState(false);
  const [espelhoId, setEspelhoId] = useState("");
  const [programasMarcados, setProgramasMarcados] = useState<string[]>([]);

  const espelho = cenarios.find((c) => c.id === espelhoId) ?? null;

  function aoEscolherEspelho(cenarioId: string) {
    setEspelhoId(cenarioId);
    const origem = cenarios.find((c) => c.id === cenarioId);
    if (origem && !periodoEditado) {
      setDataInicio(origem.data_inicio.slice(0, 7));
      setDataFim(origem.data_fim.slice(0, 7));
    }
    // A captação que a origem já tem vem junto (desmarcável); o programa novo se soma a ela.
    setProgramasMarcados(origem ? (programasPorCenario[origem.id] ?? []) : []);
  }

  function alternarPrograma(id: string) {
    setProgramasMarcados((atual) => (atual.includes(id) ? atual.filter((p) => p !== id) : [...atual, id]));
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Novo cenário
      </button>
    );
  }

  const herdados = espelho ? (programasPorCenario[espelho.id] ?? []) : [];

  return (
    <div className="rounded-xl border border-primary-fill bg-surface p-6">
      <h2 className="mb-4 font-heading text-sm font-semibold">Novo cenário</h2>
      <form action={formAction} className="flex flex-col gap-3.5">
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Nome</label>
          <input
            name="nome"
            type="text"
            required
            className="input"
            placeholder="Ex: Com Aporte Fomento — Mar/2027"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Descrição</label>
          <input name="descricao" type="text" className="input" placeholder="O que muda nesse cenário" />
        </div>
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Espelhar cenário de</label>
          <p className="mb-1.5 text-[10.5px] text-text-faint">
            Copia tudo do cenário escolhido — produtos, planos e níveis, crescimento e churn (inclusive por trimestre), funil,
            canais, custos, COGS, metas e a captação vinculada — e já recalcula a projeção. Ajuste só o que muda a partir daí.
          </p>
          <select name="duplicar_de" className="input" value={espelhoId} onChange={(e) => aoEscolherEspelho(e.target.value)}>
            <option value="">Começar em branco</option>
            {cenarios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.is_base ? " (Plano base)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Início do plano</label>
            <input
              name="data_inicio"
              type="month"
              required
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value);
                setPeriodoEditado(true);
              }}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Fim do plano</label>
            <input
              name="data_fim"
              type="month"
              required
              value={dataFim}
              onChange={(e) => {
                setDataFim(e.target.value);
                setPeriodoEditado(true);
              }}
              className="input"
            />
          </div>
        </div>
        <p className="-mt-2 text-[10.5px] text-text-faint">
          {espelho && dataInicio
            ? `O cenário é calculado e apresentado a partir de ${formatMesAno(dataInicio)}, abrindo com os clientes que "${espelho.nome}" tem nesse ponto (dá pra editar depois, em Vendas → Ponto de partida).`
            : "Horizonte recomendado: pelo menos 5 anos — dá margem pra projetar break-even, captações e retorno pro investidor."}
        </p>
        <div>
          <label className="mb-1.5 block text-[11.5px] font-medium text-text-muted">Programas de investimento (opcional)</label>
          <p className="mb-1.5 text-[10.5px] text-text-faint">
            Marque a captação que já existe e a nova. Todos entram na linha de aportes; o retorno é calculado só sobre o
            investimento novo, que ainda não está aplicado (fomento não entra no retorno). Cadastre o programa primeiro em
            Captação de Investimentos e Fomentos, se ainda não tiver.
          </p>
          {programas.length === 0 ? (
            <p className="text-[11.5px] text-text-faint">Nenhum programa cadastrado.</p>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border-soft p-2.5">
              {programas.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    name="programa_id"
                    value={p.id}
                    checked={programasMarcados.includes(p.id)}
                    onChange={() => alternarPrograma(p.id)}
                  />
                  {p.nome} <span className="text-text-faint">({TIPO_LABEL[p.tipo] ?? p.tipo})</span>
                  {herdados.includes(p.id) && <span className="text-[10.5px] text-text-faint">— já vinculado a {espelho?.nome}</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        {state.error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>
        )}

        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-wine-deep px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Criando e calculando…" : "Criar cenário"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-muted"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
