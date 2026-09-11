import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { OrcamentoEditor } from "./orcamento-editor";

export default async function OrcamentoProgramaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: programa }, { data: rubricas }, { data: linhas }, { data: planoContas }] = await Promise.all([
    supabase.from("programas_investimento").select("id, nome, valor_total, valor_subvencao, valor_contrapartida").eq("id", id).single(),
    supabase.from("programa_rubricas").select("id, nome, fonte").eq("programa_id", id).order("nome"),
    supabase
      .from("programa_linhas_previstas")
      .select("id, rubrica_id, plano_contas_id, atividade, data_inicio, data_fim, tipo_custo, valor, observacoes")
      .eq("programa_id", id)
      .order("data_inicio"),
    supabase.from("plano_contas").select("id, codigo, conta").in("tipo", ["cogs", "opex"]).order("codigo"),
  ]);

  if (!programa) {
    return (
      <div>
        <p className="text-[13px] text-text-muted">Programa não encontrado.</p>
        <Link href="/fomento" className="text-[12.5px] text-primary-deep">
          ← Voltar pra Fomento
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2">
        <Link href="/fomento" className="text-[12.5px] text-text-muted">
          ← Fomento &amp; Investimento
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">Orçamento proposto — {programa.nome}</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-text-muted">
          Como você apresentou que vai usar o recurso — por atividade do cronograma, com a rubrica do edital como
          etiqueta. As duas visões (por atividade e por rubrica) vêm dos mesmos lançamentos, não precisa preencher
          duas vezes.
        </p>
      </div>

      <OrcamentoEditor programaId={id} rubricas={rubricas ?? []} linhas={linhas ?? []} planoContas={planoContas ?? []} />
    </div>
  );
}
