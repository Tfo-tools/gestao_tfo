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

  const [{ data: itens }, { data: anexos }, { data: participantes }, { data: pessoas }] = await Promise.all([
    supabase.from("viagem_itens").select("*").eq("viagem_id", id).order("inicio", { ascending: true, nullsFirst: false }).order("created_at"),
    supabase.from("viagem_anexos").select("id, item_id, nome_arquivo, caminho_arquivo, tipo_mime").eq("viagem_id", id).order("created_at"),
    supabase.from("viagem_participantes").select("profile_id").eq("viagem_id", id),
    supabase.from("profiles").select("id, nome").in("papel", ["socia", "equipe"]).order("nome"),
  ]);

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
    </div>
  );
}
