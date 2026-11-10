import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Itinerario, type ItemViagem, type AnexoViagem } from "./itinerario";
import { MapaPessoas } from "./mapa-pessoas";
import { ExcluirViagem } from "./excluir-viagem";
import { dataLocal } from "@/lib/agenda-combinada";
import { montarMapaViagem } from "@/lib/viagem-mapa";

// Ler o e-ticket com IA pode levar até ~1 min; o padrão da Vercel é curto demais.
export const maxDuration = 300;

const fmtDia = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : null);

export default async function ViagemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: viagem } = await supabase.from("viagens").select("id, titulo, destino, data_inicio, data_fim, observacoes").eq("id", id).maybeSingle();
  if (!viagem) notFound();

  const [{ data: itens }, { data: anexos }, { data: participantes }, { data: pessoas }, { data: despesas }, { data: planoContas }, { data: meiosPagamento }, { data: todasDespesasContas }, { data: programas }] = await Promise.all([
    supabase.from("viagem_itens").select("*").eq("viagem_id", id).order("inicio", { ascending: true, nullsFirst: false }).order("created_at"),
    supabase.from("viagem_anexos").select("id, item_id, nome_arquivo, caminho_arquivo, tipo_mime").eq("viagem_id", id).order("created_at"),
    supabase.from("viagem_participantes").select("profile_id").eq("viagem_id", id),
    supabase.from("profiles").select("id, nome, cartao_dia_vencimento, cartao_dias_fechamento_antes").in("papel", ["socia", "equipe"]).order("nome"),
    supabase.from("despesas").select("id, data_gasto, valor_total, descricao, comprovado, plano_contas:plano_contas_id(conta)").eq("viagem_id", id).order("data_gasto"),
    supabase.from("plano_contas").select("id, codigo, conta, tipo").in("tipo", ["cogs", "opex", "financeiro", "ativo"]).order("codigo"),
    supabase.from("meios_pagamento").select("id, banco, tipo, titular_tipo, titular_pessoa_id, bandeira, dia_vencimento, dias_fechamento_antes, programa_id").eq("ativo", true).order("banco"),
    supabase.from("despesas").select("plano_contas_id"),
    supabase.from("programas_investimento").select("id, nome").order("nome"),
  ]);
  type DespesaRow = { id: string; data_gasto: string; valor_total: number; descricao: string | null; comprovado: boolean; plano_contas: { conta: string } | { conta: string }[] | null };
  const gastos = (despesas ?? []) as DespesaRow[];
  const totalGastos = gastos.reduce((s, d) => s + Number(d.valor_total || 0), 0);
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const contaDe = (d: DespesaRow) => (Array.isArray(d.plano_contas) ? d.plano_contas[0]?.conta : d.plano_contas?.conta) ?? "—";

  const nomePorId = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));
  const cap = (n?: string) => (n ? n.charAt(0).toUpperCase() + n.slice(1) : "");
  const quem = (participantes ?? []).map((p) => cap(nomePorId.get(p.profile_id))).filter(Boolean);
  const faixa = [fmtDia(viagem.data_inicio), fmtDia(viagem.data_fim)].filter(Boolean).join(" até ");

  // "Quem está" por item + participantes da viagem (checkboxes do item e mapa)
  const itensV = (itens ?? []) as ItemViagem[];
  const itemIds = itensV.map((i) => i.id);
  const { data: vip } = itemIds.length
    ? await supabase.from("viagem_item_participantes").select("item_id, profile_id").in("item_id", itemIds)
    : { data: [] as { item_id: string; profile_id: string }[] };
  const participantesPorItem: Record<string, string[]> = {};
  for (const r of vip ?? []) (participantesPorItem[r.item_id] ??= []).push(r.profile_id);
  const participantesViagem = (participantes ?? [])
    .map((p) => ({ id: p.profile_id, nome: nomePorId.get(p.profile_id) ?? "" }))
    .filter((p) => p.nome);

  // Dados pro passo de custo+pagamento do assistente (mesmos do formulário de Custos).
  const pessoasPagamento = (pessoas ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    cartao_dia_vencimento: p.cartao_dia_vencimento,
    cartao_dias_fechamento_antes: p.cartao_dias_fechamento_antes,
  }));
  const pagadores = (pessoas ?? []).map((p) => p.nome);
  const usoPorConta: Record<string, number> = {};
  for (const d of todasDespesasContas ?? []) {
    if (!d.plano_contas_id) continue;
    usoPorConta[d.plano_contas_id] = (usoPorConta[d.plano_contas_id] ?? 0) + 1;
  }

  // A régua (mapa por pessoa) vem primeiro: durante a viagem, "onde está cada uma hoje" é a
  // pergunta que mais se faz — o itinerário completo e os custos vêm depois.
  const mapa = montarMapaViagem(viagem, participantesViagem, itensV, participantesPorItem);
  const hoje = dataLocal(new Date().toISOString());
  const hojeIndex = mapa ? mapa.dias.indexOf(hoje) : -1;
  const estado = !viagem.data_inicio ? null : hoje < viagem.data_inicio ? "proxima" : viagem.data_fim && hoje > viagem.data_fim ? "passada" : "andamento";
  const diasAte = viagem.data_inicio ? Math.round((new Date(`${viagem.data_inicio}T00:00:00Z`).getTime() - new Date(`${hoje}T00:00:00Z`).getTime()) / 86400000) : null;
  const selo = estado === "andamento" ? "Acontecendo agora" : estado === "proxima" ? (diasAte === 1 ? "Amanhã" : `Em ${diasAte} dias`) : estado === "passada" ? "Passada" : null;

  return (
    <div>
      <Link href="/viagens" className="text-[12px] font-medium text-primary-deep">← Viagens</Link>
      <div className="mt-2 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-[22px] font-semibold">{viagem.titulo}</h1>
            {selo && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${estado === "andamento" ? "bg-success-soft text-success" : estado === "proxima" ? "bg-primary-soft text-primary-deep" : "bg-bg text-text-faint"}`}>{selo}</span>}
          </div>
          <ExcluirViagem id={viagem.id} titulo={viagem.titulo} />
        </div>
        <p className="mt-1 text-[13px] text-text-muted">
          {[viagem.destino, faixa].filter(Boolean).join(" · ") || "Sem datas"}
          {quem.length > 0 && ` · ${quem.join(", ")}`}
        </p>
        {viagem.observacoes && <p className="mt-1 text-[12px] text-text-faint">{viagem.observacoes}</p>}
      </div>

      <div className="mb-5 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 font-heading text-sm font-semibold">Onde está cada uma</h2>
        {mapa && mapa.faixas.length > 0 ? (
          <MapaPessoas mapa={mapa} hojeIndex={hojeIndex} />
        ) : (
          <p className="text-[12px] text-text-muted">A régua aparece quando a viagem tiver datas e o primeiro voo ou hospedagem.</p>
        )}
      </div>

      <Itinerario
        viagemId={viagem.id}
        itens={itensV}
        anexos={(anexos ?? []) as AnexoViagem[]}
        participantesViagem={participantesViagem}
        participantesPorItem={participantesPorItem}
        planoContas={planoContas ?? []}
        usoPorConta={usoPorConta}
        meiosPagamento={meiosPagamento ?? []}
        pessoas={pessoasPagamento}
        pagadores={pagadores}
        programas={programas ?? []}
        cores={mapa?.cores ?? {}}
      />

      <div className="mt-6 rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">Custos da viagem</h2>
          <span className="text-[13px] font-semibold tabular-nums">{brl(totalGastos)}</span>
        </div>
        {gastos.length === 0 ? (
          <p className="text-[12px] text-text-muted">
            Nenhum custo lançado ainda. Ao adicionar um item com valor, o custo entra no Lançamentos já classificado e com a forma de pagamento — e aparece aqui.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {gastos.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 border-b border-border-soft py-1.5 text-[12px] last:border-0">
                <span className="min-w-0 truncate">{d.descricao ?? "—"} <span className="text-text-faint">· {contaDe(d)}</span></span>
                <span className="flex shrink-0 items-center gap-2">
                  {!d.comprovado && <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[9.5px] text-warning">sem comprovante</span>}
                  <span className="font-medium tabular-nums">{brl(Number(d.valor_total || 0))}</span>
                </span>
              </div>
            ))}
            <p className="mt-1 text-[11px] text-text-faint">Lançado no Custos. Para rateio entre sócias, abra o Extrato em Custos e use “ratear”.</p>
          </div>
        )}
      </div>
    </div>
  );
}
