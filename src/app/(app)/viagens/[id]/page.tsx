import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Itinerario, type ItemViagem, type AnexoViagem } from "./itinerario";

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

  return (
    <div>
      <Link href="/viagens" className="text-[12px] font-medium text-primary-deep">← Viagens</Link>
      <div className="mt-2 mb-5">
        <h1 className="font-heading text-[22px] font-semibold">{viagem.titulo}</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          {[viagem.destino, faixa].filter(Boolean).join(" · ") || "Sem datas"}
          {quem.length > 0 && ` · ${quem.join(", ")}`}
        </p>
        {viagem.observacoes && <p className="mt-1 text-[12px] text-text-faint">{viagem.observacoes}</p>}
      </div>

      <Itinerario
        viagemId={viagem.id}
        itens={(itens ?? []) as ItemViagem[]}
        anexos={(anexos ?? []) as AnexoViagem[]}
      />

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
