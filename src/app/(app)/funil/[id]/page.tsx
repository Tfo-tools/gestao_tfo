import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FASES } from "@/lib/fases";
import { CenarioSelector } from "./cenario-selector";
import { FaseFunilCard } from "./fase-funil-card";

export default async function FunilDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cenario?: string }>;
}) {
  const { id } = await params;
  const { cenario } = await searchParams;
  const supabase = await createClient();

  const [{ data: produto }, { data: cenarios }, { data: regimes }] = await Promise.all([
    supabase.from("produtos").select("id, nome").eq("id", id).single(),
    supabase.from("cenarios").select("id, nome, is_base").order("created_at"),
    supabase.from("encargos_regimes").select("id, nome, aliquota_total_efetiva").order("aliquota_total_efetiva"),
  ]);

  if (!produto) notFound();

  const cenarioAtual =
    cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";

  const { data: fases } = await supabase
    .from("fases_produto")
    .select("id, fase")
    .eq("produto_id", id)
    .eq("cenario_id", cenarioAtual);

  const faseIds = (fases ?? []).map((f) => f.id);
  const faseIdByValue = new Map((fases ?? []).map((f) => [f.fase, f.id]));

  const [{ data: funis }, { data: equipes }] = await Promise.all([
    faseIds.length > 0
      ? supabase.from("premissas_funil").select("*").in("fase_produto_id", faseIds)
      : Promise.resolve({ data: [] }),
    faseIds.length > 0
      ? supabase.from("equipe_custos").select("*").in("fase_produto_id", faseIds)
      : Promise.resolve({ data: [] }),
  ]);

  type EquipeRow = { cargo: string; salario_bruto: number; regime_id: string; fase_produto_id: string };

  const funilByFaseId = new Map((funis ?? []).map((f) => [f.fase_produto_id, f]));
  const equipeByFaseId = new Map<string, Record<string, EquipeRow>>();
  for (const e of (equipes ?? []) as EquipeRow[]) {
    const atual = equipeByFaseId.get(e.fase_produto_id) ?? {};
    atual[e.cargo] = e;
    equipeByFaseId.set(e.fase_produto_id, atual);
  }

  return (
    <div>
      <div className="mb-2">
        <Link href="/funil" className="text-[12.5px] text-text-muted">
          ← Funil &amp; Metas
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">{produto.nome}</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Dimensionamento de equipe comercial e CAC all-in por fase
          </p>
        </div>
        {cenarioAtual && <CenarioSelector cenarios={cenarios ?? []} cenarioAtual={cenarioAtual} />}
      </div>

      <div className="flex flex-col gap-2.5">
        {FASES.map((f, i) => {
          const faseId = faseIdByValue.get(f.value);
          const funil = faseId ? (funilByFaseId.get(faseId) ?? null) : null;
          const equipe = faseId ? (equipeByFaseId.get(faseId) ?? {}) : {};
          return (
            <FaseFunilCard
              key={f.value}
              produtoId={id}
              cenarioId={cenarioAtual}
              fase={f.value}
              label={f.label}
              ordem={i + 1}
              funil={funil}
              equipe={equipe}
              regimes={regimes ?? []}
              defaultOpen={i === 0}
            />
          );
        })}
      </div>
    </div>
  );
}
