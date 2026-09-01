import { createClient } from "@/lib/supabase/server";
import { NovoCenarioForm } from "./novo-cenario-form";
import { CenarioCard } from "./cenario-card";

export default async function CenariosPage() {
  const supabase = await createClient();
  const { data: cenarios } = await supabase
    .from("cenarios")
    .select("id, nome, descricao, is_base, status, created_at")
    .order("created_at");

  return (
    <div>
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Cenários de Planejamento</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Cada cenário guarda seu próprio conjunto de premissas por produto e fase
          </p>
        </div>
      </div>

      <div className="mb-6">
        <NovoCenarioForm cenarios={(cenarios ?? []).map((c) => ({ id: c.id, nome: c.nome }))} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(cenarios ?? []).map((c) => (
          <CenarioCard key={c.id} cenario={c} />
        ))}
      </div>
    </div>
  );
}
