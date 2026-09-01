import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calcularNecessidadePorCargo, type FaseProdutoInput, type AlocacaoPorFaseInput, type ContratacaoCapacidadeInput } from "@/lib/necessidade-contratacao";
import type { FaseValue } from "@/lib/fases";
import { NecessidadeTabelas } from "./necessidade-tabelas";

export default async function NecessidadeContratacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string }>;
}) {
  const { cenario } = await searchParams;
  const supabase = await createClient();

  const { data: cenarios } = await supabase.from("cenarios").select("id, nome, is_base").order("created_at");
  const cenarioAtual = cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";

  if (!cenarioAtual) {
    return (
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Necessidade de Contratação</h1>
        <p className="mt-2 text-[13px] text-text-muted">Crie um cenário primeiro.</p>
      </div>
    );
  }

  const { data: fasesRaw } = await supabase
    .from("fases_produto")
    .select("id, produto_id, fase, data_inicio, data_fim")
    .eq("cenario_id", cenarioAtual);

  const faseIds = (fasesRaw ?? []).map((f) => f.id);
  const faseValueById = new Map((fasesRaw ?? []).map((f) => [f.id as string, f.fase as FaseValue]));
  const produtoIdByFaseId = new Map((fasesRaw ?? []).map((f) => [f.id as string, f.produto_id as string]));

  const [{ data: alocacoesRaw }, { data: contratacoesRaw }] = await Promise.all([
    faseIds.length > 0
      ? supabase.from("equipe_alocada").select("fase_produto_id, cargo, quantidade_funcionarios, horas_mes").in("fase_produto_id", faseIds)
      : Promise.resolve({ data: [] }),
    supabase.from("contratacoes").select("cargo, data_inicio, data_fim").eq("cenario_id", cenarioAtual),
  ]);

  const fasesPorProduto: FaseProdutoInput[] = (fasesRaw ?? []).map((f) => ({
    produtoId: f.produto_id,
    fase: f.fase as FaseValue,
    data_inicio: f.data_inicio,
    data_fim: f.data_fim,
  }));

  const alocacoes: AlocacaoPorFaseInput[] = (alocacoesRaw ?? []).map((a) => ({
    produtoId: produtoIdByFaseId.get(a.fase_produto_id) ?? "",
    fase: faseValueById.get(a.fase_produto_id)!,
    cargo: a.cargo,
    quantidade_funcionarios: Number(a.quantidade_funcionarios),
    horas_mes: Number(a.horas_mes),
  }));

  const contratacoes: ContratacaoCapacidadeInput[] = (contratacoesRaw ?? []).map((c) => ({
    cargo: c.cargo,
    data_inicio: c.data_inicio,
    data_fim: c.data_fim,
  }));

  const porCargo = calcularNecessidadePorCargo({ fasesPorProduto, alocacoes, contratacoes });
  const dados = [...porCargo.entries()].map(([cargo, linhas]) => ({ cargo, linhas }));

  return (
    <div>
      <div className="mb-2">
        <Link href="/contratacoes" className="text-[12.5px] text-text-muted">
          ← Contratações
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Necessidade de Contratação</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Cruza as horas alocadas por cargo em cada produto (Plano de Custos) com a capacidade instalada em
            Contratações (44h semanais por pessoa) — mostra quando o crescimento das vendas passa a exigir uma
            nova contratação daquele cargo
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <select name="cenario" defaultValue={cenarioAtual} className="input">
            {(cenarios ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
            Filtrar
          </button>
        </form>
      </div>

      {dados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-text-muted">
            Nenhuma equipe alocada ainda — cadastre horas por cargo em Plano de Custos (por produto e fase).
          </p>
        </div>
      ) : (
        <NecessidadeTabelas dados={dados} />
      )}
    </div>
  );
}
