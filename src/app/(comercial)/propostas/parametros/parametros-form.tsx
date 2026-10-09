"use client";

import { useState, useTransition } from "react";
import { custoPorGb, type ParametrosPrecificacao } from "@/lib/precificacao";
import type { BasesProposta, CargoHora } from "@/lib/precificacao-bases";
import type { EtapaImplantacao } from "@/lib/precificacao";
import type { TaxaPagamento } from "@/lib/taxas-pagamento";
import { CargoManager } from "./cargo-manager";
import { ImplantacaoEtapas } from "./implantacao-etapas";
import { CustoFuncionalidades } from "./custo-funcionalidades";
import { ImplantacaoPreview } from "./implantacao-preview";
import { SimuladorDesconto } from "./simulador-desconto";
import { TaxasPagamentoCard } from "@/app/(app)/configuracoes/taxas-pagamento-card";
import { salvarParametrosPrecificacao } from "./actions";

type Caminho = string; // "estimativa.faturamento_por_loja"

const GRUPOS: { titulo: string; nota: string; campos: { k: Caminho; label: string; tipo?: "pct" | "num" | "int"; ajuda?: string }[] }[] = [
  {
    titulo: "Margens e tabela comercial",
    nota: "A margem alvo da mensalidade entra na fórmula do preço. A tabela comercial é até onde o vendedor desconta sem validação das sócias. A margem e o desconto da implantação ficam na aba Implantação.",
    campos: [
      { k: "margens.mensalidade_pct", label: "Margem alvo da mensalidade", tipo: "pct" },
      { k: "tabela_comercial.desconto_max_mensalidade_pct", label: "Desconto máximo sem validação · mensalidade", tipo: "pct" },
      { k: "imposto.aliquota_fixa", label: "Alíquota de imposto usada no preço", tipo: "pct", ajuda: "Simples: 6% no Anexo III primeira faixa; o app vai ler do Base quando o plano estiver refeito" },
    ],
  },
  {
    titulo: "Margem e desconto da implantação",
    nota: "A margem alvo entra na fórmula do preço da implantação; o desconto máximo é até onde o vendedor baixa sem validação.",
    campos: [
      { k: "margens.implantacao_pct", label: "Margem alvo da implantação", tipo: "pct" },
      { k: "tabela_comercial.desconto_max_implantacao_pct", label: "Desconto máximo sem validação · implantação", tipo: "pct" },
    ],
  },
  {
    titulo: "Infraestrutura, rateio e processamento",
    nota: "Custo fixo da plataforma (instância do banco, plano, domínio) rateado entre os clientes — é COGS. Processamento é o que as consultas e agregações no banco consomem, e cresce com o volume de dados do cliente (não com usuários).",
    campos: [
      { k: "custo_fixo_infra_mes", label: "Custo fixo de infraestrutura (R$/mês)", tipo: "num", ajuda: "Usado quando o Base ainda não traz o número" },
      { k: "rateio.clientes_fixo", label: "Clientes para ratear o fixo", tipo: "int", ajuda: "Meta de clientes; não divida pelos poucos de hoje" },
      { k: "processamento.reais_por_gb_mes", label: "Processamento base (R$ por GB/mês)", tipo: "num", ajuda: "Enriquecimento diário que mantém o banco pronto" },
      { k: "processamento.reais_por_gb_processado", label: "Processamento por passada (R$ por GB processado)", tipo: "num", ajuda: "Custo de reprocessar 1 GB uma vez; base do custo por funcionalidade" },
    ],
  },
  {
    titulo: "Implantação",
    nota: "Prazo para o cliente; as etapas ficam na tabela acima. Integração nativa = etapas padrão; não-nativa soma as etapas marcadas como 'só não-nativo'.",
    campos: [
      { k: "implantacao.prazo_dias", label: "Prazo para o cliente (dias)", tipo: "int" },
    ],
  },
  {
    titulo: "Elegibilidade do Mind",
    nota: "O Fashion Mind não é vendido abaixo de um faturamento. Entre o mínimo e o ideal, a proposta avisa para avaliar caso a caso.",
    campos: [
      { k: "elegibilidade.mind_faturamento_min", label: "Faturamento mínimo para o Mind (R$/ano)", tipo: "num" },
      { k: "elegibilidade.mind_faturamento_ideal", label: "Faturamento ideal do Mind (R$/ano)", tipo: "num" },
    ],
  },
  {
    titulo: "Plano fechado para marca pequena",
    nota: "Preço fixo, sem desconto. A proposta oferece quando o perfil cabe.",
    campos: [
      { k: "plano_pequeno.nome", label: "Nome" },
      { k: "plano_pequeno.preco_mensal", label: "Preço mensal (R$)", tipo: "num" },
      { k: "plano_pequeno.faturamento_max", label: "Faturamento anual máximo (R$)", tipo: "num" },
      { k: "plano_pequeno.lojas_max", label: "Lojas máximas", tipo: "int" },
      { k: "plano_pequeno.usuarios_max", label: "Usuários máximos", tipo: "int" },
    ],
  },
  {
    titulo: "Custo do banco de dados",
    nota: "Supabase, 07/10/2026. Custo por GB = (disco + memória × % do volume) × câmbio.",
    campos: [
      { k: "custo_gb.disco_usd_gb", label: "Disco (US$ por GB/mês)", tipo: "num" },
      { k: "custo_gb.memoria_usd_gb", label: "Memória (US$ por GB/mês)", tipo: "num" },
      { k: "custo_gb.memoria_pct_volume", label: "Memória necessária, % do volume", tipo: "pct" },
      { k: "custo_gb.cambio", label: "Câmbio (R$/US$)", tipo: "num" },
    ],
  },
  {
    titulo: "Regras de estimativa do volume",
    nota: "Perfil de referência: varejo multimarca de calçados, cauda longa, preço médio R$ 100. Quando um teste mostrar outro número, ajuste aqui.",
    campos: [
      { k: "estimativa.faturamento_por_loja", label: "Faturamento médio por loja física (R$/ano)", tipo: "num" },
      { k: "estimativa.parte_atacado_sobra", label: "Da sobra depois das lojas, parte do atacado", tipo: "pct" },
      { k: "estimativa.pecas_por_modelo_cor_ano", label: "Peças vendidas por modelo-cor ao ano", tipo: "num" },
      { k: "estimativa.mix_por_loja", label: "% do mix em cada loja", tipo: "pct" },
      { k: "estimativa.mix_por_cd", label: "% do mix em cada CD", tipo: "pct" },
      { k: "estimativa.mix_ecommerce", label: "% do mix no e-commerce", tipo: "pct" },
      { k: "estimativa.cds_por_cliente", label: "CDs por cliente", tipo: "int" },
      { k: "estimativa.pecas_por_linha_atacado", label: "Peças por linha de venda no atacado", tipo: "num" },
      { k: "estimativa.pedidos_por_modelo_cor", label: "Pedidos (insumos/serviços) por modelo-cor", tipo: "num" },
      { k: "estimativa.insumos_por_modelo_cor", label: "Insumos por modelo-cor (fichas do Skills)", tipo: "num" },
      { k: "estimativa.meses_guardados", label: "Meses guardados", tipo: "int" },
      { k: "estimativa.bytes_estoque", label: "Bytes por linha de estoque", tipo: "int" },
      { k: "estimativa.bytes_venda", label: "Bytes por linha de venda", tipo: "int" },
      { k: "estimativa.bytes_pedido", label: "Bytes por linha de pedido", tipo: "int" },
      { k: "estimativa.bytes_mensal_price", label: "Bytes por linha mensal (Price)", tipo: "int" },
      { k: "estimativa.bytes_ficha_skills", label: "Bytes por ficha (Skills)", tipo: "int" },
      { k: "estimativa.fator_sobrecarga", label: "Fator de sobrecarga do banco", tipo: "num" },
      { k: "estimativa.outros_gb_por_cliente", label: "Outros dados por cliente (GB)", tipo: "num" },
      { k: "estimativa.preco_medio_padrao", label: "Preço médio padrão (R$)", tipo: "num" },
    ],
  },
  {
    titulo: "Piso de preço por faturamento (lógica de valor)",
    nota: "Cliente acima de um faturamento paga no mínimo este preço, mesmo sem lojas ou canais. Serve para o atacado grande não ficar barato demais frente ao varejo. Ligue no seletor abaixo.",
    campos: [
      { k: "piso_por_faturamento.faturamento_min", label: "Faturamento mínimo para o piso (R$/ano)", tipo: "num" },
      { k: "piso_por_faturamento.preco_min", label: "Preço mínimo da mensalidade (R$)", tipo: "num" },
    ],
  },
];

function get(obj: unknown, caminho: string): unknown {
  return caminho.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}
function set(obj: Record<string, unknown>, caminho: string, valor: unknown) {
  const partes = caminho.split(".");
  let o = obj;
  for (const k of partes.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== "object") o[k] = {};
    o = o[k] as Record<string, unknown>;
  }
  o[partes[partes.length - 1]] = valor;
}

type Sup = ParametrosPrecificacao["suporte"];
type Aba = "infra" | "implantacao" | "taxas" | "suporte" | "parametros";
const ABAS: { key: Aba; label: string }[] = [
  { key: "infra", label: "Infra" },
  { key: "taxas", label: "Taxas" },
  { key: "suporte", label: "Suporte e CS" },
  { key: "implantacao", label: "Implantação" },
  { key: "parametros", label: "Parâmetros + simulador" },
];

export function ParametrosForm({ params, cargos, taxas, bases }: { params: ParametrosPrecificacao; cargos: CargoHora[]; taxas: TaxaPagamento[]; bases: BasesProposta }) {
  const inicial: Record<string, string> = {};
  for (const g of GRUPOS) for (const c of g.campos) {
    const v = get(params, c.k);
    inicial[c.k] = v == null ? "" : c.tipo === "pct" ? String(Number(v) * 100).replace(".", ",") : String(v).replace(".", ",");
  }
  const [aba, setAba] = useState<Aba>("infra");
  const [valores, setValores] = useState(inicial);
  const [sup, setSup] = useState<Sup>(params.suporte);
  const chaveCargo = (r: { cargo: string; senioridade: string; tipo_contratacao: string }) => `${r.cargo}|${r.senioridade}|${r.tipo_contratacao}`;
  const taxaHora = (r: { cargo: string; senioridade: string; tipo_contratacao: string }) => cargos.find((c) => c.cargo === r.cargo && c.senioridade === r.senioridade && c.tipo_contratacao === r.tipo_contratacao)?.valor_hora ?? 0;
  const setServico = (srv: "reativo" | "cs" | "monitoramento", patch: Partial<Sup["reativo"]>) => { setSalvo(false); setSup((x) => ({ ...x, [srv]: { ...x[srv], ...patch } })); };
  const setHoras = (campo: "reativo_horas" | "cs_horas" | "monitoramento_horas", v: number) => { setSalvo(false); setSup((x) => ({ ...x, [campo]: v })); };
  const [etapas, setEtapas] = useState<EtapaImplantacao[]>(params.implantacao.etapas ?? []);
  const [arred, setArred] = useState(!!params.arredondar_90);
  const [pisoAtivo, setPisoAtivo] = useState(!!params.piso_por_faturamento?.ativo);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, start] = useTransition();

  const montar = (): ParametrosPrecificacao => {
    const novo = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
    for (const g of GRUPOS) for (const c of g.campos) {
      const t = valores[c.k];
      if (!c.tipo) { set(novo, c.k, t.trim()); continue; }
      const n = Number(String(t).replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(n)) continue;
      set(novo, c.k, c.tipo === "pct" ? n / 100 : c.tipo === "int" ? Math.round(n) : n);
    }
    set(novo, "suporte", sup);
    set(novo, "implantacao.etapas", etapas);
    set(novo, "arredondar_90", arred);
    set(novo, "piso_por_faturamento.ativo", pisoAtivo);
    set(novo, "rateio.modo", "fixo");
    set(novo, "implantacao.prazos_permitidos", ["avista", "3x", "5x"]);
    return novo as unknown as ParametrosPrecificacao;
  };
  const salvar = () => {
    setErro(null); setSalvo(false);
    start(async () => {
      const r = await salvarParametrosPrecificacao(montar());
      if (r.error) setErro(r.error); else setSalvo(true);
    });
  };
  const custoGb = (() => { try { return custoPorGb(montar().custo_gb); } catch { return 0; } })();

  const campoLabel = (c: { k: Caminho; label: string; tipo?: "pct" | "num" | "int"; ajuda?: string }) => (
    <label key={c.k} className="flex flex-col gap-0.5 text-[11.5px]">
      <span className="text-text-muted">{c.label}{c.tipo === "pct" ? " (%)" : ""}</span>
      <input value={valores[c.k] ?? ""} onChange={(e) => { setSalvo(false); setValores((v) => ({ ...v, [c.k]: e.target.value })); }} className="input input-compacto" inputMode={c.tipo ? "decimal" : "text"} />
      {c.ajuda && <span className="text-[10px] text-text-faint">{c.ajuda}</span>}
    </label>
  );
  const grupo = (titulo: string) => GRUPOS.find((g) => g.titulo === titulo);
  const cardGrupo = (titulo: string) => {
    const g = grupo(titulo);
    if (!g) return null;
    return (
      <div className="rounded-lg border border-border-soft p-3">
        <h3 className="text-[12.5px] font-medium">{g.titulo}</h3>
        <p className="mb-2 mt-0.5 text-[11px] text-text-muted">{g.nota}</p>
        <div className="grid grid-cols-1 gap-x-3 gap-y-1.5">{g.campos.map(campoLabel)}</div>
      </div>
    );
  };

  const barraSalvar = (
    <div className="mt-3 flex items-center gap-3">
      <button type="button" disabled={pendente} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">{pendente ? "Salvando…" : "Salvar parâmetros"}</button>
      {salvo && <span className="text-[11.5px] text-success">Salvo — as próximas propostas usam estes valores; as salvas não mudam.</span>}
      {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold">COGS · parâmetros de custo e preço</h2>
        <span className="text-[11.5px] text-text-muted">Custo por GB resultante: <b>R$ {custoGb.toFixed(2).replace(".", ",")}</b>/mês</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 border-b border-border">
        {ABAS.map((a) => (
          <button key={a.key} type="button" onClick={() => setAba(a.key)} className={`-mb-px border-b-2 px-3 py-1.5 text-[12.5px] font-medium transition-colors ${aba === a.key ? "border-wine text-wine-deep" : "border-transparent text-text-muted hover:text-text"}`}>{a.label}</button>
        ))}
      </div>

      <div className="mt-3">
        {aba === "infra" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                {cardGrupo("Infraestrutura, rateio e processamento")}
                {cardGrupo("Custo do banco de dados")}
              </div>
              {cardGrupo("Regras de estimativa do volume")}
            </div>
            <CustoFuncionalidades modulos={bases.modulos} blocos={bases.blocos} />
          </div>
        )}

        {aba === "implantacao" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border-soft p-3">
              <h3 className="text-[12.5px] font-medium">Implantação</h3>
              <p className="mb-2 mt-0.5 text-[11px] text-text-muted">Pacote por cliente. Cada etapa é mão de obra (o cargo puxa o custo/hora) ou um serviço com custo direto. Marque &quot;só não-nativo&quot; nas etapas que só valem quando a integração não é pronta (ex.: construir o conector).</p>
              <ImplantacaoEtapas etapas={etapas} cargos={cargos} onChange={(e) => { setSalvo(false); setEtapas(e); }} />
              <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
                {grupo("Implantação")?.campos.map(campoLabel)}
                {grupo("Margem e desconto da implantação")?.campos.map(campoLabel)}
              </div>
            </div>
            <ImplantacaoPreview params={montar()} bases={bases} />
          </div>
        )}

        {aba === "taxas" && <TaxasPagamentoCard taxas={taxas} />}

        {aba === "suporte" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border-soft p-3">
              <h3 className="text-[12.5px] font-medium">Suporte (horas por cliente/mês e cargo)</h3>
              <p className="mb-2 mt-0.5 text-[11px] text-text-muted">Escolha o cargo de cada serviço; o custo da hora vem da lista de cargos. Benchmark: reativo 2-4 h, CS 1,5-3 h, monitoramento 2-5 h.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px]">
                  <thead><tr className="text-left text-text-faint"><th className="py-1 pr-2 font-medium">Serviço</th><th className="py-1 pr-2 font-medium">Horas/mês</th><th className="py-1 pr-2 font-medium">Cargo · senioridade · contratação</th><th className="py-1 pr-2 text-right font-medium">R$/h</th></tr></thead>
                  <tbody>
                    {([["reativo", "Suporte reativo (chamados)", "reativo_horas"], ["cs", "CS ativo (retenção e adoção)", "cs_horas"], ["monitoramento", "Monitoramento / DevOps", "monitoramento_horas"]] as const).map(([srv, label, hk]) => {
                      const ref = sup[srv];
                      return (
                        <tr key={srv} className="border-t border-border-soft">
                          <td className="py-1 pr-2 font-medium">{label}</td>
                          <td className="py-1 pr-2"><input value={sup[hk]} onChange={(e) => setHoras(hk, Number(e.target.value.replace(",", ".")) || 0)} className="input input-compacto w-16 text-right" inputMode="decimal" /></td>
                          <td className="py-1 pr-2">
                            <select value={chaveCargo(ref)} onChange={(e) => { const [cargo, senioridade, tipo_contratacao] = e.target.value.split("|"); setServico(srv, { cargo, senioridade, tipo_contratacao }); }} className="input input-compacto w-full">
                              {!cargos.some((c) => chaveCargo(c) === chaveCargo(ref)) && <option value={chaveCargo(ref)}>{ref.cargo} · {ref.senioridade} · {ref.tipo_contratacao}</option>}
                              {cargos.map((c) => <option key={chaveCargo(c)} value={chaveCargo(c)}>{c.cargo} · {c.senioridade} · {c.tipo_contratacao} — R$ {c.valor_hora}/h</option>)}
                            </select>
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums">R$ {taxaHora(ref).toLocaleString("pt-BR")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <CargoManager cargos={cargos} />
          </div>
        )}

        {aba === "parametros" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-3">
              {cardGrupo("Margens e tabela comercial")}
              {cardGrupo("Plano fechado para marca pequena")}
              <div className="flex flex-col gap-3">
                {cardGrupo("Elegibilidade do Mind")}
                {cardGrupo("Piso de preço por faturamento (lógica de valor)")}
                <div className="rounded-lg border border-border-soft p-3">
                  <h3 className="text-[12.5px] font-medium">Opções de preço</h3>
                  <label className="mt-2 flex items-center gap-2 text-[12px]"><input type="checkbox" checked={arred} onChange={(e) => { setSalvo(false); setArred(e.target.checked); }} className="accent-wine" /> Arredondar a mensalidade (termina em 9, degraus de 30)</label>
                  <label className="mt-2 flex items-center gap-2 text-[12px]"><input type="checkbox" checked={pisoAtivo} onChange={(e) => { setSalvo(false); setPisoAtivo(e.target.checked); }} className="accent-wine" /> Aplicar o piso de preço por faturamento</label>
                </div>
              </div>
            </div>
            <SimuladorDesconto bases={bases} />
          </div>
        )}
      </div>

      {aba !== "taxas" && barraSalvar}
    </div>
  );
}
