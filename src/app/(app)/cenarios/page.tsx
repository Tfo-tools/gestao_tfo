import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NovoCenarioForm } from "./novo-cenario-form";
import { CenarioCard } from "./cenario-card";

// Espelhar um cenário copia tudo e recalcula a projeção de cada produto — leva alguns segundos.
export const maxDuration = 60;

export default async function CenariosPage() {
  const supabase = await createClient();
  const [{ data: cenarios }, { data: programas }, { data: vinculos }] =
    await Promise.all([
      supabase
        .from("cenarios")
        .select(
          "id, nome, descricao, is_base, status, data_inicio, data_fim, created_at",
        )
        .order("created_at"),
      supabase
        .from("programas_investimento")
        .select("id, nome, tipo")
        .order("created_at"),
      supabase.from("cenario_programas").select("cenario_id, programa_id"),
    ]);

  const programasPorCenario: Record<string, string[]> = {};
  for (const v of vinculos ?? []) {
    (programasPorCenario[v.cenario_id] ??= []).push(v.programa_id);
  }

  return (
    <div>
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">
            Cenários de Planejamento
          </h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Cada cenário guarda seu próprio conjunto de premissas por produto e
            fase
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/cenarios/simulacoes"
            className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-medium text-primary-deep hover:border-primary-fill"
          >
            Simular a partir do FUNSES 1
          </Link>
          <Link
            href="/cenarios/comparar"
            className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-medium text-primary-deep hover:border-primary-fill"
          >
            Comparar cenários →
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <NovoCenarioForm
          cenarios={(cenarios ?? []).map((c) => ({
            id: c.id,
            nome: c.nome,
            is_base: c.is_base,
            data_inicio: c.data_inicio,
            data_fim: c.data_fim,
          }))}
          programas={programas ?? []}
          programasPorCenario={programasPorCenario}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(cenarios ?? []).map((c) => (
          <CenarioCard key={c.id} cenario={c} />
        ))}
      </div>
    </div>
  );
}
