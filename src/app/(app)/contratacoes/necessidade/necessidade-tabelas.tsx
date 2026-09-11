"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { criarAlocacaoModelo, editarAlocacaoModelo, excluirAlocacaoModelo, type ActionState } from "./actions";
import { leadsParaReunioes, volumeCobertoPelaAlocacao } from "@/lib/modelos-contratacao";
import { custoMensalModelo, type ParametrosModelo, type TipoModelo } from "@/lib/modelos-contratacao";
import { cargoChave, type MesDemandaCargo } from "@/lib/necessidade-contratacao";
import { InfoTooltip } from "@/components/info-tooltip";

type Modelo = { id: string; cargo: string; tipo_modelo: string; nome: string; parametros: ParametrosModelo };
type Alocacao = { id: string; cargo: string; modelo_id: string; quantidade: number; data_inicio: string | null; data_fim: string | null };

const initialState: ActionState = { error: null };

function num(v: number, casas = 1) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
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

/** Como chamar a "unidade" de cada modelo — 3 pessoas, 2 pacotes, 1 assinatura. */
const UNIDADE_LABEL: Record<string, string> = {
  clt: "pessoa", pj: "PJ", empresa_fixo_escopo: "pacote",
  empresa_hibrido: "contrato", empresa_creditos: "contrato", empresa_ia_atendimento: "assinatura",
};
const UNIDADE_PLURAL: Record<string, string> = {
  clt: "pessoas", pj: "PJs", empresa_fixo_escopo: "pacotes",
  empresa_hibrido: "contratos", empresa_creditos: "contratos", empresa_ia_atendimento: "assinaturas",
};

const CARGOS: { chave: "sdr" | "vendedor" | "coordenador" | "suporte"; label: string; unidade: string }[] = [
  { chave: "sdr", label: "SDR", unidade: "reuniões a agendar/mês" },
  { chave: "vendedor", label: "Vendedor", unidade: "vendedores necessários" },
  { chave: "coordenador", label: "Coordenador", unidade: "coordenadores necessários" },
  { chave: "suporte", label: "Suporte", unidade: "horas/mês" },
];

export function NecessidadeTabelas({
  cenarioId,
  demanda,
  modelos,
  alocacoes,
  mesesSemQualificacao,
  cargoInicial = "sdr",
}: {
  cenarioId: string;
  demanda: {
    sdr: MesDemandaCargo[];
    vendedor: MesDemandaCargo[];
    coordenador: MesDemandaCargo[];
    suporte: MesDemandaCargo[];
    oportunidades: MesDemandaCargo[];
    oportunidadesDireto: MesDemandaCargo[];
  };
  modelos: Modelo[];
  alocacoes: Alocacao[];
  mesesSemQualificacao: string[];
  cargoInicial?: "sdr" | "vendedor" | "coordenador" | "suporte";
}) {
  const [ativo, setAtivo] = useState<"sdr" | "vendedor" | "coordenador" | "suporte">(cargoInicial);
  const cargoAtual = CARGOS.find((c) => c.chave === ativo)!;
  const linhas = demanda[ativo];

  const modelosDoCargo = useMemo(
    () => modelos.filter((m) => cargoChave(m.cargo) === ativo),
    [modelos, cargoAtual],
  );
  const alocacoesDoCargo = useMemo(
    () => alocacoes.filter((a) => cargoChave(a.cargo) === ativo),
    [alocacoes, cargoAtual],
  );

  const linhasRelevantes = useMemo(() => {
    const primeiro = linhas.findIndex((l) => l.demanda > 0.001);
    if (primeiro === -1) return [];
    return linhas.slice(primeiro);
  }, [linhas]);

  const oportunidadesPorMes = useMemo(
    () => new Map(demanda.oportunidades.map((d) => [d.mes_referencia, d.demanda])),
    [demanda.oportunidades],
  );
  // Só as reuniões vindas do canal direto dimensionam o SDR — as de parceiro chegam prontas.
  const oportunidadesDiretoPorMes = useMemo(
    () => new Map(demanda.oportunidadesDireto.map((d) => [d.mes_referencia, d.demanda])),
    [demanda.oportunidadesDireto],
  );

  return (
    <div className="flex flex-col gap-5">
      {mesesSemQualificacao.length > 0 && (
        <div className="rounded-lg border border-dashed border-danger bg-danger-soft px-4 py-3 text-[12px] text-danger">
          <strong>Falta a taxa de qualificação (lead → oportunidade)</strong> em {mesesSemQualificacao.length} mês(es).
          Sem ela o app assume que todo lead vira reunião, e o custo de SDR sai muito abaixo do real. A taxa é do{" "}
          <strong>modelo de contratação</strong> vinculado ao canal direto — preencha em{" "}
          <a href="/contratacoes/modelos" className="underline">
            Contratações → Modelos de Contratação
          </a>
          .
        </div>
      )}

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

      {ativo === "suporte" && (
        <div className="rounded-lg border border-dashed border-border bg-bg px-4 py-2.5 text-[11.5px] text-text-muted">
          <strong>O custo do suporte não sai daqui.</strong> Ele vem das regras de COGS de cada produto (Plano de Custos → CSP → 1.1.3):
          horas por cliente × custo/hora do perfil escolhido, a partir da data configurada lá. Esta aba mostra quantas horas a base exige
          e quantas pessoas isso dá — a alocação aqui é só pra dimensionar, não gera custo.
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center font-heading text-sm font-semibold">
            {ativo === "sdr" ? "Reuniões a agendar e custo por modelo de SDR" : `Demanda de ${cargoAtual.label}`}
            <InfoTooltip
              texto={
                ativo === "sdr"
                  ? "Reuniões necessárias = clientes da meta que vêm do canal direto ÷ taxa de fechamento daquele canal. É o número fixo do mês, independente de quem prospecta (parceiro traz relação pronta e por isso fica de fora). Cada coluna de modelo mostra quantos LEADS aquele modelo precisa trabalhar pra entregar essas reuniões — leads = reuniões ÷ taxa de qualificação dele — e quanto isso custa."
                  : `Demanda mensal em ${cargoAtual.unidade}, calculada a partir do crescimento de clientes e das premissas de Funil. As colunas seguintes mostram quanto custaria cobrir essa demanda com cada modelo cadastrado para este cargo.`
              }
            />
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
                  <td className="px-2 py-1.5 text-right font-medium">
                    {ativo === "sdr" ? "Reuniões a agendar" : `Demanda (${cargoAtual.unidade})`}
                  </td>
                  {ativo === "vendedor" && (
                    <td className="px-2 py-1.5 text-right font-medium">
                      <span className="flex items-center justify-end">
                        Reuniões a atender
                        <InfoTooltip texto="Todas as reuniões do mês, de qualquer canal, já contando as reuniões extras que produtos de ciclo mais longo pedem. Dividido pela capacidade de um vendedor (definida em Produtos → Funil), dá quantos vendedores o mês exige. Enquanto o número for menor que 1, você e sua sócia dão conta; quando passa de 1, é hora de avaliar a contratação — considerando que a agenda de vocês também precisa sobrar para gerir o negócio." />
                      </span>
                    </td>
                  )}
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
                      if (!modelo) return acc;
                      // Quantidade limita o que cada alocação cobre; o que falta é esforço próprio.
                      return acc + volumeCobertoPelaAlocacao(modelo.tipo_modelo as TipoModelo, modelo.parametros, a.quantidade, l.demanda).cobrado;
                    }, 0);
                  const esforcoProprio = Math.max(0, l.demanda - alocado);
                  return (
                    <tr key={l.mes_referencia} className="border-t border-border-soft">
                      <td className="px-2 py-1.5 capitalize">{formatMes(l.mes_referencia)}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold">
                        {l.demanda.toFixed(1)}
                        {ativo === "vendedor" && l.demanda > 1 && (
                          <span className="block text-[9px] font-normal text-warning">passa de 1 pessoa</span>
                        )}
                      </td>
                      {ativo === "vendedor" && (
                        <td className="px-2 py-1.5 text-right font-mono text-text-muted">
                          {(oportunidadesPorMes.get(l.mes_referencia) ?? 0).toFixed(1)}
                        </td>
                      )}
                      {modelosDoCargo.map((m) => {
                        // Cada modelo é cobrado pelo volume que ELE precisa trabalhar: qualificação
                        // menor = mais leads pras mesmas reuniões = mais caro num contrato por
                        // demanda. Antes todos apareciam com a mesma demanda e o pior parecia barato.
                        // SDR agenda só as reuniões do canal direto; o vendedor atende as de todos.
                        const reunioes =
                          ativo === "vendedor"
                            ? (oportunidadesPorMes.get(l.mes_referencia) ?? 0)
                            : (oportunidadesDiretoPorMes.get(l.mes_referencia) ?? 0);
                        // A demanda JÁ ESTÁ na unidade do cargo (reuniões para SDR, vendedores para
                        // vendedor). Quem cobra por lead converte internamente pela própria
                        // eficiência — converter aqui de novo multiplicava o custo por ~200x.
                        const { custoMensal, unidades } = custoMensalModelo(
                          m.tipo_modelo as TipoModelo,
                          m.parametros,
                          l.demanda,
                          { reunioes: ativo === "sdr" || ativo === "vendedor" ? reunioes : undefined },
                        );
                        const capacidade = m.parametros.capacidade_unidade_mes ?? 0;
                        // O que você contrata pode ser maior do que o que precisa: pacotes vêm em
                        // unidades inteiras. "100 reuniões pelo preço de 200" é este excedente.
                        const capacidadeContratada = unidades > 0 && capacidade > 0 ? unidades * capacidade : 0;
                        const ocioso = capacidadeContratada > 0 && capacidadeContratada - l.demanda > 0.05;
                        return (
                          <td key={m.id} className="px-2 py-1.5 text-right font-mono">
                            {formatBRL(custoMensal)}
                            {unidades > 0 && (
                              <span className="block text-[9px] font-normal text-text-faint">
                                {num(unidades, 0)} {unidades === 1 ? UNIDADE_LABEL[m.tipo_modelo] ?? "un." : (UNIDADE_PLURAL[m.tipo_modelo] ?? "un.")}
                                {capacidadeContratada > 0 && ` · cobre ${num(capacidadeContratada, 0)}`}
                              </span>
                            )}
                            {ocioso && (
                              <span className="block text-[9px] font-normal text-warning">
                                paga por {num(capacidadeContratada, 0)}, usa {num(l.demanda, 0)}
                              </span>
                            )}
                            {ativo === "sdr" && m.parametros.taxa_qualificacao ? (
                              <span className="block text-[9px] font-normal text-text-faint">
                                {num(leadsParaReunioes(m.parametros, reunioes), 0)} leads · {(m.parametros.taxa_qualificacao * 100).toFixed(1)}%
                              </span>
                            ) : null}
                          </td>
                        );
                      })}
                      <td className={`px-2 py-1.5 text-right font-mono ${alocado > 0 ? "text-success" : "text-text-faint"}`}>
                        {alocado > 0 ? alocado.toFixed(1) : "—"}
                        {alocado > 0 && esforcoProprio > 0.05 && (
                          <span className="block text-[9px] font-normal text-text-faint">+{esforcoProprio.toFixed(1)} esforço próprio</span>
                        )}
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

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 flex items-center font-heading text-sm font-semibold">
        Alocação escolhida — {cargo}
        <InfoTooltip texto="Registre qual modelo você decidiu usar, quantas unidades e por quanto tempo — isso alimenta a coluna 'Alocado' e entra no custo real da projeção (EBITDA/CAC). A quantidade é sempre sua: em CLT e pacote fechado é o que você contratou (paga mesmo se sobrar); em PJ, agência e bot é o teto do que aquele modelo cobre — o que a meta pedir além disso aparece como 'esforço próprio' e não gera custo. Assim dá pra ter 1 SDR captando e o resto ser você e sua sócia." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">O que você realmente vai usar em cada período, depois de comparar os modelos</p>

      <div className="mb-4 flex flex-col gap-1.5">
        {alocacoes.length === 0 && <p className="text-[12px] text-text-faint">Nenhuma alocação registrada pra {cargo} ainda.</p>}
        {alocacoes.map((a) => (
          <LinhaAlocacao
            key={a.id}
            alocacao={a}
            modelo={modeloById.get(a.modelo_id)}
            excluir={() => startTransition(() => excluirAlocacaoModelo(a.id))}
            excluindo={isPending}
          />
        ))}
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
          <div>
            <label className="mb-0.5 block text-[9.5px] text-text-faint">
              {modeloSelecionado && !precisaQuantidade(modeloSelecionado.tipo_modelo) ? "Qtd. (0 = demanda)" : "Qtd."}
            </label>
            <input
              key={modeloSelecionadoId}
              name="quantidade"
              type="number"
              min="0"
              step="1"
              defaultValue={modeloSelecionado && !precisaQuantidade(modeloSelecionado.tipo_modelo) ? 0 : 1}
              className="input w-[110px]"
              required
            />
          </div>
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
      {modeloSelecionado && !precisaQuantidade(modeloSelecionado.tipo_modelo) && (
        <p className="mt-2 text-[11px] text-text-faint">
          Modelo cobrado pelo volume trabalhado. <strong>Quantidade 0 = acompanha a demanda</strong>: uma alocação só, sem data fim, cobre
          todos os meses e o custo segue o volume de cada um. Quantidade maior que 0 vira teto —{" "}
          {modeloSelecionado.parametros.capacidade_unidade_mes ?? "?"} {cargoChave(cargo) === "sdr" ? "reuniões" : "unidades"}/mês por unidade —
          e o que passar fica como esforço próprio, sem custo.
        </p>
      )}
      {state.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}


/** Uma alocação registrada, editável no lugar: muda quantidade e datas sem apagar e recriar. */
function LinhaAlocacao({ alocacao: a, modelo, excluir, excluindo }: { alocacao: Alocacao; modelo?: Modelo; excluir: () => void; excluindo: boolean }) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(editarAlocacaoModelo, initialState);
  const capacidade = modelo?.parametros.capacidade_unidade_mes;

  if (!editando) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border-soft px-2.5 py-2">
        <span className="text-[12px]">
          {a.quantidade > 0 ? <span className="font-mono font-semibold">{a.quantidade}× </span> : null}
          {modelo?.nome ?? "modelo removido"}
          {a.quantidade > 0 && capacidade ? (
            <span className="text-text-faint"> · cobre até {(a.quantidade * capacidade).toFixed(0)}/mês</span>
          ) : a.quantidade === 0 ? (
            <span className="text-text-faint"> · acompanha a demanda</span>
          ) : null}
          <span className="text-text-faint"> · {a.data_inicio ?? "início aberto"} → {a.data_fim ?? "sem fim"}</span>
        </span>
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditando(true)} className="text-[11px] text-primary-deep underline">editar</button>
          <button type="button" disabled={excluindo} onClick={excluir} className="text-[11px] text-danger">×</button>
        </span>
      </div>
    );
  }

  return (
    <form
      action={async (fd) => {
        await formAction(fd);
        setEditando(false);
      }}
      className="flex flex-wrap items-end gap-2 rounded-md border border-primary-fill bg-primary-soft/40 px-2.5 py-2"
    >
      <input type="hidden" name="id" value={a.id} />
      <span className="mb-1.5 text-[12px]">{modelo?.nome ?? "modelo removido"}</span>
      <div>
        <label className="mb-0.5 block text-[9.5px] text-text-faint">Qtd. (0 = demanda)</label>
        <input name="quantidade" type="number" min="0" step="1" defaultValue={a.quantidade} className="input w-[110px]" required />
      </div>
      <div>
        <label className="mb-0.5 block text-[9.5px] text-text-faint">Início</label>
        <input name="data_inicio" type="date" defaultValue={a.data_inicio ?? ""} className="input w-[130px]" />
      </div>
      <div>
        <label className="mb-0.5 block text-[9.5px] text-text-faint">Fim</label>
        <input name="data_fim" type="date" defaultValue={a.data_fim ?? ""} className="input w-[130px]" />
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60">
        {pending ? "…" : "Salvar"}
      </button>
      <button type="button" onClick={() => setEditando(false)} className="text-[11px] text-text-muted">cancelar</button>
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}
