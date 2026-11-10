import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Itinerario, type ItemViagem, type AnexoViagem } from "./itinerario";
import { MapaPessoas } from "./mapa-pessoas";
import { ExcluirViagem } from "./excluir-viagem";

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
    supabase.from("despesas").select("id, data_gasto, valor_total, descricao, comprovado, pagador, plano_contas:plano_contas_id(conta), despesa_rateio(pessoa, percentual), despesa_parcelas(numero_parcela, valor, data_prevista, origem)").eq("viagem_id", id).order("data_gasto"),
    supabase.from("plano_contas").select("id, codigo, conta, tipo").in("tipo", ["cogs", "opex", "financeiro", "ativo"]).order("codigo"),
    supabase.from("meios_pagamento").select("id, banco, tipo, titular_tipo, titular_pessoa_id, bandeira, dia_vencimento, dias_fechamento_antes, programa_id").eq("ativo", true).order("banco"),
    supabase.from("despesas").select("plano_contas_id"),
    supabase.from("programas_investimento").select("id, nome").order("nome"),
  ]);
  type RateioP = { pessoa: string; percentual: number };
  type ParcelaP = { numero_parcela: number; valor: number; data_prevista: string; origem: string | null };
  type DespesaRow = { id: string; data_gasto: string; valor_total: number; descricao: string | null; comprovado: boolean; pagador: string | null; plano_contas: { conta: string } | { conta: string }[] | null; despesa_rateio: RateioP[]; despesa_parcelas: ParcelaP[] };
  const gastos = (despesas ?? []) as DespesaRow[];
  const totalGastos = gastos.reduce((s, d) => s + Number(d.valor_total || 0), 0);
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const contaDe = (d: DespesaRow) => (Array.isArray(d.plano_contas) ? d.plano_contas[0]?.conta : d.plano_contas?.conta) ?? "—";

  // Rateio por pessoa, acerto (quem deposita) e distribuição por mês — reusa a divisão e as parcelas
  // já lançadas. Despesa sem divisão vai inteira pra quem pagou (e entra no aviso "sem divisão").
  const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const fmtMes = (m: string) => `${MESES_ABREV[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
  const capN = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);
  const arca: Record<string, number> = {};
  const pagouP: Record<string, number> = {};
  const porMes: Record<string, Record<string, number>> = {};
  const mesesSet = new Set<string>();
  let semDivisao = 0;
  for (const d of gastos) {
    const v = Number(d.valor_total || 0);
    const rateio = (d.despesa_rateio ?? []).filter((r) => r.pessoa && Number(r.percentual) > 0);
    if (d.pagador) pagouP[d.pagador] = (pagouP[d.pagador] ?? 0) + v;
    let shares: { pessoa: string; frac: number }[];
    if (rateio.length > 0) {
      const tot = rateio.reduce((s, r) => s + Number(r.percentual), 0);
      shares = rateio.map((r) => ({ pessoa: r.pessoa, frac: Number(r.percentual) / tot }));
    } else {
      if (v > 0) semDivisao++;
      shares = d.pagador ? [{ pessoa: d.pagador, frac: 1 }] : [];
    }
    for (const s of shares) arca[s.pessoa] = (arca[s.pessoa] ?? 0) + v * s.frac;
    const parcelas = (d.despesa_parcelas ?? []).filter((p) => p.origem === "fatura_cartao");
    const blocos = parcelas.length > 0
      ? parcelas.map((p) => ({ mes: (p.data_prevista || "").slice(0, 7), valor: Number(p.valor) }))
      : [{ mes: (d.data_gasto || "").slice(0, 7), valor: v }];
    for (const b of blocos) {
      if (!b.mes) continue;
      mesesSet.add(b.mes);
      for (const s of shares) (porMes[s.pessoa] ??= {})[b.mes] = (porMes[s.pessoa][b.mes] ?? 0) + b.valor * s.frac;
    }
  }
  const pessoasCusto = [...new Set([...Object.keys(arca), ...Object.keys(pagouP)])].sort();
  const mesesCusto = [...mesesSet].sort();
  const saldo: Record<string, number> = {};
  for (const p of pessoasCusto) saldo[p] = (pagouP[p] ?? 0) - (arca[p] ?? 0);
  const devedor = pessoasCusto.find((p) => saldo[p] < -0.5);
  const credor = pessoasCusto.find((p) => saldo[p] > 0.5);
  const acertoTexto = devedor && credor
    ? `${capN(devedor)} deposita ${brl(Math.min(-saldo[devedor], saldo[credor]))} para ${capN(credor)}`
    : pessoasCusto.length > 0 && gastos.length > 0 ? "Contas quitadas entre as sócias." : null;

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

  // Mapa por pessoa: cidade de cada pessoa em cada dia (hospedagem que cobre o dia; senão último voo).
  const diaKey = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-CA") : null);
  const inicios = itensV.map((i) => diaKey(i.inicio)).filter(Boolean) as string[];
  const fins = itensV.map((i) => diaKey(i.fim ?? i.inicio)).filter(Boolean) as string[];
  const dIni = viagem.data_inicio ?? (inicios.length ? [...inicios].sort()[0] : null);
  const dFim = viagem.data_fim ?? (fins.length ? [...fins].sort().slice(-1)[0] : null);
  const dias: { key: string; dia: string; mes: string }[] = [];
  if (dIni && dFim) {
    const d = new Date(`${dIni}T12:00:00`);
    const fim = new Date(`${dFim}T12:00:00`);
    for (let i = 0; d <= fim && i < 90; i++) {
      dias.push({ key: d.toLocaleDateString("en-CA"), dia: d.toLocaleDateString("pt-BR", { day: "2-digit" }), mes: d.toLocaleDateString("pt-BR", { month: "2-digit" }) });
      d.setDate(d.getDate() + 1);
    }
  }
  const estaNoItem = (it: ItemViagem, pid: string) => {
    const lista = participantesPorItem[it.id];
    return lista && lista.length ? lista.includes(pid) : true; // sem marcação = todos
  };
  const cidadeDe = (it: ItemViagem) => it.local || it.destino || it.origem || null;
  const matriz: Record<string, Record<string, string | null>> = {};
  const cidadesUsadas = new Set<string>();
  for (const p of participantesViagem) {
    matriz[p.id] = {};
    for (const dk of dias.map((x) => x.key)) {
      let cidade: string | null = null;
      const hosp = itensV.find((it) => it.tipo === "hospedagem" && estaNoItem(it, p.id) && diaKey(it.inicio) && diaKey(it.inicio)! <= dk && dk <= (diaKey(it.fim ?? it.inicio) ?? diaKey(it.inicio)!));
      if (hosp) cidade = cidadeDe(hosp);
      if (!cidade) {
        const voos = itensV
          .filter((it) => it.tipo === "voo" && estaNoItem(it, p.id) && diaKey(it.inicio) && diaKey(it.inicio)! <= dk)
          .sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""));
        if (voos.length) cidade = voos[voos.length - 1].destino || voos[voos.length - 1].local || null;
      }
      matriz[p.id][dk] = cidade;
      if (cidade) cidadesUsadas.add(cidade);
    }
  }
  const PALETA = ["#e9edf7", "#e8f2ec", "#fbf7cf", "#f4e9ec", "#eceef1", "#e4f0e8", "#f3e8de"];
  const cores: Record<string, string> = {};
  [...cidadesUsadas].forEach((c, i) => { cores[c] = PALETA[i % PALETA.length]; });
  const temMapa = dias.length > 0 && participantesViagem.length > 0 && cidadesUsadas.size > 0;

  return (
    <div>
      <Link href="/viagens" className="text-[12px] font-medium text-primary-deep">← Viagens</Link>
      <div className="mt-2 mb-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-heading text-[22px] font-semibold">{viagem.titulo}</h1>
          <ExcluirViagem id={viagem.id} titulo={viagem.titulo} />
        </div>
        <p className="mt-1 text-[13px] text-text-muted">
          {[viagem.destino, faixa].filter(Boolean).join(" · ") || "Sem datas"}
          {quem.length > 0 && ` · ${quem.join(", ")}`}
        </p>
        {viagem.observacoes && <p className="mt-1 text-[12px] text-text-faint">{viagem.observacoes}</p>}
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
      />

      {temMapa && <MapaPessoas participantes={participantesViagem} dias={dias} matriz={matriz} cores={cores} />}

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
          <>
            {/* Resumo — sempre visível */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
              {pessoasCusto.map((p) => (
                <span key={p}>
                  <span className="text-text-faint">{cap(p)}:</span> <span className="font-medium tabular-nums">{brl(arca[p] ?? 0)}</span>
                </span>
              ))}
            </div>
            {acertoTexto && <p className="mt-1.5 text-[12px] font-medium text-primary-deep">{acertoTexto}</p>}
            {semDivisao > 0 && (
              <p className="mt-1 text-[11px] text-warning">{semDivisao} despesa(s) ainda sem divisão — abra no Custos para dividir entre as sócias.</p>
            )}

            {/* Despesas — recolhido */}
            <details className="mt-3 border-t border-border-soft pt-2">
              <summary className="cursor-pointer text-[12px] font-medium text-primary-deep">Despesas ({gastos.length})</summary>
              <div className="mt-2 flex flex-col gap-1.5">
                {gastos.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 border-b border-border-soft py-1.5 text-[12px] last:border-0">
                    <span className="min-w-0 truncate">
                      {d.descricao ?? "—"} <span className="text-text-faint">· {contaDe(d)}{d.pagador ? ` · ${cap(d.pagador)}` : ""}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {!d.comprovado && <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[9.5px] text-warning">sem comprovante</span>}
                      <span className="font-medium tabular-nums">{brl(Number(d.valor_total || 0))}</span>
                    </span>
                  </div>
                ))}
              </div>
            </details>

            {/* Quem pagou × quem deve — recolhido */}
            {pessoasCusto.length > 0 && (
              <details className="mt-2 border-t border-border-soft pt-2">
                <summary className="cursor-pointer text-[12px] font-medium text-primary-deep">Quem pagou × quem deve</summary>
                <table className="mt-2 w-full text-[11.5px] tabular-nums">
                  <thead>
                    <tr className="text-text-faint">
                      <th className="text-left font-normal"></th>
                      {pessoasCusto.map((p) => (
                        <th key={p} className="pb-1 text-right font-medium">{cap(p)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-text-muted">Arca (parte dela)</td>
                      {pessoasCusto.map((p) => <td key={p} className="text-right">{brl(arca[p] ?? 0)}</td>)}
                    </tr>
                    <tr>
                      <td className="text-text-muted">Pagou</td>
                      {pessoasCusto.map((p) => <td key={p} className="text-right">{brl(pagouP[p] ?? 0)}</td>)}
                    </tr>
                    <tr className="border-t border-border-soft">
                      <td className="pt-1 text-text-muted">Saldo</td>
                      {pessoasCusto.map((p) => (
                        <td key={p} className={`pt-1 text-right font-medium ${(saldo[p] ?? 0) >= 0 ? "text-success" : "text-danger"}`}>{brl(saldo[p] ?? 0)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                <p className="mt-1.5 text-[10.5px] text-text-faint">Saldo positivo = pagou mais que a sua parte (tem a receber). Negativo = deve.</p>
              </details>
            )}

            {/* Por mês — recolhido */}
            {mesesCusto.length > 0 && (
              <details className="mt-2 border-t border-border-soft pt-2">
                <summary className="cursor-pointer text-[12px] font-medium text-primary-deep">Por mês</summary>
                <div className="mt-2 -mx-1 overflow-x-auto px-1">
                  <table className="w-full min-w-max text-[11.5px] tabular-nums">
                    <thead>
                      <tr className="text-text-faint">
                        <th className="pr-3 text-left font-normal">Pessoa</th>
                        {mesesCusto.map((m) => <th key={m} className="px-2 pb-1 text-right font-medium">{fmtMes(m)}</th>)}
                        <th className="pl-2 pb-1 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pessoasCusto.map((p) => (
                        <tr key={p}>
                          <td className="pr-3 text-text-muted">{cap(p)}</td>
                          {mesesCusto.map((m) => <td key={m} className="px-2 text-right">{brl(porMes[p]?.[m] ?? 0)}</td>)}
                          <td className="pl-2 text-right font-medium">{brl(mesesCusto.reduce((s, m) => s + (porMes[p]?.[m] ?? 0), 0))}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border-soft">
                        <td className="pr-3 pt-1 text-text-muted">Total</td>
                        {mesesCusto.map((m) => (
                          <td key={m} className="px-2 pt-1 text-right font-medium">{brl(pessoasCusto.reduce((s, p) => s + (porMes[p]?.[m] ?? 0), 0))}</td>
                        ))}
                        <td className="pl-2 pt-1 text-right font-medium">{brl(totalGastos)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[10.5px] text-text-faint">Cada parcela do cartão cai no mês em que vence; o que foi à vista, no mês do gasto.</p>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
