import { createClient } from "@/lib/supabase/server";
import { carregarCronogramaEntregas } from "@/lib/prestacao-entregas";
import { CronogramaBarras, type DespesaLivre } from "./cronograma-barras";

const fmt0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Cronograma de execução em barras + os dois indicadores que o painel mostra lado a lado
 * (físico × orçamentário). Cards de planejamento (internos) só aparecem para a sócia.
 */
export async function CronogramaDoPrograma({
  programaId,
  podeEditar,
  mostrarInternos,
}: {
  programaId: string;
  podeEditar: boolean;
  mostrarInternos: boolean;
}) {
  const supabase = await createClient();
  const [cron, { data: livresRaw }] = await Promise.all([
    carregarCronogramaEntregas(supabase, programaId),
    supabase
      .from("despesas")
      .select("id, descricao, valor_total, data_gasto")
      .eq("programa_id", programaId)
      .is("linha_id", null)
      .order("data_gasto", { ascending: false }),
  ]);

  if (cron.totalEntregas === 0) return null;

  const despesasLivres: DespesaLivre[] = ((livresRaw ?? []) as { id: string; descricao: string | null; valor_total: number; data_gasto: string }[]).map((d) => ({
    id: d.id,
    descricao: d.descricao || "—",
    valor: Number(d.valor_total),
    dataGasto: d.data_gasto,
  }));

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6">
      <div>
        <h2 className="font-heading text-sm font-semibold">Cronograma de execução — atividades</h2>
        <p className="mt-1 text-[11.5px] text-text-muted">
          Cada atividade do orçamento é uma barra, do início à entrega. {podeEditar ? "Clique numa barra para lançar a execução (data real, status) e vincular o pagamento." : "Clique numa barra para ver a execução e o pagamento."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <CardPct label="Execução física" pct={cron.fisicoPct} cor="var(--color-primary-fill)" foot={`${cron.entregues} de ${cron.totalEntregas} atividades entregues`} />
        <CardPct
          label="Execução orçamentária"
          pct={cron.orcamentarioPct}
          cor="var(--color-wine)"
          foot={`${fmt0(cron.gasto)} de ${fmt0(cron.teto)}${cron.orcamentarioPct > cron.fisicoPct ? " · à frente do físico" : ""}`}
        />
        {mostrarInternos && (
          <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-3.5">
            <div className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wide text-text-muted">
              Folga para antecipar
              <span className="rounded bg-wine-soft px-1.5 py-px text-[8.5px] font-bold text-wine">INTERNO</span>
            </div>
            <div className="mt-2 font-heading text-[20px] font-semibold">{cron.antecipadas}</div>
            <div className="mt-1 text-[11px] text-text-muted">{cron.antecipadas === 1 ? "atividade entregue antes do previsto" : "atividades entregues antes do previsto"}</div>
          </div>
        )}
      </div>

      <CronogramaBarras cronograma={cron} podeEditar={podeEditar} despesasLivres={despesasLivres} />
    </div>
  );
}

function CardPct({ label, pct, cor, foot }: { label: string; pct: number; cor: string; foot: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-2 font-heading text-[20px] font-semibold">{pct}%</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: cor }} />
      </div>
      <div className="mt-1.5 text-[11px] text-text-muted">{foot}</div>
    </div>
  );
}
