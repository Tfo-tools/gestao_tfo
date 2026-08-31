import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NovoCenarioForm } from "./novo-cenario-form";

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
          <Link
            key={c.id}
            href={`/produtos?cenario=${c.id}`}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary-fill"
          >
            <span
              className={`w-fit rounded px-2 py-0.5 text-[10.5px] font-semibold ${
                c.is_base ? "bg-success-soft text-success" : "bg-[#eef0f4] text-[#4a5064]"
              }`}
            >
              {c.is_base ? "CENÁRIO-BASE" : c.status.toUpperCase()}
            </span>
            <div className="font-heading text-[15px] font-semibold">{c.nome}</div>
            <p className="text-[12px] text-text-muted">{c.descricao ?? "Sem descrição."}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
