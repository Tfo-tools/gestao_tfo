import { createClient } from "@/lib/supabase/server";
import { RelatorioPlanos } from "@/app/(app)/relatorios/page";
import { AvisoTelaGrande } from "@/components/aviso-tela-grande";

/**
 * Atalho de topo para os indicadores do plano, sem passar pela tela de cenários.
 * O cenário vem por `?cenario=` — o seletor da própria tela troca de cenário sem sair da rota,
 * ao contrário de /plano/[cenarioId]/indicadores, onde o cenário está preso na URL.
 */
export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string; inicio?: string; fim?: string }>;
}) {
  const { cenario, inicio, fim } = await searchParams;
  const supabase = await createClient();

  const { data: cenarios } = await supabase.from("cenarios").select("id, nome, is_base").order("created_at");
  const cenarioId = cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";
  const nome = (cenarios ?? []).find((c) => c.id === cenarioId)?.nome ?? "—";

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">Indicadores — {nome}</h1>
        <p className="mt-1 text-[13px] text-text-muted">Troque o cenário no seletor abaixo sem sair desta tela</p>
      </div>

      <AvisoTelaGrande />

      <RelatorioPlanos cenario={cenarioId} inicio={inicio} fim={fim} />
    </div>
  );
}
