"use client";

import { useActionState, useMemo, useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import {
  custoLlmPorCliente,
  horasCsPorCliente,
  horasSuportePorCliente,
  infraBaseNoMes,
  type CogsPremissas,
} from "@/lib/cogs";
import { salvarCogsPremissas, type ActionState } from "./cogs-actions";

export type ProdutoCogs = {
  id: string;
  nome: string;
  premissas: CogsPremissas;
  /** Nomes dos níveis/módulos do produto — pro seletor do LLM. */
  niveis: string[];
  /** Totais já calculados na última simulação, por conta. */
  totais: { infra: number; llm: number; suporte: number; cs: number; software: number; gateway: number; implementacao: number };
};

export type PerfilHora = { cargo: string; tipo_contratacao: string; senioridade: string; valor_hora: number };

const initialState: ActionState = { error: null };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const SENIORIDADE_LABEL: Record<string, string> = { junior: "Jr", pleno: "Pl", senior: "Sr" };

/**
 * Premissas de COGS por produto: uma seção por conta do plano de contas (1.1.1 a 1.1.5), cada uma
 * com a regra que faz o custo escalar com a base. O formulário edita um JSON em memória e grava
 * tudo de uma vez — e mostra ao lado de cada regra o que ela dá por cliente, pra você ver o
 * efeito antes de salvar.
 */
export function CogsPremissasForm({ cenarioId, produtos, perfis }: { cenarioId: string; produtos: ProdutoCogs[]; perfis: PerfilHora[] }) {
  const [produtoId, setProdutoId] = useState(produtos[0]?.id ?? "");
  const produto = produtos.find((p) => p.id === produtoId);
  if (!produto) return null;
  return (
    <div className="mt-4 rounded-lg border border-border bg-bg p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center text-[11px] font-semibold">
          Regras de escala do COGS
          <InfoTooltip texto="Cada linha do plano de contas 1.1.x tem uma regra que cresce com a base de clientes: infra em degraus + por cliente, LLM por cliente Premium, suporte e CS em horas × custo/hora, gateway por cobrança. O motor recalcula mês a mês a partir daqui — nada disso é lançado à mão." />
        </p>
        <div className="flex gap-1">
          {produtos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProdutoId(p.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                p.id === produtoId ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border text-text-faint"
              }`}
            >
              {p.nome}
            </button>
          ))}
        </div>
      </div>
      <FormProduto key={produto.id} cenarioId={cenarioId} produto={produto} perfis={perfis} />
    </div>
  );
}

function FormProduto({ cenarioId, produto, perfis }: { cenarioId: string; produto: ProdutoCogs; perfis: PerfilHora[] }) {
  const [p, setP] = useState<CogsPremissas>(produto.premissas ?? {});
  const [state, formAction, pending] = useActionState(salvarCogsPremissas, initialState);

  const set = <K extends keyof CogsPremissas>(chave: K, valor: Partial<NonNullable<CogsPremissas[K]>>) =>
    setP((prev) => ({ ...prev, [chave]: { ...(prev[chave] ?? {}), ...valor } }));

  const custoHora = (perfil: { cargo?: string; tipo_contratacao?: string; senioridade?: string } | undefined) =>
    perfis.find((x) => x.cargo === perfil?.cargo && x.tipo_contratacao === perfil?.tipo_contratacao && x.senioridade === perfil?.senioridade)
      ?.valor_hora ?? 0;

  const cargos = useMemo(() => [...new Set(perfis.map((x) => x.cargo))].sort(), [perfis]);

  const hSup = horasSuportePorCliente(p.suporte);
  const hCs = horasCsPorCliente(p.cs_proativo);
  const llmCli = custoLlmPorCliente(p.llm);
  const t = produto.totais;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="cenario_id" value={cenarioId} />
      <input type="hidden" name="produto_id" value={produto.id} />
      <input type="hidden" name="parametros" value={JSON.stringify(p)} />

      {/* 1.1.1 */}
      <Secao codigo="1.1.1" titulo="Infraestrutura e Cloud" total={t.infra}
        resumo={`${brl(infraBaseNoMes(p.infra, 0))} base → ${brl(p.infra?.por_cliente_mes ?? 0)}/cliente`}
        tooltip="Antes de 'custa a partir de' a infra fica no plano gratuito (zero). Plataforma (Supabase, Vercel, storage) tem uma base fixa que sobe em degraus quando a base de clientes cruza um limite (plano maior, réplica, etc.) e um incremento por cliente (banco, egress, funções). O Price pesa mais por cliente porque carrega o livro de vendas e o cálculo tributário por operação; o Skills é o mais leve.">
        <div className="form-linha">
          <Campo label="Custa a partir de" ajuda="Mês em que a infra começa a custar. Antes disso o produto roda no plano gratuito das plataformas e a linha sai zero."><input type="month" className="input campo-data" value={(p.infra?.inicio ?? "").slice(0, 7)} onChange={(e) => set("infra", { inicio: e.target.value ? `${e.target.value}-01` : null })} /></Campo>
          <Campo label="Base mensal (R$)" ajuda="Mensalidade fixa da plataforma (Supabase, Vercel, storage) independente de quantos clientes existem. Sobe em degraus quando a base cresce — os degraus ficam logo abaixo."><input type="number" step="0.01" className="input campo-dinheiro" value={p.infra?.base_mensal ?? ""} onChange={(e) => set("infra", { base_mensal: num(e) })} /></Campo>
          <Campo label="Por cliente/mês (R$)" ajuda="O que cada cliente adiciona de infra por mês: banco, tráfego de saída, execuções de função. Multiplica pela base ativa do mês."><input type="number" step="0.01" className="input campo-dinheiro" value={p.infra?.por_cliente_mes ?? ""} onChange={(e) => set("infra", { por_cliente_mes: num(e) })} /></Campo>
        </div>
        <p className="mt-1 text-[10.5px] text-text-muted">Degraus da base (quando a base de clientes cruza o limite, a plataforma passa pro valor novo):</p>
        <div className="flex flex-col gap-1">
          {(p.infra?.degraus ?? []).map((d, i) => (
            <div key={i} className="form-linha items-center">
              <Campo label="A partir de (clientes)" ajuda="Quantidade de clientes ativos que dispara este degrau. Quando a base cruza esse número, a base mensal passa a ser a do degrau."><input type="number" step="1" className="input campo-num" value={d.a_partir_de_clientes} onChange={(e) => {
                const degraus = [...(p.infra?.degraus ?? [])]; degraus[i] = { ...d, a_partir_de_clientes: Number(e.target.value) }; set("infra", { degraus });
              }} /></Campo>
              <Campo label="Base mensal (R$)" ajuda="Quanto a plataforma passa a custar por mês depois que a base cruza o limite ao lado."><input type="number" step="0.01" className="input campo-dinheiro" value={d.base_mensal} onChange={(e) => {
                const degraus = [...(p.infra?.degraus ?? [])]; degraus[i] = { ...d, base_mensal: Number(e.target.value) }; set("infra", { degraus });
              }} /></Campo>
              <button type="button" className="mt-4 text-[11px] text-danger" onClick={() => set("infra", { degraus: (p.infra?.degraus ?? []).filter((_, j) => j !== i) })}>remover</button>
            </div>
          ))}
          <button type="button" className="self-start text-[11px] text-primary-deep underline" onClick={() => set("infra", { degraus: [...(p.infra?.degraus ?? []), { a_partir_de_clientes: 0, base_mensal: 0 }] })}>+ degrau</button>
        </div>
      </Secao>

      {/* 1.1.2 */}
      <Secao codigo="1.1.2" titulo="APIs e Plataformas de Terceiros (LLM)" total={t.llm}
        resumo={p.llm?.ativo ? `${brl2(llmCli)}/cliente ${p.llm.nivel_nome ?? ""}` : "desligado"}
        tooltip="Só o Fashion Mind usa LLM, e só a partir do 3º módulo (Premium): geração da apresentação de acompanhamento com leitura dos dados e texto. Estimativa de tokens por cliente por mês × preço por milhão (entrada e saída) × câmbio. Ajuste os tokens quando tiver medição real.">
        <div className="form-linha">
          <label className="mt-4 flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={p.llm?.ativo ?? false} onChange={(e) => set("llm", { ativo: e.target.checked })} /> Ativo<InfoTooltip texto="Desligado, o produto não consome LLM e a linha sai zero. Hoje só o Fashion Mind usa." /></label>
          <Campo label="Só clientes do nível" ajuda="Restringe o custo de IA a um nível do produto. Vazio = todos os clientes. Hoje só o Premium do Mind usa LLM.">
            <select className="input campo-select" value={p.llm?.nivel_nome ?? ""} onChange={(e) => set("llm", { nivel_nome: e.target.value })}>
              <option value="">— todos —</option>
              {produto.niveis.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Campo>
          <Campo label="Tokens entrada/mês" ajuda="Quanto texto o modelo LÊ por cliente por mês — os dados do cliente e as instruções. Entrada é mais barata que saída. Ajuste quando tiver medição real."><input type="number" step="1000" className="input campo-num" value={p.llm?.tokens_entrada_mes ?? ""} onChange={(e) => set("llm", { tokens_entrada_mes: num(e) })} /></Campo>
          <Campo label="Tokens saída/mês" ajuda="Quanto texto o modelo ESCREVE por cliente por mês — a apresentação de acompanhamento gerada. É a parte cara."><input type="number" step="1000" className="input campo-num" value={p.llm?.tokens_saida_mes ?? ""} onChange={(e) => set("llm", { tokens_saida_mes: num(e) })} /></Campo>
          <Campo label="US$/M entrada" ajuda="Preço de tabela do fornecedor por 1 milhão de tokens lidos, em dólar."><input type="number" step="0.01" className="input campo-pct" value={p.llm?.preco_milhao_entrada_usd ?? ""} onChange={(e) => set("llm", { preco_milhao_entrada_usd: num(e) })} /></Campo>
          <Campo label="US$/M saída" ajuda="Preço de tabela do fornecedor por 1 milhão de tokens escritos, em dólar."><input type="number" step="0.01" className="input campo-pct" value={p.llm?.preco_milhao_saida_usd ?? ""} onChange={(e) => set("llm", { preco_milhao_saida_usd: num(e) })} /></Campo>
          <Campo label="Câmbio R$/US$" ajuda="Câmbio usado para trazer o preço do fornecedor para real. Um cenário mais conservador usa um dólar mais alto aqui."><input type="number" step="0.01" className="input campo-pct" value={p.llm?.cambio ?? ""} onChange={(e) => set("llm", { cambio: num(e) })} /></Campo>
        </div>
      </Secao>

      {/* 1.1.3 */}
      <Secao codigo="1.1.3" titulo="Pessoal Direto — Suporte reativo" total={t.suporte}
        resumo={`${hSup.toFixed(3)} h/cliente × ${brl2(custoHora(p.suporte))}/h = ${brl2(hSup * custoHora(p.suporte))}/cliente`}
        tooltip="Antes de 'pago a partir de' quem atende é a equipe atual, sem custo extra — as horas continuam aparecendo na demanda. Suporte movido por tickets: (taxa de chamados × TMA em horas) × 1,20 de pausa/contexto. SaaS novo em lançamento tem taxa maior (15–20%); Price/Skills 5%, Mind 12%. TMA de 20 min = 0,33 h. O custo/hora vem da tabela pelo perfil escolhido.">
        <div className="form-linha">
          <Campo label="Pago a partir de" ajuda="Mês em que o suporte passa a custar. Antes disso quem atende são as sócias, sem custo de folha — as horas continuam aparecendo na demanda de contratação, só não viram despesa."><input type="month" className="input campo-data" value={(p.suporte?.inicio ?? "").slice(0, 7)} onChange={(e) => set("suporte", { inicio: e.target.value ? `${e.target.value}-01` : null })} /></Campo>
          <Campo label="% da base abre chamado/mês" ajuda="De cada 100 clientes ativos, quantos abrem pelo menos um chamado no mês. SaaS recém-lançado fica em 15–20%; produto maduro e simples, perto de 5%."><input type="number" step="0.1" className="input campo-pct" value={pct(p.suporte?.taxa_chamados_pct)} onChange={(e) => set("suporte", { taxa_chamados_pct: num(e) / 100 })} /></Campo>
          <Campo label="TMA (horas)" ajuda="Tempo médio de atendimento de um chamado, em horas. 0,33 h = 20 min. Multiplica pela quantidade de chamados do mês."><input type="number" step="0.01" className="input campo-pct" value={p.suporte?.tma_horas ?? ""} onChange={(e) => set("suporte", { tma_horas: num(e) })} /></Campo>
          <Campo label="Margem (×)" ajuda="Multiplicador do tempo que o cronômetro do chamado não pega: pausa entre atendimentos, registro, troca de contexto. 1,2 = 20% a mais."><input type="number" step="0.01" className="input campo-pct" value={p.suporte?.margem ?? ""} onChange={(e) => set("suporte", { margem: num(e) })} /></Campo>
          <PerfilSelect valor={p.suporte} cargos={cargos} perfis={perfis} onChange={(v) => set("suporte", v)} />
        </div>
      </Secao>

      <Secao codigo="1.1.3" titulo="Pessoal Direto — CS proativo" total={t.cs}
        resumo={p.cs_proativo?.ativo ? `${hCs.toFixed(2)} h/cliente × ${brl2(custoHora(p.cs_proativo))}/h = ${brl2(hCs * custoHora(p.cs_proativo))}/cliente` : "desligado"}
        tooltip="Régua de relacionamento: monitoramento de health score (15 min), cadência mensal (15 min) e QBR trimestral diluída (1h ÷ 3 = 20 min), × 1,20 de overhead/CRM ≈ 1,0 h/cliente/mês no mid-touch. Só o Mind tem CS proativo.">
        <div className="form-linha">
          <label className="mt-4 flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={p.cs_proativo?.ativo ?? false} onChange={(e) => set("cs_proativo", { ativo: e.target.checked })} /> Ativo<InfoTooltip texto="Liga a régua de CS proativo neste produto. Desligado, o produto só tem suporte reativo (por chamado). Hoje só o Fashion Mind tem CS proativo." /></label>
          <Campo label="Pago a partir de" ajuda="Mês em que o CS passa a custar. Antes disso o acompanhamento é feito pelas sócias, sem custo de folha — as horas continuam aparecendo na demanda de contratação, só não viram despesa."><input type="month" className="input campo-data" value={(p.cs_proativo?.inicio ?? "").slice(0, 7)} onChange={(e) => set("cs_proativo", { inicio: e.target.value ? `${e.target.value}-01` : null })} /></Campo>
          <Campo label="Monitoramento (h)" ajuda="Horas por cliente por mês só olhando o health score — uso, entregas, sinais de risco — sem contato com o cliente. 0,2 h = 12 min."><input type="number" step="0.01" className="input campo-pct" value={p.cs_proativo?.monitoramento_h ?? ""} onChange={(e) => set("cs_proativo", { monitoramento_h: num(e) })} /></Campo>
          <Campo label="Cadência (h)" ajuda="Horas por cliente por mês de contato ativo: o call ou o report mensal combinado no contrato. 0,25 h = 15 min."><input type="number" step="0.01" className="input campo-pct" value={p.cs_proativo?.cadencia_h ?? ""} onChange={(e) => set("cs_proativo", { cadencia_h: num(e) })} /></Campo>
          <Campo label="QBR diluída (h/mês)" ajuda="A revisão trimestral (QBR) dividida por 3, pra virar custo todo mês em vez de um pico a cada trimestre. Um QBR de 1 h vira 0,33 h/mês."><input type="number" step="0.01" className="input campo-pct" value={p.cs_proativo?.qbr_h_mes ?? ""} onChange={(e) => set("cs_proativo", { qbr_h_mes: num(e) })} /></Campo>
          <Campo label="Overhead (×)" ajuda="Multiplicador do tempo que não aparece na agenda: preparar o call, registrar no CRM, trocar de contexto. 1,2 = 20% sobre a soma das horas ao lado."><input type="number" step="0.01" className="input campo-pct" value={p.cs_proativo?.overhead ?? ""} onChange={(e) => set("cs_proativo", { overhead: num(e) })} /></Campo>
          <PerfilSelect valor={p.cs_proativo} cargos={cargos} perfis={perfis} onChange={(v) => set("cs_proativo", v)} />
        </div>
      </Secao>

      {/* 1.1.4 */}
      <Secao codigo="1.1.4" titulo="Softwares de Atendimento ao Cliente" total={t.software}
        resumo={(p.software_atendimento?.custo_mensal ?? 0) > 0 ? `${brl(p.software_atendimento!.custo_mensal!)}/mês` : "modelo interno — sem custo"}
        tooltip="Ferramenta de atendimento. Decisão atual: modelo interno, custo zero. Se um dia contratar (Intercom, Zendesk…), lance a mensalidade aqui.">
        <div className="form-linha">
          <Campo label="Custo mensal (R$)" ajuda="Mensalidade da ferramenta de atendimento (Intercom, Zendesk…). Zero = modelo interno, que é a decisão atual."><input type="number" step="0.01" className="input campo-dinheiro" value={p.software_atendimento?.custo_mensal ?? ""} onChange={(e) => set("software_atendimento", { custo_mensal: num(e) })} /></Campo>
        </div>
      </Secao>

      {/* 1.1.5 */}
      <Secao codigo="1.1.5" titulo="Sistemas de Pagamento (Gateway)" total={t.gateway}
        resumo={`cartão ${pct(p.gateway?.mix_cartao)}% · boleto ${pct(p.gateway?.mix_boleto)}% · pix ${pct(p.gateway?.mix_pix)}%`}
        tooltip="Asaas (set/2026): cartão 2,99% + R$0,49 por transação; boleto R$1,99; Pix R$1,99; sem mensalidade. Cada cobrança do mês (assinatura + parcela de implementação) passa pelo gateway na proporção do mix. Price/Skills são quase só cartão; Mind é misto.">
        <div className="form-linha">
          <Campo label="Mix cartão (%)" ajuda="De cada 100 cobranças do mês, quantas saem no cartão. Os três mixes somam 100%."><input type="number" step="1" className="input campo-pct" value={pct(p.gateway?.mix_cartao)} onChange={(e) => set("gateway", { mix_cartao: num(e) / 100 })} /></Campo>
          <Campo label="Mix boleto (%)" ajuda="Fatia das cobranças em boleto. Cliente maior e compra por empresa puxam esse número para cima."><input type="number" step="1" className="input campo-pct" value={pct(p.gateway?.mix_boleto)} onChange={(e) => set("gateway", { mix_boleto: num(e) / 100 })} /></Campo>
          <Campo label="Mix Pix (%)" ajuda="Fatia das cobranças em Pix."><input type="number" step="1" className="input campo-pct" value={pct(p.gateway?.mix_pix)} onChange={(e) => set("gateway", { mix_pix: num(e) / 100 })} /></Campo>
          <Campo label="Cartão (%)" ajuda="Percentual que o gateway cobra sobre o valor de cada cobrança no cartão. Asaas: 2,99%."><input type="number" step="0.01" className="input campo-pct" value={pct(p.gateway?.cartao_pct, 2)} onChange={(e) => set("gateway", { cartao_pct: num(e) / 100 })} /></Campo>
          <Campo label="Cartão fixo (R$)" ajuda="Tarifa fixa por transação no cartão, somada ao percentual. Asaas: R$ 0,49."><input type="number" step="0.01" className="input campo-pct" value={p.gateway?.cartao_fixo ?? ""} onChange={(e) => set("gateway", { cartao_fixo: num(e) })} /></Campo>
          <Campo label="Boleto (R$)" ajuda="Tarifa por boleto liquidado. Valor fixo, sem percentual."><input type="number" step="0.01" className="input campo-pct" value={p.gateway?.boleto_fixo ?? ""} onChange={(e) => set("gateway", { boleto_fixo: num(e) })} /></Campo>
          <Campo label="Pix (R$)" ajuda="Tarifa por cobrança recebida via Pix."><input type="number" step="0.01" className="input campo-pct" value={p.gateway?.pix_fixo ?? ""} onChange={(e) => set("gateway", { pix_fixo: num(e) })} /></Campo>
        </div>
      </Secao>

      {/* 1.1.6 */}
      <div className="flex items-center justify-between rounded-lg border border-dashed border-border bg-surface px-3 py-2">
        <span className="text-[11.5px]"><span className="font-mono text-[10px] text-text-faint">1.1.6</span> <span className="font-medium">Onboarding / Implementação</span> <span className="text-text-faint">· vem das etapas do produto e do canal de aquisição</span></span>
        <span className="font-mono text-[11.5px] font-semibold">{brl(t.implementacao)}</span>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-60">
          {pending ? "Salvando…" : `Salvar premissas — ${produto.nome}`}
        </button>
        {state.error && <p className="text-[11.5px] text-danger">{state.error}</p>}
        {state.success && <p className="text-[11.5px] text-success">Salvo. Recalcule a simulação para os totais atualizarem.</p>}
      </div>
    </form>
  );
}

function Secao({ codigo, titulo, total, resumo, tooltip, children }: { codigo: string; titulo: string; total: number; resumo: string; tooltip: string; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-surface">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span className="flex items-center text-[11.5px]">
          <span className="mr-1.5 font-mono text-[10px] text-text-faint">{codigo}</span>
          <span className="font-medium">{titulo}</span>
          <span className="ml-2 text-[10.5px] text-text-muted">{resumo}</span>
          <InfoTooltip texto={tooltip} />
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11.5px] font-semibold">{brl(total)}</span>
          <span className="text-[9.5px] text-text-faint">no período</span>
          <span className="text-text-faint">{aberto ? "▲" : "▼"}</span>
        </span>
      </button>
      {aberto && <div className="border-t border-border-soft px-3 py-2.5">{children}</div>}
    </div>
  );
}

function PerfilSelect({ valor, cargos, perfis, onChange }: {
  valor: { cargo?: string; tipo_contratacao?: string; senioridade?: string } | undefined;
  cargos: string[]; perfis: PerfilHora[];
  onChange: (v: { cargo?: string; tipo_contratacao?: string; senioridade?: string }) => void;
}) {
  const vh = perfis.find((x) => x.cargo === valor?.cargo && x.tipo_contratacao === valor?.tipo_contratacao && x.senioridade === valor?.senioridade)?.valor_hora;
  return (
    <>
      <Campo label="Perfil (cargo)" ajuda="Quem faz esse trabalho. O cargo é só o filtro que busca o valor na tabela de custo/hora — escolher aqui não contrata ninguém nem cria alocação.">
        <select className="input campo-select" value={valor?.cargo ?? ""} onChange={(e) => onChange({ cargo: e.target.value })}>
          <option value="">—</option>
          {cargos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Campo>
      <Campo label="Contratação" ajuda="CLT ou PJ. Muda o valor lido na tabela: o custo/hora de CLT já vem com encargos embutidos.">
        <select className="input campo-pct" value={valor?.tipo_contratacao ?? ""} onChange={(e) => onChange({ tipo_contratacao: e.target.value })}>
          <option value="">—</option><option value="clt">CLT</option><option value="pj">PJ</option>
        </select>
      </Campo>
      <Campo label="Senioridade" ajuda="Júnior, pleno ou sênior — o terceiro filtro da tabela de custo/hora. Perfil mais sênior atende em menos tempo, mas a hora custa mais.">
        <select className="input campo-pct" value={valor?.senioridade ?? ""} onChange={(e) => onChange({ senioridade: e.target.value })}>
          <option value="">—</option>
          {["junior", "pleno", "senior"].map((s) => <option key={s} value={s}>{SENIORIDADE_LABEL[s]}</option>)}
        </select>
      </Campo>
      <Campo label="Custo/hora" ajuda="Valor lido na tabela a partir de cargo + contratação + senioridade. Não se digita aqui: para mudar, edite em Contratações → Custo/hora."><span className="mt-1.5 block font-mono text-[12px]">{vh != null ? brl2(vh) : "—"}</span></Campo>
    </>
  );
}

function Campo({ label, ajuda, children }: { label: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="form-campo">
      <label>
        {label}
        {ajuda && <InfoTooltip texto={ajuda} />}
      </label>
      {children}
    </div>
  );
}

function num(e: React.ChangeEvent<HTMLInputElement>): number {
  return e.target.value === "" ? 0 : Number(e.target.value);
}
function pct(v: number | undefined, casas = 1): string {
  return v == null ? "" : (v * 100).toFixed(casas);
}
