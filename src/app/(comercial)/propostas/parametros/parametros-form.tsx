"use client";

import { useState, useTransition } from "react";
import { custoPorGb, type ParametrosPrecificacao } from "@/lib/precificacao";
import { salvarParametrosPrecificacao } from "./actions";

type Caminho = string; // "estimativa.faturamento_por_loja"

const GRUPOS: { titulo: string; nota: string; campos: { k: Caminho; label: string; tipo?: "pct" | "num" | "int"; ajuda?: string }[] }[] = [
  {
    titulo: "Margens e tabela comercial",
    nota: "A margem alvo entra na fórmula do preço. A tabela comercial é até onde o vendedor desconta sem validação das sócias.",
    campos: [
      { k: "margens.mensalidade_pct", label: "Margem alvo da mensalidade", tipo: "pct" },
      { k: "margens.implantacao_pct", label: "Margem alvo da implantação", tipo: "pct" },
      { k: "tabela_comercial.desconto_max_mensalidade_pct", label: "Desconto máximo sem validação · mensalidade", tipo: "pct" },
      { k: "tabela_comercial.desconto_max_implantacao_pct", label: "Desconto máximo sem validação · implantação", tipo: "pct" },
      { k: "imposto.aliquota_fixa", label: "Alíquota de imposto usada no preço", tipo: "pct", ajuda: "Simples: 6% no Anexo III primeira faixa; o app vai ler do Base quando o plano estiver refeito" },
    ],
  },
  {
    titulo: "Suporte e rateio",
    nota: "Suporte é a média do negócio inteiro (horas por cliente ao mês), não por cliente ou módulo.",
    campos: [
      { k: "suporte.horas_mes_media", label: "Horas médias de suporte por cliente/mês", tipo: "num" },
      { k: "suporte.cargo", label: "Cargo (tabela de custo/hora)" },
      { k: "suporte.senioridade", label: "Senioridade (junior, pleno, senior)" },
      { k: "suporte.tipo_contratacao", label: "Contratação (clt, pj)" },
      { k: "rateio.clientes_fixo", label: "Clientes para rateio quando o modo for fixo", tipo: "int", ajuda: "Modo atual: clientes previstos no Base. Enquanto o custo fixo da plataforma for zero, o rateio é zero." },
    ],
  },
  {
    titulo: "Implantação",
    nota: "Pacote fixo por cliente, independente dos módulos. Horas e custo vêm das etapas cadastradas no plano Base.",
    campos: [
      { k: "implantacao.prazo_dias", label: "Prazo para o cliente (dias)", tipo: "int" },
      { k: "implantacao.reducao_integracao_pct", label: "Redução com ERP integrado (ex.: Matriz Sistemas)", tipo: "pct" },
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

export function ParametrosForm({ params }: { params: ParametrosPrecificacao }) {
  const inicial: Record<string, string> = {};
  for (const g of GRUPOS) for (const c of g.campos) {
    const v = get(params, c.k);
    inicial[c.k] = v == null ? "" : c.tipo === "pct" ? String(Number(v) * 100).replace(".", ",") : String(v).replace(".", ",");
  }
  const [valores, setValores] = useState(inicial);
  const [arred, setArred] = useState(!!params.arredondar_90);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, start] = useTransition();
  const [aberto, setAberto] = useState<string | null>(GRUPOS[0].titulo);

  const montar = (): ParametrosPrecificacao => {
    const novo = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
    for (const g of GRUPOS) for (const c of g.campos) {
      const t = valores[c.k];
      if (!c.tipo) { set(novo, c.k, t.trim()); continue; }
      const n = Number(String(t).replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(n)) continue;
      set(novo, c.k, c.tipo === "pct" ? n / 100 : c.tipo === "int" ? Math.round(n) : n);
    }
    set(novo, "arredondar_90", arred);
    set(novo, "rateio.modo", (params.rateio?.modo ?? "clientes_previstos"));
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

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold">Parâmetros de precificação</h2>
        <span className="text-[11.5px] text-text-muted">Custo por GB resultante: <b>R$ {custoGb.toFixed(2).replace(".", ",")}</b>/mês</span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {GRUPOS.map((g) => (
          <div key={g.titulo} className="rounded-lg border border-border-soft">
            <button type="button" onClick={() => setAberto((a) => (a === g.titulo ? null : g.titulo))} className="flex w-full items-center justify-between px-3 py-2 text-left">
              <span className="text-[12.5px] font-medium">{g.titulo}</span>
              <span className="text-[11px] text-text-faint">{aberto === g.titulo ? "▲" : "▼"}</span>
            </button>
            {aberto === g.titulo && (
              <div className="border-t border-border-soft px-3 py-2">
                <p className="mb-2 text-[11px] text-text-muted">{g.nota}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {g.campos.map((c) => (
                    <label key={c.k} className="flex flex-col gap-0.5 text-[11.5px]">
                      <span className="text-text-muted">{c.label}{c.tipo === "pct" ? " (%)" : ""}</span>
                      <input value={valores[c.k] ?? ""} onChange={(e) => { setSalvo(false); setValores((v) => ({ ...v, [c.k]: e.target.value })); }} className="input input-compacto" inputMode={c.tipo ? "decimal" : "text"} />
                      {c.ajuda && <span className="text-[10px] text-text-faint">{c.ajuda}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={arred} onChange={(e) => { setSalvo(false); setArred(e.target.checked); }} className="accent-wine" /> Arredondar a mensalidade para terminar em ,90
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={pendente} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">{pendente ? "Salvando…" : "Salvar parâmetros"}</button>
        {salvo && <span className="text-[11.5px] text-success">Salvo — as próximas propostas usam estes valores; as salvas não mudam.</span>}
        {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
      </div>
    </div>
  );
}
