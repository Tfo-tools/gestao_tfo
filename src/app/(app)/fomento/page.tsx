import { createClient } from "@/lib/supabase/server";
import { NovoProgramaForm } from "./novo-programa-form";
import { ProgramaCard } from "./programa-card";

export default async function FomentoPage() {
  const supabase = await createClient();

  const [{ data: programas }, { data: parcelas }, { data: cenarios }, { data: vinculos }] = await Promise.all([
    supabase.from("programas_investimento").select("*").order("created_at"),
    supabase.from("parcelas_investimento").select("*").order("numero_parcela"),
    supabase.from("cenarios").select("id, nome").order("created_at"),
    supabase.from("cenario_programas").select("cenario_id, programa_id"),
  ]);

  const parcelasByPrograma = new Map<string, typeof parcelas>();
  for (const p of parcelas ?? []) {
    const atual = parcelasByPrograma.get(p.programa_id) ?? [];
    atual.push(p);
    parcelasByPrograma.set(p.programa_id, atual);
  }

  const vinculosByPrograma = new Map<string, string[]>();
  for (const v of vinculos ?? []) {
    const atual = vinculosByPrograma.get(v.programa_id) ?? [];
    atual.push(v.cenario_id);
    vinculosByPrograma.set(v.programa_id, atual);
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-heading text-[22px] font-semibold">Fomento &amp; Investimento</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Editais, aportes e mútuos — fluxo previsto de entrada e destinação dos recursos
        </p>
      </div>

      <div className="mb-6">
        <NovoProgramaForm />
      </div>

      <div className="flex flex-col gap-4">
        {(programas ?? []).map((p) => (
          <ProgramaCard
            key={p.id}
            programa={p}
            parcelas={parcelasByPrograma.get(p.id) ?? []}
            cenarios={cenarios ?? []}
            cenariosVinculados={vinculosByPrograma.get(p.id) ?? []}
          />
        ))}
        {(programas ?? []).length === 0 && (
          <p className="text-[13px] text-text-muted">Nenhum programa cadastrado ainda.</p>
        )}
      </div>
    </div>
  );
}
