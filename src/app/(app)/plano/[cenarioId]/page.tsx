import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { agregarPorCenario, computeMetricas } from "@/lib/relatorios-cenario";
import { MetasHeader } from "../metas-header";
import { MetasForm } from "./metas-form";
import { CompletarCopia } from "./completar-copia";

// "Completar cópia" copia o que falta e recalcula todos os produtos — leva alguns segundos.
export const maxDuration = 60;

export default async function PlanoHubPage({ params }: { params: Promise<{ cenarioId: string }> }) {
  const { cenarioId } = await params;
  const supabase = await createClient();

  const { data: cenario } = await supabase
    .from("cenarios")
    .select("id, nome, descricao, is_base, status, cenario_origem_id, meta_receita_mensal, meta_cac, meta_ltv, meta_roi_pct, meta_tir_pct")
    .eq("id", cenarioId)
    .single();
  if (!cenario) notFound();
  const { data: origem } = cenario.cenario_origem_id
    ? await supabase.from("cenarios").select("nome").eq("id", cenario.cenario_origem_id).maybeSingle()
    : { data: null };

  const resumo = await agregarPorCenario(supabase, cenarioId);
  // Indicadores do período do cenário (data_inicio → data_fim), o mesmo recorte das outras telas.
  const metricas = computeMetricas(resumo.linhasPeriodo, resumo.totalInvestido);
  const ultimaLinha = resumo.linhasPeriodo[resumo.linhasPeriodo.length - 1];

  const [{ count: produtosCount }, { count: fasesCount }, { count: custosFixosCount }, { count: custosVariaveisCount }, { count: custosEmpresaCount }, { count: contratacoesCount }, { count: programasCount }] =
    await Promise.all([
      supabase.from("produtos").select("id", { count: "exact", head: true }),
      supabase.from("fases_produto").select("id", { count: "exact", head: true }).eq("cenario_id", cenarioId).not("data_inicio", "is", null),
      supabase
        .from("plano_custos_fixos")
        .select("id, fases_produto!inner(cenario_id)", { count: "exact", head: true })
        .eq("fases_produto.cenario_id", cenarioId),
      supabase
        .from("plano_custos_variaveis")
        .select("id, fases_produto!inner(cenario_id)", { count: "exact", head: true })
        .eq("fases_produto.cenario_id", cenarioId),
      supabase.from("custos_empresa").select("id", { count: "exact", head: true }).eq("cenario_id", cenarioId),
      supabase.from("contratacoes").select("id", { count: "exact", head: true }).eq("cenario_id", cenarioId),
      supabase.from("cenario_programas").select("programa_id", { count: "exact", head: true }).eq("cenario_id", cenarioId),
    ]);

  return (
    <div>
      <div className="mb-2">
        <Link href="/cenarios" className="text-[12.5px] text-text-muted">
          ← Cenários
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            {cenario.is_base && (
              <span className="rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success">CENÁRIO-BASE</span>
            )}
            <h1 className="font-heading text-[22px] font-semibold">{cenario.nome}</h1>
          </div>
          <p className="text-[13px] text-text-muted">{cenario.descricao ?? "Sem descrição."}</p>
        </div>
        <Link
          href={`/plano/${cenarioId}/indicadores`}
          className="rounded-lg bg-wine-deep px-4 py-2.5 text-[13px] font-medium text-white"
        >
          Ver indicadores e EBITDA →
        </Link>
      </div>

      {origem && <CompletarCopia cenarioId={cenarioId} origemNome={origem.nome} />}

      <MetasHeader
        metas={cenario}
        atuais={{
          receitaMensal: ultimaLinha?.receita ?? null,
          cac: metricas.cacMedio,
          ltv: metricas.ltvMedio,
          roiPct: metricas.roiPct,
          tirPct: null,
        }}
      />
      <MetasForm cenarioId={cenarioId} metas={cenario} />

      <div className="flex flex-col gap-3">
        <LinhaPlano
          href={`/plano/${cenarioId}/vendas`}
          titulo="Vendas"
          descricao="Crescimento por fase, churn, funil, planos de preço e módulos — todos os produtos numa tela só."
          status={`${produtosCount ?? 0} produto${(produtosCount ?? 0) === 1 ? "" : "s"} · ${fasesCount ?? 0} fase${(fasesCount ?? 0) === 1 ? "" : "s"} com data definida`}
        />
        <LinhaPlano
          href={`/plano/${cenarioId}/custos`}
          titulo="Plano de Custos"
          descricao="Um card por tipo de custo (CSP, Marketing, Desenvolvimento...) — a mesma linguagem de Lançamentos."
          status={`${custosFixosCount ?? 0} fixo · ${custosVariaveisCount ?? 0} variável · ${custosEmpresaCount ?? 0} da empresa`}
        />
        <LinhaPlano
          href={`/contratacoes?cenario=${cenarioId}`}
          titulo="Contratações planejadas"
          descricao="Equipe além do modelo de alocação padrão — cargo, CLT ou PJ, quando entra."
          status={`${contratacoesCount ?? 0} contratação${(contratacoesCount ?? 0) === 1 ? "" : "ões"} registradas`}
        />
        <LinhaPlano
          href="/fomento"
          titulo="Captação vinculada"
          descricao="Programas de fomento/investimento ligados a este cenário."
          status={`${programasCount ?? 0} programa${(programasCount ?? 0) === 1 ? "" : "s"} vinculado${(programasCount ?? 0) === 1 ? "" : "s"}`}
        />
      </div>
    </div>
  );
}

function LinhaPlano({ href, titulo, descricao, status }: { href: string; titulo: string; descricao: string; status: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary-fill"
    >
      <div>
        <div className="font-heading text-[14.5px] font-semibold">{titulo}</div>
        <p className="mt-0.5 text-[12px] text-text-muted">{descricao}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11.5px] text-text-faint">{status}</span>
        <span className="text-text-faint">→</span>
      </div>
    </Link>
  );
}
