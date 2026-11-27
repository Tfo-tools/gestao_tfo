import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { carregarCronogramaEntregas } from "@/lib/prestacao-entregas";
import { carregarOrcamentoTempo } from "@/lib/orcamento-tempo";
import { carregarPrestacao } from "@/lib/prestacao";
import { CronogramaBarras } from "./cronograma-barras";
import { OrcamentoControle } from "./orcamento-controle";
import { carregarCotacoesPorRubrica } from "./cotacao-actions";
import { PainelTabs } from "./painel-tabs";

const fmt0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Painel de execução de um programa: cards (físico, orçamentário, projeção, saldo) e, abaixo, duas
 * abas — "Cronograma de atividades" (atividade ▸ rúbrica ▸ entrega) e "Orçamento" (rúbrica × mês). O
 * dossiê consolidado abre numa tela própria (ícone acima dos cards). Cards internos só p/ sócia.
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
  const [cron, orc, prestacao, { data: rubricasOpcoes }, cotacoesPorRubrica] = await Promise.all([
    carregarCronogramaEntregas(supabase, programaId),
    carregarOrcamentoTempo(supabase, programaId),
    carregarPrestacao(supabase, programaId),
    supabase.from("programa_rubricas").select("id, nome").eq("programa_id", programaId).order("nome"),
    carregarCotacoesPorRubrica(programaId),
  ]);

  const temOrcamento = prestacao.rubricas.length > 0 || prestacao.contrapartida.length > 0 || prestacao.bolsa.length > 0;
  if (cron.atividades.length === 0 && orc.linhas.length === 0 && !temOrcamento) return null;

  const estoura = orc.saldo < 0;
  const pendentesEntrega = cron.atividades.reduce((s, a) => s + a.pendentes.length, 0);

  const cards = (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <CardPct label="Execução física" pct={cron.fisicoPct} cor="var(--color-primary-fill)" foot={`${cron.entregues} de ${cron.totalSlots} entregas comprovadas`} />
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
        <div className="mt-1.5 text-[11px] text-text-muted">{estoura ? `remanejar ${fmt0(-orc.saldo)} das linhas em previsto` : "dentro do teto aprovado (subvenção)"}</div>
      </div>
      {mostrarInternos && (
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-3.5">
          <div className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wide text-text-muted">
            Folga para antecipar
            <span className="rounded bg-wine-soft px-1.5 py-px text-[8.5px] font-bold text-wine">INTERNO</span>
          </div>
          <div className="mt-2 font-heading text-[19px] font-semibold">{cron.antecipadas}</div>
          <div className="mt-1 text-[11px] text-text-muted">{cron.antecipadas === 1 ? "entrega antes do previsto" : "entregas antes do previsto"}</div>
        </div>
      )}
    </div>
  );

  const cronograma = cron.atividades.length > 0
    ? <CronogramaBarras cronograma={cron} programaId={programaId} podeEditar={podeEditar} />
    : <p className="text-[12.5px] text-text-muted">Sem atividades no cronograma ainda.</p>;

  const orcamento = temOrcamento
    ? <OrcamentoControle orcamento={orc} prestacao={prestacao} rubricasOpcoes={rubricasOpcoes ?? []} podeEditar={podeEditar} programaId={programaId} cotacoesPorRubrica={cotacoesPorRubrica} />
    : <p className="text-[12.5px] text-text-muted">Sem orçamento cadastrado para este programa ainda.</p>;

  const downloadZip = (
    <a
      href="/prestacao-de-contas/export"
      className="rounded-lg border border-primary-fill bg-primary-soft px-3 py-1.5 text-[12px] font-medium text-primary-deep hover:bg-primary-soft/70"
    >
      ⬇ Comprovantes e notas (.zip)
    </a>
  );

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-sm font-semibold">Execução do programa</h2>
          <p className="mt-1 text-[11.5px] text-text-muted">Cronograma por atividade e orçamento auditável (rúbrica × mês), com controle de estouro vs. o aprovado pela FAPES.</p>
        </div>
        <Link
          href={`/prestacao-de-contas/dossie?programa=${programaId}`}
          title="Abrir o dossiê de comprovação (tela consolidada)"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-wine/40 bg-wine-soft/40 px-3 py-1.5 text-[12px] font-medium text-wine-deep hover:bg-wine-soft"
        >
          <span aria-hidden>📋</span> Dossiê
          {pendentesEntrega > 0 ? <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{pendentesEntrega}</span> : null}
        </Link>
      </div>

      <PainelTabs
        cards={cards}
        cronograma={cronograma}
        orcamento={orcamento}
        pinCrono={`${cron.entregues}/${cron.totalSlots}`}
        acaoOrcamento={downloadZip}
      />
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
