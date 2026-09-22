"use client";

import { Fragment, useActionState, useMemo, useRef, useState, useTransition } from "react";
import { criarAlocacaoModelo, editarAlocacaoModelo, excluirAlocacaoModelo, type ActionState } from "./actions";
import { leadsParaReunioes } from "@/lib/modelos-contratacao";
import { custoMensalModelo, type ParametrosModelo, type TipoModelo } from "@/lib/modelos-contratacao";
import { cargoChave, type CargoChave, type DemandaProdutoMes } from "@/lib/necessidade-contratacao";
import {
  custoEquipeNoMes,
  demandaDoCargo,
  produtosDaAlocacao,
  LABEL_COBERTURA,
  type CoberturaModo,
  type ItemEquipeMes,
  type ModeloEquipe,
} from "@/lib/equipe-comercial";
import { InfoTooltip } from "@/components/info-tooltip";
import { RoteiroCanalDireto, type PassoRoteiro } from "./roteiro-canal-direto";

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
  conversao_por_produto?: Record<string, number> | null;
  cobertura_modo?: CoberturaModo | null;
  cobertura_pct?: number | null;
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
  passosCanalDireto = [],
  modelos,
  alocacoes,
  cargoInicial = "sdr",
}: {
  cenarioId: string;
  /** Demanda por produto e mês: porProduto[produtoId][mes]. */
  porProduto: Record<string, Record<string, DemandaProdutoMes>>;
  arpuPorProdutoMes: Record<string, Record<string, number>>;
  produtos: Produto[];
  /** Passos do canal direto — só valem pro SDR, então só aparecem naquela aba. */
  passosCanalDireto?: PassoRoteiro[];
  modelos: Modelo[];
  alocacoes: Alocacao[];
  cargoInicial?: CargoChave;
}) {
  const [ativo, setAtivo] = useState<CargoChave>(cargoInicial);
  // Comparar modelos é o momento de DECIDIR — só abre no mês que está sendo editado.
  const [mesEditando, setMesEditando] = useState<string | null>(null);
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
        // Quem cobre o mês: modelo, quanto foi contratado e o custo — é o que a tabela mostra por
        // padrão. A comparação entre modelos só aparece ao editar.
        itens: equipe.itens.filter((i) => i.chave === ativo && (i.coberto > 0 || i.custo > 0)),
      };
    });
  }, [porProduto, arpuPorProdutoMes, filtro, alocacoesDoCargo, modelosMap, ativo]);

  const linhasRelevantes = useMemo(() => {
    const primeiro = linhas.findIndex((l) => l.demanda > 0.001);
    return primeiro === -1 ? [] : linhas.slice(primeiro);
  }, [linhas]);

  // Mês com demanda e nenhuma alocação ativa sai com custo zero — é o único alerta que importa
  // aqui. A taxa de qualificação vem do modelo ALOCADO, então ela nunca falta quando há alocação.
  const mesesSemSdr = useMemo(
    () => (ativo === "sdr" ? linhasRelevantes.filter((l) => l.demanda > 0.001 && l.itens.length === 0).map((l) => l.mes) : []),
    [ativo, linhasRelevantes],
  );

  return (
    <div className="flex flex-col gap-5">
      {ativo === "sdr" && mesesSemSdr.length > 0 && (
        <div className="rounded-lg border border-dashed border-border bg-surface px-3.5 py-2 text-[11.5px] text-text-muted">
          ⚠ Em {mesesSemSdr.length} {mesesSemSdr.length === 1 ? "mês" : "meses"} há reuniões a agendar sem nenhum SDR alocado —
          a partir de {formatMes(mesesSemSdr[0])}. Esses meses saem com custo zero: a prospecção fica como esforço próprio.
        </div>
      )}

      {ativo === "sdr" && passosCanalDireto.some((p) => !p.feito) && (
        <AvisoCanalDireto passos={passosCanalDireto} />
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
                  <td className="px-2 py-1.5 font-medium">
                    <span className="inline-flex items-center">
                      Alocado
                      <InfoTooltip texto="Quem cobre a demanda do mês. Clique no nome do modelo pra rever a remuneração cadastrada; clique em 'editar' pra comparar os modelos e trocar." />
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium">Quantidade</td>
                  <td className="px-2 py-1.5 text-right font-medium">Custo</td>
                  <td className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {linhasRelevantes.map((l) => {
                  const colunas = 4 + (ativo === "vendedor" || ativo === "coordenador" ? 1 : 0);
                  return (
                    <Fragment key={l.mes}>
                      <tr className={`border-t border-border-soft ${mesEditando === l.mes ? "bg-primary-soft/20" : ""}`}>
                        <td className="px-2 py-1.5 capitalize">{formatMes(l.mes)}</td>
                        <td className="px-2 py-1.5 text-right font-mono font-semibold">{l.demanda.toFixed(1)}</td>
                        {ativo === "vendedor" && (
                          <td className="px-2 py-1.5 text-right font-mono">
                            {l.vendedores.toFixed(1)}
                            {l.vendedores > 1 && <span className="block text-[9px] font-normal text-warning">passa de 1 pessoa</span>}
                          </td>
                        )}
                        {ativo === "coordenador" && <td className="px-2 py-1.5 text-right font-mono">{l.coordenadores.toFixed(1)}</td>}
                        <CelulasAlocado linha={l} ativo={ativo} modelos={modelosDoCargo} />
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => setMesEditando(mesEditando === l.mes ? null : l.mes)}
                            className="text-[11px] text-primary-deep underline"
                          >
                            {mesEditando === l.mes ? "fechar" : "editar"}
                          </button>
                        </td>
                      </tr>
                      {mesEditando === l.mes && (
                        <tr className="border-t border-primary-fill bg-primary-soft/10">
                          <td colSpan={colunas + 1} className="px-3 py-2.5">
                            <ComparativoModelos
                              linha={l}
                              ativo={ativo}
                              unidade={cargoAtual.unidade}
                              modelos={modelosDoCargo}
                              alocacoes={alocacoesDoCargo}
                              cenarioId={cenarioId}
                              cargo={cargoAtual.label}
                              produtos={produtos}
                              aoFechar={() => setMesEditando(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
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

function EscolhaProdutos({
  produtos,
  marcados,
  conversao,
  taxaPadrao,
}: {
  produtos: Produto[];
  marcados?: string[] | null;
  conversao?: Record<string, number> | null;
  /** Taxa do modelo, usada como placeholder quando o produto não tem taxa própria. */
  taxaPadrao?: number | null;
}) {
  if (produtos.length <= 1) return null;
  return (
    <div className="flex flex-col">
      <label className="mb-0.5 flex items-center text-[9.5px] text-text-faint">
        Produtos e conversão de cada um
        <InfoTooltip texto="Em quais produtos esta alocação trabalha e com que conversão em cada um. Ex: SDR PJ e vendedor só no Fashion Mind; o bot no Price e no Skills — e o Skills converte melhor, porque é mais fácil de entender sozinho. A conversão é lead → oportunidade: quanto melhor, menos leads para o mesmo resultado, e mais barato. Em branco, vale a taxa do modelo. Sem produto marcado, a alocação vale para todos." />
      </label>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-2 py-1.5">
        {produtos.map((p) => (
          <span key={p.id} className="flex items-center gap-1 text-[11.5px]">
            <input type="checkbox" name="produto_ids" value={p.id} defaultChecked={marcados?.includes(p.id) ?? false} />
            {nomeCurto(p.nome)}
            <input
              name={`conversao_${p.id}`}
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={conversao?.[p.id] != null ? Number((conversao[p.id] * 100).toFixed(3)) : undefined}
              placeholder={taxaPadrao ? (taxaPadrao * 100).toFixed(1) : "%"}
              title={`Conversão lead → oportunidade do ${p.nome} com este modelo (%)`}
              className="input w-[62px] px-1.5 py-0.5 text-[11px]"
            />
            <span className="text-text-faint">%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Quanto da demanda a alocação absorve — substitui o campo de quantidade, que só faz sentido no
 *  modo "pacote" e em contrato discreto (CLT). */
function EscolhaCobertura({
  modeloSelecionado,
  cargo,
  modo,
  setModo,
  pct,
  quantidade,
}: {
  modeloSelecionado?: Modelo;
  cargo: string;
  modo: CoberturaModo;
  setModo: (m: CoberturaModo) => void;
  pct?: number | null;
  quantidade?: number;
}) {
  const discreto = modeloSelecionado ? precisaQuantidade(modeloSelecionado.tipo_modelo) : false;
  return (
    <>
      <div>
        <label className="mb-0.5 flex items-center text-[9.5px] text-text-faint">
          Cobertura da demanda
          <InfoTooltip texto="Toda a demanda: a alocação cobre tudo o que a meta pedir e o custo acompanha o volume. Parte da demanda: ela absorve só a fatia que você informar — o resto chega por marketing e impulsionamento, que é o caso de produto intuitivo, fechado pela composição das ações e não por uma isolada. Teto pelo pacote: limita em quantidade × capacidade do modelo, e o que passar fica como esforço próprio, sem custo." />
        </label>
        <select name="cobertura_modo" value={modo} onChange={(e) => setModo(e.target.value as CoberturaModo)} className="input w-[190px]">
          {(Object.keys(LABEL_COBERTURA) as CoberturaModo[]).map((k) => (
            <option key={k} value={k}>
              {LABEL_COBERTURA[k]}
            </option>
          ))}
        </select>
      </div>
      {modo === "percentual" && (
        <div>
          <label className="mb-0.5 block text-[9.5px] text-text-faint">% da demanda</label>
          <input name="cobertura_pct" type="number" min="0" max="100" step="1" defaultValue={pct ?? 60} className="input w-[90px]" />
        </div>
      )}
      {(modo === "pacote" || discreto) && (
        <div>
          <label className="mb-0.5 flex items-center text-[9.5px] text-text-faint">
            {discreto ? "Qtd. contratada" : "Qtd. do pacote"}
            <InfoTooltip texto={ajudaQuantidade(cargo, modeloSelecionado)} />
          </label>
          <input name="quantidade" type="number" min="0" step="1" defaultValue={quantidade ?? 1} className="input w-[110px]" required />
        </div>
      )}
      {modo !== "pacote" && !discreto && <input type="hidden" name="quantidade" value={quantidade ?? 0} />}
    </>
  );
}


type LinhaMesDemanda = {
  mes: string;
  demanda: number;
  vendas: number;
  receitaNovasVendas: number;
  coberto: number;
  custoAlocado: number;
  descoberto: number;
  itens: ItemEquipeMes[];
};

/** Contexto que cada modelo precisa pra calcular custo naquele volume. */
function contextoDoMes(ativo: CargoChave, l: LinhaMesDemanda) {
  if (ativo === "sdr") return { reunioes: l.demanda };
  if (ativo === "vendedor") return { reunioes: l.demanda, vendas: l.vendas, receitaNovasVendas: l.receitaNovasVendas };
  return {};
}

function unidadeCurta(ativo: CargoChave) {
  return ativo === "suporte" ? "h" : "reuniões";
}

/** Colunas de acompanhamento: quem cobre, quanto foi contratado e o custo (com o unitário). */
function CelulasAlocado({ linha: l, ativo, modelos }: { linha: LinhaMesDemanda; ativo: CargoChave; modelos: Modelo[] }) {
  // Nenhum modelo alocado: sugere o mais barato que cobriria a demanda do mês.
  const sugestao = useMemo(() => {
    if (l.itens.length > 0 || l.demanda <= 0.001 || modelos.length === 0) return null;
    const candidatos = modelos
      .map((m) => ({ m, ...custoMensalModelo(m.tipo_modelo as TipoModelo, m.parametros, l.demanda, contextoDoMes(ativo, l)) }))
      .filter((c) => c.unidades > 0 || c.custoMensal > 0);
    if (candidatos.length === 0) return null;
    return candidatos.sort((a, b) => a.custoMensal - b.custoMensal)[0];
  }, [l, ativo, modelos]);

  if (l.itens.length === 0) {
    return (
      <>
        <td className="px-2 py-1.5 text-[11px] text-text-faint">
          — sem ninguém
          {sugestao && (
            <span className="block text-[9.5px] text-primary-deep">
              mais barato: {sugestao.m.nome} · {formatBRL(sugestao.custoMensal)}
            </span>
          )}
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-warning">
          {l.descoberto > 0.05 ? `+${l.descoberto.toFixed(1)}` : "—"}
          <span className="block text-[9px] font-normal text-text-faint">{unidadeCurta(ativo)} sem cobertura</span>
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-text-faint">R$ 0</td>
      </>
    );
  }

  const unitario = l.coberto > 0 ? l.custoAlocado / l.coberto : 0;
  return (
    <>
      <td className="px-2 py-1.5 text-[11px]">
        {l.itens.map((i) => (
          <a key={i.alocacaoId} href="/contratacoes/modelos" className="block text-primary-deep underline" title="Rever remuneração deste modelo">
            {i.modelo.nome}
          </a>
        ))}
        {l.descoberto > 0.05 && (
          <span className="block text-[9.5px] text-warning">+{l.descoberto.toFixed(1)} {unidadeCurta(ativo)} sem ninguém</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right font-mono">
        {l.itens.map((i) => (
          <span key={i.alocacaoId} className="block">
            {i.unidades > 0 ? `${num(Math.ceil(i.unidades - 1e-9), 0)} ${UNIDADE_LABEL[i.tipo] ?? "un."}` : "—"}
            <span className="block text-[9px] font-normal text-text-faint">{i.coberto.toFixed(1)} {unidadeCurta(ativo)}</span>
          </span>
        ))}
      </td>
      <td className="px-2 py-1.5 text-right font-mono font-semibold">
        {formatBRL(l.custoAlocado)}
        {unitario > 0 && (
          <span className="block text-[9px] font-normal text-text-faint">
            {formatBRL(unitario)}/{ativo === "suporte" ? "h" : "reunião"}
          </span>
        )}
      </td>
    </>
  );
}

/**
 * Comparação de modelos no volume DAQUELE mês — só aparece ao editar. É o momento de decidir:
 * escolher um modelo aqui cria a alocação já com o período começando neste mês.
 */
function ComparativoModelos({
  linha: l,
  ativo,
  unidade,
  modelos,
  alocacoes,
  cenarioId,
  cargo,
  produtos,
  aoFechar,
}: {
  linha: LinhaMesDemanda;
  ativo: CargoChave;
  unidade: string;
  modelos: Modelo[];
  alocacoes: Alocacao[];
  cenarioId: string;
  cargo: string;
  produtos: Produto[];
  aoFechar: () => void;
}) {
  const [state, formAction, pending] = useActionState(criarAlocacaoModelo, initialState);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [soEsteMes, setSoEsteMes] = useState(false);

  // Alocação que já cobre este mês e veio de um período maior — trocar aqui mexe no período todo,
  // então perguntamos antes (ver "só este mês").
  const doPeriodo = l.itens[0];
  const alocacaoAtual = doPeriodo ? alocacoes.find((a) => a.id === doPeriodo.alocacaoId) : undefined;
  const periodoMaior =
    !!alocacaoAtual && (!alocacaoAtual.data_inicio || alocacaoAtual.data_inicio.slice(0, 7) !== l.mes.slice(0, 7) || !alocacaoAtual.data_fim || alocacaoAtual.data_fim.slice(0, 7) !== l.mes.slice(0, 7));

  const fimDoMes = (() => {
    const [a, m] = l.mes.slice(0, 7).split("-").map(Number);
    return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  })();

  const comparacao = modelos.map((m) => {
    const r = custoMensalModelo(m.tipo_modelo as TipoModelo, m.parametros, l.demanda, contextoDoMes(ativo, l));
    return { m, ...r, taxa: taxaDoModelo(m.parametros) };
  });
  const maisBarato = [...comparacao].filter((c) => c.custoMensal > 0).sort((a, b) => a.custoMensal - b.custoMensal)[0];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11.5px] text-text-muted">
        Custo de cada modelo pra cobrir <strong>{l.demanda.toFixed(1)}</strong> {unidade} em <strong className="capitalize">{formatMes(l.mes)}</strong>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="text-left text-text-faint">
              <td className="px-2 py-1 font-medium">Modelo</td>
              <td className="px-2 py-1 text-right font-medium">Quantidade</td>
              {ativo === "sdr" && <td className="px-2 py-1 text-right font-medium">Leads · taxa</td>}
              <td className="px-2 py-1 text-right font-medium">Custo no mês</td>
              <td className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {comparacao.map(({ m, custoMensal, unidades, taxa }) => {
              const unidadesInteiras = Math.ceil(unidades - 1e-9);
              const emUso = l.itens.some((i) => i.modelo.id === m.id);
              return (
                <tr key={m.id} className={`border-t border-border-soft ${escolhido === m.id ? "bg-primary-soft/30" : ""}`}>
                  <td className="px-2 py-1">
                    <a href="/contratacoes/modelos" className="text-primary-deep underline" title="Rever remuneração cadastrada">
                      {m.nome}
                    </a>
                    {emUso && <span className="ml-1 text-[9.5px] text-success">em uso</span>}
                    {maisBarato?.m.id === m.id && !emUso && <span className="ml-1 text-[9.5px] text-primary-deep">mais barato</span>}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">
                    {unidades > 0 ? `${num(unidadesInteiras, 0)} ${unidadesInteiras === 1 ? (UNIDADE_LABEL[m.tipo_modelo] ?? "un.") : (UNIDADE_PLURAL[m.tipo_modelo] ?? "un.")}` : "—"}
                  </td>
                  {ativo === "sdr" && (
                    <td className="px-2 py-1 text-right font-mono text-text-faint">
                      {taxa ? `${num(leadsParaReunioes(m.parametros, l.demanda), 0)} · ${(taxa * 100).toFixed(1)}%` : "—"}
                    </td>
                  )}
                  <td className="px-2 py-1 text-right font-mono font-semibold">{formatBRL(custoMensal)}</td>
                  <td className="px-2 py-1 text-right">
                    <button type="button" onClick={() => setEscolhido(m.id)} className="text-[11px] text-primary-deep underline">
                      escolher
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {escolhido && (
        <form
          action={async (fd) => {
            await formAction(fd);
            aoFechar();
          }}
          className="flex flex-wrap items-end gap-2 border-t border-border-soft pt-2"
        >
          <input type="hidden" name="cenario_id" value={cenarioId} />
          <input type="hidden" name="cargo" value={cargo} />
          <input type="hidden" name="modelo_id" value={escolhido} />
          <input type="hidden" name="data_inicio" value={`${l.mes.slice(0, 7)}-01`} />
          {soEsteMes && <input type="hidden" name="data_fim" value={fimDoMes} />}
          <EscolhaProdutos produtos={produtos} taxaPadrao={taxaDoModelo(modelos.find((m) => m.id === escolhido)!.parametros)} />
          <EscolhaCobertura
            modeloSelecionado={modelos.find((m) => m.id === escolhido)}
            cargo={cargo}
            modo="demanda"
            setModo={() => {}}
            quantidade={precisaQuantidade(modelos.find((m) => m.id === escolhido)!.tipo_modelo) ? 1 : 0}
          />
          {periodoMaior && (
            <label className="flex items-center gap-1.5 text-[11px] text-text-muted" title="A alocação atual cobre vários meses. Marcando, a troca vale só neste mês e o período existente continua nos demais.">
              <input type="checkbox" checked={soEsteMes} onChange={(e) => setSoEsteMes(e.target.checked)} />
              só este mês
            </label>
          )}
          <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3 py-2 text-[11.5px] font-medium text-white disabled:opacity-60">
            {pending ? "…" : soEsteMes ? "Alocar só neste mês" : "Alocar a partir deste mês"}
          </button>
          <button type="button" onClick={aoFechar} className="rounded-lg border border-border px-3 py-2 text-[11.5px] text-text-muted">
            Cancelar
          </button>
          {periodoMaior && !soEsteMes && (
            <p className="w-full text-[10.5px] text-warning">
              A alocação atual começa antes deste mês — sem marcar &quot;só este mês&quot;, a nova passa a valer daqui em diante.
            </p>
          )}
          {state.error && <p className="w-full text-[11px] text-danger">{state.error}</p>}
        </form>
      )}
    </div>
  );
}

/** O roteiro inteiro tomava a primeira tela. Vira uma linha: o alerta que importa (custo zero e CAC
 * abaixo do real) fica visível, e os passos só quando a pessoa pedir. */
function AvisoCanalDireto({ passos }: { passos: PassoRoteiro[] }) {
  const [aberto, setAberto] = useState(false);
  const faltam = passos.filter((p) => !p.feito).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-[11.5px] text-text-muted">
        <span>
          ⚠ O canal direto ainda aparece com <strong>custo zero</strong> e o CAC menor do que a realidade — faltam {faltam} de {passos.length} passos.
        </span>
        <button type="button" onClick={() => setAberto((v) => !v)} className="text-primary-deep underline">
          {aberto ? "ocultar" : "ver o que falta"}
        </button>
      </div>
      {aberto && <RoteiroCanalDireto passos={passos} />}
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
  const [coberturaModo, setCoberturaModo] = useState<CoberturaModo>("demanda");
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
          <EscolhaProdutos produtos={produtos} taxaPadrao={modeloSelecionado ? taxaDoModelo(modeloSelecionado.parametros) : null} />
          <EscolhaCobertura
            modeloSelecionado={modeloSelecionado}
            cargo={cargo}
            modo={coberturaModo}
            setModo={setCoberturaModo}
            quantidade={modeloSelecionado && precisaQuantidade(modeloSelecionado.tipo_modelo) ? 1 : 0}
          />
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
  const [coberturaModo, setCoberturaModo] = useState<CoberturaModo>(a.cobertura_modo ?? "demanda");
  const capacidade = modelo?.parametros.capacidade_unidade_mes;

  if (!editando) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border-soft px-2.5 py-2">
        <span className="text-[12px]">
          {a.quantidade > 0 ? <span className="font-mono font-semibold">{a.quantidade}× </span> : null}
          {modelo?.nome ?? "modelo removido"}
          <span className="ml-1 rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] text-primary-deep">{escopoLabel(a, produtos)}</span>
          {a.cobertura_modo === "percentual" ? (
            <span className="text-text-faint"> · cobre {Number(a.cobertura_pct ?? 0).toFixed(0)}% da demanda</span>
          ) : a.cobertura_modo === "pacote" && capacidade ? (
            <span className="text-text-faint"> · teto de {(a.quantidade * capacidade).toFixed(0)}/mês</span>
          ) : (
            <span className="text-text-faint"> · toda a demanda</span>
          )}
          {a.conversao_por_produto && Object.keys(a.conversao_por_produto).length > 0 && (
            <span className="text-text-faint">
              {" · conversão "}
              {Object.entries(a.conversao_por_produto)
                .map(([pid, t]) => `${nomeCurto(produtos.find((p) => p.id === pid)?.nome ?? "?")} ${(t * 100).toFixed(1)}%`)
                .join(", ")}
            </span>
          )}
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
      <EscolhaProdutos
        produtos={produtos}
        marcados={produtosDaAlocacao(a)}
        conversao={a.conversao_por_produto}
        taxaPadrao={modelo ? taxaDoModelo(modelo.parametros) : null}
      />
      <EscolhaCobertura
        modeloSelecionado={modelo}
        cargo={a.cargo}
        modo={coberturaModo}
        setModo={setCoberturaModo}
        pct={a.cobertura_pct}
        quantidade={a.quantidade}
      />
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
