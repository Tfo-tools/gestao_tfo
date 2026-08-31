import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FASES } from "@/lib/fases";
import { CenarioSelector } from "./cenario-selector";
import { FaseFunilCard } from "./fase-funil-card";

const CARGO_LABEL: Record<string, string> = { sdr: "SDR", vendedor: "Vendedor/AE", coordenador: "Coordenador" };

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

  const [{ data: produto }, { data: cenarios }] = await Promise.all([
    supabase.from("produtos").select("id, nome").eq("id", id).single(),
    supabase.from("cenarios").select("id, nome, is_base").order("created_at"),
  ]);

  if (!produto) notFound();

  const cenarioAtual =
    cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";

  const [{ data: fases }, { data: contratacoes }] = await Promise.all([
    supabase.from("fases_produto").select("id, fase").eq("produto_id", id).eq("cenario_id", cenarioAtual),
    supabase
      .from("contratacoes")
      .select("id, cargo, tipo_contratacao, nome_referencia, data_inicio, data_fim")
      .eq("cenario_id", cenarioAtual)
      .eq("produto_id", id)
      .order("data_inicio"),
  ]);

  const faseIdByValue = new Map((fases ?? []).map((f) => [f.fase, f.id]));

  const { data: funis } =
    (fases ?? []).length > 0
      ? await supabase
          .from("premissas_funil")
          .select("*")
          .in(
            "fase_produto_id",
            (fases ?? []).map((f) => f.id),
          )
      : { data: [] };

  const funilByFaseId = new Map((funis ?? []).map((f) => [f.fase_produto_id, f]));

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
            Premissas de conversão e capacidade por fase — o custo da equipe fica em Contratações
          </p>
        </div>
        {cenarioAtual && <CenarioSelector cenarios={cenarios ?? []} cenarioAtual={cenarioAtual} />}
      </div>

      <div className="grid grid-cols-[1fr_300px] items-start gap-5">
        <div className="flex flex-col gap-2.5">
          {FASES.map((f, i) => {
            const faseId = faseIdByValue.get(f.value);
            const funil = faseId ? (funilByFaseId.get(faseId) ?? null) : null;
            return (
              <FaseFunilCard
                key={f.value}
                produtoId={id}
                cenarioId={cenarioAtual}
                fase={f.value}
                label={f.label}
                ordem={i + 1}
                funil={funil}
                defaultOpen={i === 0}
              />
            );
          })}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-1 font-heading text-[13px] font-semibold">Equipe contratada</div>
          <p className="mb-4 text-[11px] text-text-muted">Vinculada a este produto e cenário</p>

          <div className="mb-4 flex flex-col gap-2">
            {(contratacoes ?? []).length === 0 && (
              <p className="text-[12px] text-text-faint">Nenhuma contratação vinculada ainda.</p>
            )}
            {(contratacoes ?? []).map((c) => (
              <div key={c.id} className="rounded-lg border border-border-soft px-3 py-2.5">
                <div className="text-[12.5px] font-semibold">
                  {CARGO_LABEL[c.cargo] ?? c.cargo}
                  <span className="ml-1.5 rounded bg-primary-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-primary-deep">
                    {c.tipo_contratacao.toUpperCase()}
                  </span>
                </div>
                {c.nome_referencia && (
                  <div className="text-[11px] text-text-faint">{c.nome_referencia}</div>
                )}
              </div>
            ))}
          </div>

          <Link
            href={`/contratacoes?cenario=${cenarioAtual}&produto=${id}`}
            className="block rounded-lg border border-border px-3 py-2 text-center text-[12px] font-medium text-primary-deep"
          >
            Gerenciar em Contratações →
          </Link>
        </div>
      </div>
    </div>
  );
}
