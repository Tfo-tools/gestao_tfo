import { createClient } from "@/lib/supabase/server";
import { carregarCronogramaEntregas } from "@/lib/prestacao-entregas";
import { carregarOrcamentoTempo } from "@/lib/orcamento-tempo";
import { CronogramaBarras, type DespesaLivre } from "./cronograma-barras";
import { OrcamentoControle } from "./orcamento-controle";

const fmt0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Painel de execução de um programa: cards (físico, orçamentário, projeção, saldo), o cronograma em
 * barras e o orçamento no tempo (controle de estouro). Cards de planejamento (internos) só p/ sócia.
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
  const [cron, orc, { data: livresRaw }] = await Promise.all([
    carregarCronogramaEntregas(supabase, programaId),
    carregarOrcamentoTempo(supabase, programaId),
    supabase
      .from("despesas")
      .select("id, descricao, valor_total, data_gasto")
      .eq("programa_id", programaId)
      .is("linha_id", null)
      .order("data_gasto", { ascending: false }),
  ]);

  if (cron.totalEntregas === 0 && orc.linhas.length === 0) return null;

  const despesasLivres: DespesaLivre[] = ((livresRaw ?? []) as { id: string; descricao: string | null; valor_total: number; data_gasto: string }[]).map((d) => ({
    id: d.id, descricao: d.descricao || "—", valor: Number(d.valor_total), dataGasto: d.data_gasto,
  }));

  const estoura = orc.saldo < 0;

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6">
      <div>
        <h2 className="font-heading text-sm font-semibold">Execução do programa</h2>
        <p className="mt-1 text-[11.5px] text-text-muted">Cronograma de atividades, execução física × orçamentária e controle de estouro vs. o aprovado pela FAPES.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CardPct label="Execução física" pct={cron.fisicoPct} cor="var(--color-primary-fill)" foot={`${cron.entregues} de ${cron.totalEntregas} atividades entregues`} />
        <CardPct label="Execução orçamentária" pct={orc.orcamentariaPct} cor="var(--color-wine)" foot={`realizado ${fmt0(orc.realizadoTotal)} de ${fmt0(orc.teto)}`} />
        <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
          <div className="text-[10.5px] font-medium uppercase tracking-wide text-text-muted">Projeção</div>
          <div className="mt-2 font-heading text-[19px] font-semibold">{fmt0(orc.projecaoTotal)}</div>
          <div className="mt-1.5 text-[11px] text-text-muted">realizado + negociado + previsto</div>
        </div>
        <div className={`rounded-xl border px-4 py-3.5 ${estoura ? "border-danger/40 bg-danger-soft" : "border-border bg-surface"}`}>
          <div className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wide text-text-muted">
            Saldo do teto
            {estoura && <span className="rounded-full bg-danger px-1.5 py-px text-[8.5px] font-bold text-white">estouro</span>}
          </div>
          <div className={`mt-2 font-heading text-[19px] font-semibold ${estoura ? "text-danger" : ""}`}>{sgn(orc.saldo)}</div>
          <div className="mt-1.5 text-[11px] text-text-muted">{estoura ? `remanejar ${fmt0(-orc.saldo)} das linhas em previsto` : "dentro do teto aprovado"}</div>
        </div>
        {mostrarInternos && (
          <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-3.5">
            <div className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wide text-text-muted">
              Folga para antecipar
              <span className="rounded bg-wine-soft px-1.5 py-px text-[8.5px] font-bold text-wine">INTERNO</span>
            </div>
            <div className="mt-2 font-heading text-[19px] font-semibold">{cron.antecipadas}</div>
            <div className="mt-1 text-[11px] text-text-muted">{cron.antecipadas === 1 ? "atividade entregue antes do previsto" : "atividades entregues antes do previsto"}</div>
          </div>
        )}
      </div>

      {cron.totalEntregas > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[12.5px] font-semibold">Cronograma — atividades</h3>
          <CronogramaBarras cronograma={cron} podeEditar={podeEditar} despesasLivres={despesasLivres} />
        </div>
      )}

      {orc.linhas.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[12.5px] font-semibold">Orçamento no tempo <span className="font-normal text-text-faint">· teto {fmt0(orc.teto)} (subvenção; bolsa e contrapartida à parte)</span></h3>
          <p className="text-[11px] text-text-muted">Um valor por célula: previsto (aprovado) → negociado (orçamento fechado) → realizado (pago). {podeEditar && "Clique numa rubrica para informar o valor negociado."}</p>
          <OrcamentoControle orcamento={orc} podeEditar={podeEditar} />
        </div>
      )}
    </div>
  );
}

function CardPct({ label, pct, cor, foot }: { label: string; pct: number; cor: string; foot: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-2 font-heading text-[19px] font-semibold">{pct}%</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: cor }} />
      </div>
      <div className="mt-1.5 text-[11px] text-text-muted">{foot}</div>
    </div>
  );
}

function sgn(v: number) {
  const s = Math.abs(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  return (v > 0 ? "+ " : v < 0 ? "− " : "") + s;
}
