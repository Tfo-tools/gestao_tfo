import { createClient } from "@/lib/supabase/server";
import { carregarPrestacao } from "@/lib/prestacao";
import { PlanilhaPrestacao } from "./planilha-prestacao";

export async function PrestacaoDoPrograma({ programaId, programaNome }: { programaId: string; programaNome: string }) {
  const supabase = await createClient();
  const [prestacao, { data: rubricas }] = await Promise.all([
    carregarPrestacao(supabase, programaId),
    supabase.from("programa_rubricas").select("id, nome").eq("programa_id", programaId).order("nome"),
  ]);
  if (prestacao.rubricas.length === 0 && prestacao.bolsa.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-sm font-semibold">{programaNome} — prestação por rubrica e mês</h2>
      <p className="mb-4 text-[11.5px] text-text-muted">
        Cada célula é uma rubrica num mês. A cor mostra o status; clique pra ver e anexar as evidências (nota, cotações, comprovante…).
        O previsto é distribuído linear no período; o lançado vem das despesas vinculadas ao programa.
      </p>
      <PlanilhaPrestacao prestacao={prestacao} rubricasOpcoes={rubricas ?? []} />
    </div>
  );
}
