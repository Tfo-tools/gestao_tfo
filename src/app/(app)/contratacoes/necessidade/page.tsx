import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  calcularDemandaPorCargo,
  type FaseProdutoInput,
  type FunilPremissaInput,
  type SimulacaoMesInput,
} from "@/lib/necessidade-contratacao";
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
  const faseById = new Map((fasesRaw ?? []).map((f) => [f.id, f]));

  const [{ data: funisRaw }, { data: simulacaoRaw }, { data: modelos }, { data: alocacoes }] = await Promise.all([
    faseIds.length > 0
      ? supabase
          .from("premissas_funil")
          .select("fase_produto_id, taxa_conversao, capacidade_vendedor_mes, span_of_control, horas_suporte_por_cliente_mes")
          .in("fase_produto_id", faseIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("simulacao_mensal")
      .select("produto_id, mes_referencia, novos_clientes, clientes_ativos")
      .eq("cenario_id", cenarioAtual),
    supabase.from("modelos_contratacao").select("*").order("cargo"),
    supabase.from("alocacao_modelo_contratacao").select("*").eq("cenario_id", cenarioAtual),
  ]);

  const fasesPorProduto: FaseProdutoInput[] = (fasesRaw ?? []).map((f) => ({
    produtoId: f.produto_id,
    fase: f.fase as FaseValue,
    data_inicio: f.data_inicio,
    data_fim: f.data_fim,
  }));

  const funis: FunilPremissaInput[] = (funisRaw ?? [])
    .map((f) => {
      const fase = faseById.get(f.fase_produto_id);
      if (!fase) return null;
      return {
        produtoId: fase.produto_id,
        fase: fase.fase as FaseValue,
        taxa_conversao: f.taxa_conversao,
        capacidade_vendedor_mes: f.capacidade_vendedor_mes,
        span_of_control: f.span_of_control,
        horas_suporte_por_cliente_mes: f.horas_suporte_por_cliente_mes,
      };
    })
    .filter((f): f is FunilPremissaInput => f !== null);

  const simulacao: SimulacaoMesInput[] = (simulacaoRaw ?? []).map((s) => ({
    produtoId: s.produto_id,
    mes_referencia: s.mes_referencia,
    novos_clientes: Number(s.novos_clientes),
    clientes_ativos: Number(s.clientes_ativos),
  }));

  const demanda = calcularDemandaPorCargo({ fasesPorProduto, funis, simulacao });

  const semDados = demanda.sdr.length === 0 && demanda.coordenador.length === 0 && demanda.suporte.length === 0;

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
            Demanda de SDR, Coordenador e Suporte derivada das premissas de funil (em{" "}
            <Link href="/produtos" className="text-primary-deep underline">
              Produtos
            </Link>
            , dentro de cada fase) e do crescimento de clientes já calculado — compare o custo de cada{" "}
            <Link href="/contratacoes/modelos" className="text-primary-deep underline">
              modelo de contratação
            </Link>{" "}
            pra cobrir essa demanda
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

      {semDados ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-text-muted">
            Nenhuma demanda calculada ainda — preencha taxa de conversão e capacidade/vendedor em Funil, e recalcule a
            projeção em Produtos.
          </p>
        </div>
      ) : (
        <NecessidadeTabelas
          cenarioId={cenarioAtual}
          demanda={demanda}
          modelos={modelos ?? []}
          alocacoes={alocacoes ?? []}
        />
      )}
    </div>
  );
}
