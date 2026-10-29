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

  const [{ data: itens }, { data: anexos }, { data: participantes }, { data: pessoas }, { data: despesas }] = await Promise.all([
    supabase.from("viagem_itens").select("*").eq("viagem_id", id).order("inicio", { ascending: true, nullsFirst: false }).order("created_at"),
    supabase.from("viagem_anexos").select("id, item_id, nome_arquivo, caminho_arquivo, tipo_mime").eq("viagem_id", id).order("created_at"),
    supabase.from("viagem_participantes").select("profile_id").eq("viagem_id", id),
    supabase.from("profiles").select("id, nome").in("papel", ["socia", "equipe"]).order("nome"),
    supabase.from("despesas").select("id, data_gasto, valor_total, descricao, comprovado, plano_contas:plano_contas_id(conta)").eq("viagem_id", id).order("data_gasto"),
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
      />

      {temMapa && <MapaPessoas participantes={participantesViagem} dias={dias} matriz={matriz} cores={cores} />}

      <div className="mt-6 rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">Custos da viagem</h2>
          <span className="text-[13px] font-semibold tabular-nums">{brl(totalGastos)}</span>
        </div>
        {gastos.length === 0 ? (
          <p className="text-[12px] text-text-muted">
            Nenhum custo lançado ainda. Use o botão <b>“Lançar no Custos”</b> num item com valor — a despesa entra no Lançamentos já classificada e aparece aqui.
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
