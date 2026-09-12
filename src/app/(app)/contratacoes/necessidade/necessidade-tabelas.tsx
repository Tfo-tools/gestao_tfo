"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { criarAlocacaoModelo, editarAlocacaoModelo, excluirAlocacaoModelo, type ActionState } from "./actions";
import { leadsParaReunioes } from "@/lib/modelos-contratacao";
import { custoMensalModelo, type ParametrosModelo, type TipoModelo } from "@/lib/modelos-contratacao";
import { cargoChave, type CargoChave, type DemandaProdutoMes } from "@/lib/necessidade-contratacao";
import { custoEquipeNoMes, demandaDoCargo, produtosDaAlocacao, type ModeloEquipe } from "@/lib/equipe-comercial";
import { InfoTooltip } from "@/components/info-tooltip";

type Modelo = { id: string; cargo: string; tipo_modelo: string; nome: string; categoria?: "pd" | "sm" | "ga"; parametros: ParametrosModelo };
type Alocacao = {
  id: string;
  cargo: string;
  modelo_id: string;
  quantidade: number;
  data_inicio: string | null;
  data_fim: string | null;
  produto_id?: string | null;
  produto_ids?: string[] | null;
  created_at?: string | null;
};
type Produto = { id: string; nome: string };

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
function nomeCurto(nome: string) {
  return nome.replace(/^Fashion /, "");
}

/** Como chamar a "unidade" de cada modelo — 3 pessoas, 2 pacotes, 1 assinatura. */
const UNIDADE_LABEL: Record<string, string> = {
  clt: "pessoa", pj: "PJ", empresa_fixo_escopo: "pacote",
  empresa_hibrido: "contrato", empresa_creditos: "contrato", empresa_ia_atendimento: "pacote",
};
const UNIDADE_PLURAL: Record<string, string> = {
  clt: "pessoas", pj: "PJs", empresa_fixo_escopo: "pacotes",
  empresa_hibrido: "contratos", empresa_creditos: "contratos", empresa_ia_atendimento: "pacotes",
};

const CARGOS: { chave: CargoChave; label: string; unidade: string }[] = [
  { chave: "sdr", label: "SDR", unidade: "reuniões a agendar/mês" },
  { chave: "vendedor", label: "Vendedor", unidade: "reuniões a atender/mês" },
  { chave: "coordenador", label: "Coordenador", unidade: "vendedores a supervisionar" },
  { chave: "suporte", label: "Suporte", unidade: "horas/mês" },
];

/** Taxa que o modelo usa pra transformar lead em oportunidade — no bot, o lead qualificado. */
function taxaDoModelo(p: ParametrosModelo): number | null {
  const bot = p.leads_maximos_pacote != null || p.valor_por_lead_trabalhado != null;
  const t = bot ? p.taxa_qualificacao_estimada || p.taxa_qualificacao : p.taxa_qualificacao;
  return t && t > 0 ? t : null;
}

/**
 * O que a quantidade significa depende do tipo de contrato — e é a dúvida mais comum da tela:
 * em modelos cobrados por uso, 0 quer dizer "cubra toda a necessidade do mês"; acima de 0 é teto.
 */
function ajudaQuantidade(cargo: string, modelo?: Modelo): string {
  const unidade = cargoChave(cargo) === "suporte" ? "horas" : "reuniões";
  const capacidade = modelo?.parametros.capacidade_unidade_mes;
  const porUnidade = capacidade ? ` Cada unidade cobre até ${capacidade.toLocaleString("pt-BR")} ${unidade}/mês.` : "";
  if (!modelo) return `0 = cobre toda a necessidade do mês. Acima de 0 vira teto, e o que a meta pedir além disso fica como esforço próprio, sem custo.`;
  if (precisaQuantidade(modelo.tipo_modelo)) {
    return `Aqui a quantidade é o que você CONTRATOU: ${modelo.tipo_modelo === "clt" ? "pessoas" : "pacotes"} inteiros, pagos mesmo que a demanda do mês caia.${porUnidade} O que passar da capacidade contratada fica como esforço próprio, sem custo.`;
  }
  const teto = porUnidade || " É a capacidade do modelo × a quantidade.";
  return (
    `Modelo cobrado pelo volume trabalhado. 0 = acompanha toda a demanda do mês: não há teto, e o custo segue o volume — ` +
    `o bot compra quantos pacotes de leads precisar, o PJ é pago pelas reuniões que fizer. ` +
    `Um número acima de 0 vira teto.${teto} O que a meta pedir além do teto aparece como esforço próprio na coluna "Alocado" ` +
    `e não gera custo — é você e sua sócia cobrindo.`
  );
}

function escopoLabel(a: Alocacao, produtos: Produto[]): string {
  const ids = produtosDaAlocacao(a);
  if (!ids) return "todos os produtos";
  return ids.map((id) => nomeCurto(produtos.find((p) => p.id === id)?.nome ?? "produto removido")).join(", ");
}

export function NecessidadeTabelas({
  cenarioId,
  porProduto,
  arpuPorProdutoMes,
  produtos,
  modelos,
  alocacoes,
  mesesSemQualificacao,
  cargoInicial = "sdr",
}: {
  cenarioId: string;
  /** Demanda por produto e mês: porProduto[produtoId][mes]. */
  porProduto: Record<string, Record<string, DemandaProdutoMes>>;
  arpuPorProdutoMes: Record<string, Record<string, number>>;
  produtos: Produto[];
  modelos: Modelo[];
  alocacoes: Alocacao[];
  mesesSemQualificacao: string[];
  cargoInicial?: CargoChave;
}) {
  const [ativo, setAtivo] = useState<CargoChave>(cargoInicial);
  // Filtro de produto: ver só a demanda do Mind (SDR PJ + vendedor) ou só a do Price e do Skills (bot).
  const [filtro, setFiltro] = useState<string | null>(null);
  const cargoAtual = CARGOS.find((c) => c.chave === ativo)!;

  const modelosDoCargo = useMemo(() => modelos.filter((m) => cargoChave(m.cargo) === ativo), [modelos, ativo]);
  const alocacoesDoCargo = useMemo(() => alocacoes.filter((a) => cargoChave(a.cargo) === ativo), [alocacoes, ativo]);
  const modelosMap = useMemo(
    () => new Map(modelos.map((m) => [m.id, { ...m, categoria: m.categoria ?? "sm" } as ModeloEquipe])),
    [modelos],
  );

  const linhas = useMemo(() => {
    const meses = new Set<string>();
    for (const pm of Object.values(porProduto)) for (const m of Object.keys(pm)) meses.add(m);
    const alvo = filtro ? [filtro] : Object.keys(porProduto);
    // Só as alocações que trabalham nos produtos do filtro cobrem a demanda mostrada.
    const alocacoesAlvo = alocacoesDoCargo.filter((a) => {
      const escopo = produtosDaAlocacao(a);
      return !escopo || escopo.some((p) => alvo.includes(p));
    });
    return [...meses].sort().map((mes) => {
      const dem: Record<string, DemandaProdutoMes> = {};
      for (const p of alvo) {
        const d = porProduto[p]?.[mes];
        if (d) dem[p] = d;
      }
      const soma = (k: keyof DemandaProdutoMes) => Object.values(dem).reduce((s, d) => s + d[k], 0);
      const arpu = arpuPorProdutoMes[mes] ?? {};
      const equipe = custoEquipeNoMes({ mes, alocacoes: alocacoesAlvo, modelos: modelosMap, demanda: dem, arpuPorProduto: arpu });
      const receitaNovasVendas = Object.entries(dem).reduce((s, [p, d]) => s + d.vendasComReuniao * (arpu[p] ?? 0), 0);
      return {
        mes,
        demanda: Object.values(dem).reduce((s, d) => s + demandaDoCargo(d, ativo), 0),
        vendedores: soma("vendedores"),
        coordenadores: soma("coordenador"),
        vendas: soma("vendasComReuniao"),
        receitaNovasVendas,
        coberto: equipe.itens.reduce((s, i) => s + i.coberto, 0),
        custoAlocado: equipe.itens.reduce((s, i) => s + i.custo, 0),
        descoberto: equipe.descoberto[ativo],
      };
    });
  }, [porProduto, arpuPorProdutoMes, filtro, alocacoesDoCargo, modelosMap, ativo]);

  const linhasRelevantes = useMemo(() => {
    const primeiro = linhas.findIndex((l) => l.demanda > 0.001);
    return primeiro === -1 ? [] : linhas.slice(primeiro);
  }, [linhas]);

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

      <div className="flex flex-wrap items-center justify-between gap-3">
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
        {produtos.length > 1 && (
          <div className="flex items-center gap-1.5 text-[11.5px]">
            <span className="text-text-faint">Produto:</span>
            {[{ id: null as string | null, nome: "Todos" }, ...produtos].map((p) => (
              <button
                key={p.id ?? "todos"}
                type="button"
                onClick={() => setFiltro(p.id)}
                className={`rounded-full border px-2.5 py-1 ${
                  filtro === p.id ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border text-text-muted"
                }`}
              >
                {nomeCurto(p.nome)}
              </button>
            ))}
          </div>
        )}
      </div>

      {ativo === "suporte" && (
        <div className="rounded-lg border border-dashed border-border bg-bg px-4 py-2.5 text-[11.5px] text-text-muted">
          <strong>O custo do suporte não sai daqui.</strong> Ele vem das regras de COGS de cada produto (Plano de Custos → CSP → 1.1.3):
          horas por cliente × custo/hora do perfil escolhido, a partir da data configurada lá. Esta aba mostra quantas horas a base exige
          e quantas pessoas isso dá — a alocação aqui é só pra dimensionar, não gera custo.
        </div>
      )}
      {ativo === "vendedor" && (
        <div className="rounded-lg border border-dashed border-border bg-bg px-4 py-2.5 text-[11.5px] text-text-muted">
          A demanda do vendedor é em <strong>reuniões a atender</strong> — de todos os canais com reunião, já com a 2ª reunião dos
          produtos de ciclo longo. A capacidade do modelo também é em reuniões por pessoa/mês (ex: 80). Produto marcado como{" "}
          <strong>venda automática</strong> nas premissas do time de vendas não gera reunião, nem paga vendedor por venda.
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center font-heading text-sm font-semibold">
            {ativo === "sdr" ? "Reuniões a agendar e custo por modelo de SDR" : `Demanda de ${cargoAtual.label}`}
            <InfoTooltip
              texto={
                ativo === "sdr"
                  ? "Reuniões (oportunidades) necessárias = clientes da meta que vêm do canal direto ÷ taxa de fechamento do produto nesse canal. No bot, a oportunidade é o lead qualificado, que segue sozinho pro teste/assinatura. Cada coluna de modelo mostra quantos LEADS aquele modelo precisa trabalhar pra entregar essas oportunidades — leads = oportunidades ÷ taxa dele — e quanto isso custa."
                  : `Demanda mensal em ${cargoAtual.unidade}, calculada a partir do crescimento de clientes e das premissas de funil. As colunas seguintes mostram quanto custaria cobrir essa demanda com cada modelo cadastrado para este cargo.`
              }
            />
          </h2>
        </div>
        {linhasRelevantes.length === 0 ? (
          <p className="mt-3 text-[12px] text-text-faint">
            Sem demanda calculada{filtro ? " para este produto" : ""} — confira as premissas de {cargoAtual.label} em Funil.
          </p>
        ) : modelosDoCargo.length === 0 ? (
          <p className="mt-3 text-[12px] text-text-faint">
            Nenhum modelo cadastrado pra {cargoAtual.label} ainda —{" "}
            <a href="/contratacoes/modelos" className="text-primary-deep underline">
              cadastre um modelo
            </a>{" "}
            pra ver o custo comparado.
          </p>
        ) : (
          <div className="mt-4 max-h-[420px] overflow-y-auto overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-text-muted">
                  <td className="px-2 py-1.5 font-medium">Mês</td>
                  <td className="px-2 py-1.5 text-right font-medium">
                    {ativo === "sdr" ? "Reuniões a agendar" : ativo === "vendedor" ? "Reuniões a atender" : `Demanda (${cargoAtual.unidade})`}
                  </td>
                  {ativo === "vendedor" && <td className="px-2 py-1.5 text-right font-medium">Vendedores</td>}
                  {ativo === "coordenador" && <td className="px-2 py-1.5 text-right font-medium">Coordenadores</td>}
                  {modelosDoCargo.map((m) => (
                    <td key={m.id} className="px-2 py-1.5 text-right font-medium">
                      {m.nome}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-medium">
                    <span className="inline-flex items-center">
                      Alocado
                      <InfoTooltip texto="O que as alocações registradas abaixo cobrem no mês e quanto custam, pela mesma regra do Plano de Custos. O que sobra é esforço próprio — não gera custo, mas precisa de alguém fazendo." />
                    </span>
                  </td>
                </tr>
              </thead>
              <tbody>
                {linhasRelevantes.map((l) => (
                  <tr key={l.mes} className="border-t border-border-soft">
                    <td className="px-2 py-1.5 capitalize">{formatMes(l.mes)}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold">{l.demanda.toFixed(1)}</td>
                    {ativo === "vendedor" && (
                      <td className="px-2 py-1.5 text-right font-mono">
                        {l.vendedores.toFixed(1)}
                        {l.vendedores > 1 && <span className="block text-[9px] font-normal text-warning">passa de 1 pessoa</span>}
                      </td>
                    )}
                    {ativo === "coordenador" && <td className="px-2 py-1.5 text-right font-mono">{l.coordenadores.toFixed(1)}</td>}
                    {modelosDoCargo.map((m) => {
                      const contexto =
                        ativo === "sdr"
                          ? { reunioes: l.demanda }
                          : ativo === "vendedor"
                            ? { reunioes: l.demanda, vendas: l.vendas, receitaNovasVendas: l.receitaNovasVendas }
                            : {};
                      const { custoMensal, unidades } = custoMensalModelo(m.tipo_modelo as TipoModelo, m.parametros, l.demanda, contexto);
                      const capacidade = m.parametros.capacidade_unidade_mes ?? 0;
                      const unidadesInteiras = Math.ceil(unidades - 1e-9);
                      const taxa = taxaDoModelo(m.parametros);
                      return (
                        <td key={m.id} className="px-2 py-1.5 text-right font-mono">
                          {formatBRL(custoMensal)}
                          {unidades > 0 && (
                            <span className="block text-[9px] font-normal text-text-faint">
                              {num(unidadesInteiras, 0)} {unidadesInteiras === 1 ? UNIDADE_LABEL[m.tipo_modelo] ?? "un." : (UNIDADE_PLURAL[m.tipo_modelo] ?? "un.")}
                              {capacidade > 0 && m.tipo_modelo !== "empresa_ia_atendimento" && ` · ${num(capacidade, 0)}/cada`}
                            </span>
                          )}
                          {ativo === "sdr" && taxa ? (
                            <span className="block text-[9px] font-normal text-text-faint">
                              {num(leadsParaReunioes(m.parametros, l.demanda), 0)} leads · {(taxa * 100).toFixed(1)}%
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                    <td className={`px-2 py-1.5 text-right font-mono ${l.coberto > 0 ? "text-success" : "text-text-faint"}`}>
                      {l.coberto > 0 ? l.coberto.toFixed(1) : "—"}
                      {l.custoAlocado > 0 && <span className="block text-[9px] font-normal text-text-muted">{formatBRL(l.custoAlocado)}</span>}
                      {l.descoberto > 0.05 && (
                        <span className="block text-[9px] font-normal text-warning">+{l.descoberto.toFixed(1)} sem ninguém</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AlocacaoModelo cenarioId={cenarioId} cargo={cargoAtual.label} modelos={modelosDoCargo} alocacoes={alocacoesDoCargo} produtos={produtos} />
    </div>
  );
}

// CLT e pacote fechado (empresa_fixo_escopo) são decisões discretas — "quantas pessoas/pacotes eu
// contratei" é uma escolha real sua, o custo é esse independente da demanda flutuar. PJ e os
// modelos pay-per-use (créditos/híbrido/bot) já são cobrados pela demanda real calculada mês a mês.
function precisaQuantidade(tipo: string): boolean {
  return tipo === "clt" || tipo === "empresa_fixo_escopo";
}

function EscolhaProdutos({ produtos, marcados }: { produtos: Produto[]; marcados?: string[] | null }) {
  if (produtos.length <= 1) return null;
  return (
    <div className="flex flex-col">
      <label className="mb-0.5 flex items-center text-[9.5px] text-text-faint">
        Produtos
        <InfoTooltip texto="Em quais produtos esta alocação trabalha. Ex: SDR PJ e vendedor só no Fashion Mind; SDR as a Service (bot) só no Price e no Skills. Sem nenhum marcado, vale para todos. Uma reunião nunca é cobrada por duas alocações: as presas a produto cobrem primeiro, as gerais ficam com o resto." />
      </label>
      <div className="flex h-[34px] items-center gap-2.5 rounded-md border border-border px-2">
        {produtos.map((p) => (
          <label key={p.id} className="flex items-center gap-1 text-[11.5px]">
            <input type="checkbox" name="produto_ids" value={p.id} defaultChecked={marcados?.includes(p.id) ?? false} />
            {nomeCurto(p.nome)}
          </label>
        ))}
      </div>
    </div>
  );
}

function AlocacaoModelo({
  cenarioId,
  cargo,
  modelos,
  alocacoes,
  produtos,
}: {
  cenarioId: string;
  cargo: string;
  modelos: Modelo[];
  alocacoes: Alocacao[];
  produtos: Produto[];
}) {
  const [state, formAction, pending] = useActionState(criarAlocacaoModelo, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const modeloById = new Map(modelos.map((m) => [m.id, m]));
  const [modeloSelecionadoId, setModeloSelecionadoId] = useState("");
  const [formKey, setFormKey] = useState(0);
  const modeloSelecionado = modeloById.get(modeloSelecionadoId);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 flex items-center font-heading text-sm font-semibold">
        Alocação escolhida — {cargo}
        <InfoTooltip texto="Registre qual modelo você decidiu usar, em quais produtos, quantas unidades e por quanto tempo — isso alimenta a coluna 'Alocado' e entra no custo real da projeção (EBITDA/CAC). Em CLT e pacote fechado a quantidade é o que você contratou (paga mesmo se sobrar); em PJ, agência e bot, 0 = acompanha a demanda e um número maior vira teto — o que passar fica como esforço próprio, sem custo." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">O que você realmente vai usar em cada período, depois de comparar os modelos</p>

      <div className="mb-4 flex flex-col gap-1.5">
        {alocacoes.length === 0 && <p className="text-[12px] text-text-faint">Nenhuma alocação registrada pra {cargo} ainda.</p>}
        {alocacoes.map((a) => (
          <LinhaAlocacao
            key={a.id}
            alocacao={a}
            modelo={modeloById.get(a.modelo_id)}
            produtos={produtos}
            excluir={() => startTransition(() => excluirAlocacaoModelo(a.id))}
            excluindo={isPending}
          />
        ))}
      </div>

      {modelos.length === 0 ? (
        <p className="text-[12px] text-text-faint">Cadastre um modelo pra {cargo} antes de alocar.</p>
      ) : (
        <form
          key={formKey}
          ref={formRef}
          action={async (fd) => {
            await formAction(fd);
            setModeloSelecionadoId("");
            setFormKey((k) => k + 1);
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
          <EscolhaProdutos produtos={produtos} />
          <div>
            <label className="mb-0.5 flex items-center text-[9.5px] text-text-faint">
              {modeloSelecionado && !precisaQuantidade(modeloSelecionado.tipo_modelo) ? "Qtd. (0 = toda a demanda)" : "Qtd."}
              <InfoTooltip texto={ajudaQuantidade(cargo, modeloSelecionado)} />
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
          {modeloSelecionado.parametros.capacidade_unidade_mes ?? "?"} {cargoChave(cargo) === "suporte" ? "horas" : "reuniões"}/mês por unidade —
          e o que passar fica como esforço próprio, sem custo.
        </p>
      )}
      {state.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </div>
  );
}

/** Uma alocação registrada, editável no lugar: muda produtos, quantidade e datas sem apagar e recriar. */
function LinhaAlocacao({
  alocacao: a,
  modelo,
  produtos,
  excluir,
  excluindo,
}: {
  alocacao: Alocacao;
  modelo?: Modelo;
  produtos: Produto[];
  excluir: () => void;
  excluindo: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(editarAlocacaoModelo, initialState);
  const capacidade = modelo?.parametros.capacidade_unidade_mes;

  if (!editando) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border-soft px-2.5 py-2">
        <span className="text-[12px]">
          {a.quantidade > 0 ? <span className="font-mono font-semibold">{a.quantidade}× </span> : null}
          {modelo?.nome ?? "modelo removido"}
          <span className="ml-1 rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] text-primary-deep">{escopoLabel(a, produtos)}</span>
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
      <EscolhaProdutos produtos={produtos} marcados={produtosDaAlocacao(a)} />
      <div>
        <label className="mb-0.5 flex items-center text-[9.5px] text-text-faint">
          {modelo && precisaQuantidade(modelo.tipo_modelo) ? "Qtd." : "Qtd. (0 = toda a demanda)"}
          <InfoTooltip texto={ajudaQuantidade(a.cargo, modelo)} />
        </label>
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
