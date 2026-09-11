import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RelatorioPlanos } from "@/app/(app)/relatorios/page";
import { AvisoTelaGrande } from "@/components/aviso-tela-grande";

export default async function PlanoIndicadoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ cenarioId: string }>;
  searchParams: Promise<{ inicio?: string; fim?: string }>;
}) {
  const { cenarioId } = await params;
  const { inicio, fim } = await searchParams;
  const supabase = await createClient();

  const { data: cenario } = await supabase.from("cenarios").select("id, nome").eq("id", cenarioId).single();
  if (!cenario) notFound();

  return (
    <div>
      <div className="mb-2">
        <Link href={`/plano/${cenarioId}`} className="text-[12.5px] text-text-muted">
          ← {cenario.nome}
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">Indicadores — {cenario.nome}</h1>
      </div>

      <AvisoTelaGrande />

      <RelatorioPlanos cenario={cenarioId} inicio={inicio} fim={fim} ocultarSeletorCenario />
    </div>
  );
}
