"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { criarAlocacaoModelo, excluirAlocacaoModelo, type ActionState } from "./actions";
import { custoMensalModelo, type ParametrosModelo, type TipoModelo } from "@/lib/modelos-contratacao";
import type { MesDemandaCargo } from "@/lib/necessidade-contratacao";
import { InfoTooltip } from "@/components/info-tooltip";

type Modelo = { id: string; cargo: string; tipo_modelo: string; nome: string; parametros: ParametrosModelo };
type Alocacao = { id: string; cargo: string; modelo_id: string; quantidade: number; data_inicio: string | null; data_fim: string | null };

const initialState: ActionState = { error: null };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function formatMes(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}
function normalizar(s: string) {
  return s.trim().toLowerCase();
}
function ativaNoMes(a: Alocacao, mesIso: string): boolean {
  const mes = new Date(mesIso + "T00:00:00");
  const inicio = a.data_inicio ? new Date(a.data_inicio + "T00:00:00") : null;
  const fim = a.data_fim ? new Date(a.data_fim + "T00:00:00") : null;
  const iniciouAntes = !inicio || new Date(inicio.getFullYear(), inicio.getMonth(), 1) <= mes;
  const aindaAtiva = !fim || fim >= mes;
  return iniciouAntes && aindaAtiva;
}

const CARGOS: { chave: "sdr" | "coordenador" | "suporte"; label: string; unidade: string }[] = [
  { chave: "sdr", label: "SDR", unidade: "contatos/mês" },
  { chave: "coordenador", label: "Coordenador", unidade: "vendedores supervisionados" },
  { chave: "suporte", label: "Suporte", unidade: "horas/mês" },
];

export function NecessidadeTabelas({
  cenarioId,
  demanda,
  modelos,
  alocacoes,
}: {
  cenarioId: string;
  demanda: { sdr: MesDemandaCargo[]; coordenador: MesDemandaCargo[]; suporte: MesDemandaCargo[] };
  modelos: Modelo[];
  alocacoes: Alocacao[];
}) {
  const [ativo, setAtivo] = useState<"sdr" | "coordenador" | "suporte">("sdr");
  const cargoAtual = CARGOS.find((c) => c.chave === ativo)!;
  const linhas = demanda[ativo];

  const modelosDoCargo = useMemo(
    () => modelos.filter((m) => normalizar(m.cargo) === normalizar(cargoAtual.label)),
    [modelos, cargoAtual],
  );
  const alocacoesDoCargo = useMemo(
    () => alocacoes.filter((a) => normalizar(a.cargo) === normalizar(cargoAtual.label)),
    [alocacoes, cargoAtual],
  );

  const linhasRelevantes = useMemo(() => {
    const primeiro = linhas.findIndex((l) => l.demanda > 0.001);
    if (primeiro === -1) return [];
    return linhas.slice(primeiro);
  }, [linhas]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        {CARGOS.map((c) => (
          <button
            key={c.chave}
            type="button"
            onClick={() => setAtivo(c.chave)}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium ${
              ativo === c.chave ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border text-text-muted"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center font-heading text-sm font-semibold">
            Demanda de {cargoAtual.label}
            <InfoTooltip texto={`Demanda mensal em ${cargoAtual.unidade}, calculada a partir do crescimento de clientes e das premissas de Funil. As colunas seguintes mostram quanto custaria cobrir essa demanda com cada modelo cadastrado para este cargo.`} />
          </h2>
        </div>
        {linhasRelevantes.length === 0 ? (
          <p className="mt-3 text-[12px] text-text-faint">
            Sem demanda calculada — confira as premissas de {cargoAtual.label} em Funil.
          </p>
        ) : modelosDoCargo.length === 0 ? (
          <div className="mt-3">
            <p className="text-[12px] text-text-faint">
              Nenhum modelo cadastrado pra {cargoAtual.label} ainda —{" "}
              <a href="/contratacoes/modelos" className="text-primary-deep underline">
                cadastre um modelo
              </a>{" "}
              pra ver o custo comparado.
            </p>
          </div>
        ) : (
          <div className="mt-4 max-h-[420px] overflow-y-auto overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-text-muted">
                  <td className="px-2 py-1.5 font-medium">Mês</td>
                  <td className="px-2 py-1.5 text-right font-medium">Demanda</td>
                  {modelosDoCargo.map((m) => (
                    <td key={m.id} className="px-2 py-1.5 text-right font-medium">
                      {m.nome}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-medium">Alocado</td>
                </tr>
              </thead>
              <tbody>
                {linhasRelevantes.map((l) => {
                  // Modelos discretos (CLT/pacote fechado) contam pela capacidade que a quantidade
                  // escolhida cobre; modelos por demanda (PJ/créditos/híbrido) já cobrem a demanda
                  // real do mês inteira, por definição — mostramos a própria demanda coberta.
                  const alocado = alocacoesDoCargo
                    .filter((a) => ativaNoMes(a, l.mes_referencia))
                    .reduce((acc, a) => {
                      const modelo = modelosDoCargo.find((m) => m.id === a.modelo_id);
                      if (modelo && precisaQuantidade(modelo.tipo_modelo)) {
                        return acc + a.quantidade * (modelo.parametros.capacidade_unidade_mes ?? 1);
                      }
                      return acc + l.demanda;
                    }, 0);
                  return (
                    <tr key={l.mes_referencia} className="border-t border-border-soft">
                      <td className="px-2 py-1.5 capitalize">{formatMes(l.mes_referencia)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{l.demanda.toFixed(1)}</td>
                      {modelosDoCargo.map((m) => {
                        const { custoMensal } = custoMensalModelo(m.tipo_modelo as TipoModelo, m.parametros, l.demanda);
                        return (
                          <td key={m.id} className="px-2 py-1.5 text-right font-mono">
                            {formatBRL(custoMensal)}
                          </td>
                        );
                      })}
                      <td className={`px-2 py-1.5 text-right font-mono ${alocado > 0 ? "text-success" : "text-text-faint"}`}>
                        {alocado > 0 ? alocado.toFixed(1) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AlocacaoModelo cenarioId={cenarioId} cargo={cargoAtual.label} modelos={modelosDoCargo} alocacoes={alocacoesDoCargo} />
    </div>
  );
}

// CLT e pacote fechado (empresa_fixo_escopo) são decisões discretas — "quantas pessoas/pacotes eu
// contratei" é uma escolha real seu, o custo é esse independente da demanda flutuar. PJ e os
// modelos pay-per-use (créditos/híbrido) já são cobrados pela demanda real calculada mês a mês —
// pedir uma "quantidade" fixa nesses não faz sentido, o sistema usa a demanda automaticamente.
function precisaQuantidade(tipo: string): boolean {
  return tipo === "clt" || tipo === "empresa_fixo_escopo";
}

function AlocacaoModelo({
  cenarioId,
  cargo,
  modelos,
  alocacoes,
}: {
  cenarioId: string;
  cargo: string;
  modelos: Modelo[];
  alocacoes: Alocacao[];
}) {
  const [state, formAction, pending] = useActionState(criarAlocacaoModelo, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const modeloById = new Map(modelos.map((m) => [m.id, m]));
  const [modeloSelecionadoId, setModeloSelecionadoId] = useState("");
  const modeloSelecionado = modeloById.get(modeloSelecionadoId);
  const mostraQuantidade = !modeloSelecionado || precisaQuantidade(modeloSelecionado.tipo_modelo);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 flex items-center font-heading text-sm font-semibold">
        Alocação escolhida — {cargo}
        <InfoTooltip texto="Registre aqui qual modelo você decidiu usar de fato e por quanto tempo — isso alimenta a coluna 'Alocado' acima e entra no custo real da projeção (EBITDA/CAC). Em CLT e pacote fechado você escolhe quantas unidades; em PJ e modelos pay-per-use o custo já segue a demanda calculada automaticamente, mês a mês." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">O que você realmente vai usar em cada período, depois de comparar os modelos</p>

      <div className="mb-4 flex flex-col gap-1.5">
        {alocacoes.length === 0 && <p className="text-[12px] text-text-faint">Nenhuma alocação registrada pra {cargo} ainda.</p>}
        {alocacoes.map((a) => {
          const modelo = modeloById.get(a.modelo_id);
          const usaQuantidade = modelo ? precisaQuantidade(modelo.tipo_modelo) : true;
          return (
            <div key={a.id} className="flex items-center justify-between rounded-md border border-border-soft px-2.5 py-2">
              <span className="text-[12px]">
                {usaQuantidade ? `${a.quantidade}× ` : ""}
                {modelo?.nome ?? "modelo removido"}
                {!usaQuantidade && " (demanda automática)"} · {a.data_inicio ?? "início aberto"} → {a.data_fim ?? "sem fim"}
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => excluirAlocacaoModelo(a.id))}
                className="text-[11px] text-danger"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {modelos.length === 0 ? (
        <p className="text-[12px] text-text-faint">Cadastre um modelo pra {cargo} antes de alocar.</p>
      ) : (
        <form
          ref={formRef}
          action={async (fd) => {
            await formAction(fd);
            formRef.current?.reset();
            setModeloSelecionadoId("");
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="cenario_id" value={cenarioId} />
          <input type="hidden" name="cargo" value={cargo} />
          <select
            name="modelo_id"
            className="input min-w-[160px] flex-1"
            value={modeloSelecionadoId}
            onChange={(e) => setModeloSelecionadoId(e.target.value)}
            required
          >
            <option value="" disabled>
              Modelo…
            </option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          {mostraQuantidade ? (
            <input name="quantidade" type="number" min="1" defaultValue={1} placeholder="Qtd." className="input w-[70px]" required />
          ) : (
            <input type="hidden" name="quantidade" value={1} />
          )}
          <div>
            <label className="mb-0.5 block text-[9.5px] text-text-faint">Início</label>
            <input name="data_inicio" type="date" className="input w-[130px]" />
          </div>
          <div>
            <label className="mb-0.5 block text-[9.5px] text-text-faint">Fim (opcional)</label>
            <input name="data_fim" type="date" className="input w-[130px]" />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-60"
          >
            {pending ? "…" : "+ Alocar"}
          </button>
        </form>
      )}
      {modeloSelecionado && !mostraQuantidade && (
        <p className="mt-2 text-[11px] text-text-faint">
          Esse modelo cobra pela demanda real de {cargo.toLowerCase()} calculada mês a mês — não precisa informar quantidade, o sistema
          ajusta o custo sozinho dentro do período escolhido.
        </p>
      )}
      {state.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}
