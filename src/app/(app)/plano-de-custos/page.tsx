import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function PlanoDeCustosPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string }>;
}) {
  const { cenario } = await searchParams;
  const supabase = await createClient();

  const [{ data: produtos }, { data: cenarios }] = await Promise.all([
    supabase.from("produtos").select("id, nome, descricao").order("nome"),
    supabase.from("cenarios").select("id, nome, is_base").order("created_at"),
  ]);

  const cenarioAtual = cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? "";
  const cenarioNome = (cenarios ?? []).find((c) => c.id === cenarioAtual)?.nome;

  return (
    <div>
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Plano de Custos</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Estrutura, ferramentas e custos que escalam com clientes, por produto e fase
          </p>
        </div>
        {cenarioNome && (
          <span className="rounded-lg border border-[#e6d3d9] bg-wine-soft px-3 py-2 text-[12.5px] font-medium text-wine">
            Cenário: {cenarioNome}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(produtos ?? []).map((p) => (
          <Link
            key={p.id}
            href={cenarioAtual ? `/plano-de-custos/${p.id}?cenario=${cenarioAtual}` : `/plano-de-custos/${p.id}`}
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary-fill"
          >
            <div className="font-heading text-[15px] font-semibold">{p.nome}</div>
            <p className="mt-1.5 text-[12px] text-text-muted">{p.descricao ?? "Sem descrição ainda."}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
