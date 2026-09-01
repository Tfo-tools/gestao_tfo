import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FASES } from "@/lib/fases";
import { CenarioSelector } from "./cenario-selector";
import { FaseCustosCard } from "./fase-custos-card";

export default async function PlanoDeCustosDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cenario?: string }>;
}) {
  const { id } = await params;
  const { cenario } = await searchParams;
  const supabase = await createClient();

  const [{ data: produto }, { data: cenarios }, { data: planoContas }] = await Promise.all([
    supabase.from("produtos").select("id, nome").eq("id", id).single(),
    supabase.from("cenarios").select("id, nome, is_base").order("created_at"),
    supabase
      .from("plano_contas")
      .select("id, codigo, conta")
      .in("tipo", ["cogs", "opex"])
      .order("codigo"),
  ]);

  if (!produto) notFound();

  const cenarioAtual =
    cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";

  const { data: fases } = await supabase
    .from("fases_produto")
    .select("id, fase")
    .eq("produto_id", id)
    .eq("cenario_id", cenarioAtual);

  const faseIdByValue = new Map((fases ?? []).map((f) => [f.fase, f.id]));
  const faseIds = (fases ?? []).map((f) => f.id);

  const [{ data: custosFixos }, { data: custosVariaveis }] =
    faseIds.length > 0
      ? await Promise.all([
          supabase
            .from("plano_custos_fixos")
            .select("id, fase_produto_id, item, quantidade, valor_unitario, plano_contas:plano_contas_id(codigo, conta)")
            .in("fase_produto_id", faseIds),
          supabase
            .from("plano_custos_variaveis")
            .select(
              "id, fase_produto_id, item, tipo_calculo, valor_base, percentual, valor_por_unidade, plano_contas:plano_contas_id(codigo, conta)",
            )
            .in("fase_produto_id", faseIds),
        ])
      : [{ data: [] }, { data: [] }];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fixosByFaseId = new Map<string, any[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (custosFixos ?? []) as any[]) {
    const atual = fixosByFaseId.get(c.fase_produto_id) ?? [];
    atual.push(c);
    fixosByFaseId.set(c.fase_produto_id, atual);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variaveisByFaseId = new Map<string, any[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (custosVariaveis ?? []) as any[]) {
    const atual = variaveisByFaseId.get(c.fase_produto_id) ?? [];
    atual.push(c);
    variaveisByFaseId.set(c.fase_produto_id, atual);
  }

  return (
    <div>
      <div className="mb-2">
        <Link href="/plano-de-custos" className="text-[12.5px] text-text-muted">
          ← Plano de Custos
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">{produto.nome}</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Estrutura e custos que escalam com clientes, por fase — o custo de pessoal fica em Produtos
            (Equipe alocada)
          </p>
        </div>
        {cenarioAtual && <CenarioSelector cenarios={cenarios ?? []} cenarioAtual={cenarioAtual} />}
      </div>

      <div className="flex flex-col gap-2.5">
        {FASES.map((f, i) => {
          const faseId = faseIdByValue.get(f.value);
          return (
            <FaseCustosCard
              key={f.value}
              produtoId={id}
              cenarioId={cenarioAtual}
              fase={f.value}
              label={f.label}
              ordem={i + 1}
              custosFixos={faseId ? (fixosByFaseId.get(faseId) ?? []) : []}
              custosVariaveis={faseId ? (variaveisByFaseId.get(faseId) ?? []) : []}
              planoContas={planoContas ?? []}
              defaultOpen={i === 0}
            />
          );
        })}
      </div>
    </div>
  );
}
