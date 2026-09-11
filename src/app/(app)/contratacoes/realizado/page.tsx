import { createClient } from "@/lib/supabase/server";
import { EquipeForm } from "./equipe-form";
import { MembroRow, type MembroEquipeData } from "./membro-row";
import { calcularCustoClt, custoMensalPJ, LABEL_CATEGORIA_ALOCACAO, type CategoriaAlocacao } from "@/lib/custo-equipe";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function EquipeRealizadoPage() {
  const supabase = await createClient();

  const [{ data: membrosRaw }, { data: regimes }, { data: produtos }] = await Promise.all([
    supabase
      .from("equipe_realizado")
      .select(
        "id, nome, tipo_contratacao, data_inicio, data_fim, ativo, salario_bruto, regime_id, beneficios_mensal, valor_hora, observacoes, equipe_realizado_alocacoes(categoria, produto_id, horas_por_dia)",
      )
      .order("ativo", { ascending: false })
      .order("nome"),
    supabase.from("encargos_regimes").select("id, nome, aliquota_total_efetiva").order("aliquota_total_efetiva"),
    supabase.from("produtos").select("id, nome").order("nome"),
  ]);

  const regimesTyped = (regimes ?? []) as { id: string; nome: string; aliquota_total_efetiva: number }[];
  const produtosTyped = (produtos ?? []) as { id: string; nome: string }[];

  const membros: MembroEquipeData[] = (membrosRaw ?? []).map((m) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mm = m as any;
    return {
      id: mm.id,
      nome: mm.nome,
      tipo_contratacao: mm.tipo_contratacao,
      data_inicio: mm.data_inicio,
      data_fim: mm.data_fim,
      ativo: mm.ativo,
      salario_bruto: mm.salario_bruto,
      regime_id: mm.regime_id,
      beneficios_mensal: mm.beneficios_mensal,
      valor_hora: mm.valor_hora,
      observacoes: mm.observacoes,
      alocacoes: mm.equipe_realizado_alocacoes ?? [],
    };
  });

  const ativos = membros.filter((m) => m.ativo);

  let custoTotalMensal = 0;
  const custoPorCategoria = new Map<CategoriaAlocacao, number>();
  for (const m of ativos) {
    const regime = regimesTyped.find((r) => r.id === m.regime_id);
    let custo = 0;
    if (m.tipo_contratacao === "clt" && m.salario_bruto && regime) {
      custo = calcularCustoClt(Number(m.salario_bruto), Number(regime.aliquota_total_efetiva), Number(m.beneficios_mensal)).custoTotalMensal;
    } else if (m.tipo_contratacao === "pj" && m.valor_hora) {
      custo = custoMensalPJ(
        Number(m.valor_hora),
        m.alocacoes.map((a) => ({ categoria: a.categoria, produtoId: a.produto_id, horasPorDia: Number(a.horas_por_dia) })),
      ).custoTotalMensal;
    }
    custoTotalMensal += custo;

    const totalHorasMembro = m.alocacoes.reduce((s, a) => s + Number(a.horas_por_dia), 0) || 1;
    for (const a of m.alocacoes) {
      const fatia = custo * (Number(a.horas_por_dia) / totalHorasMembro);
      custoPorCategoria.set(a.categoria, (custoPorCategoria.get(a.categoria) ?? 0) + fatia);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Contratações — Realizado</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Quem já está contratado de fato e quanto custa por mês — diferente do planejamento em Plano → Custos COGS.
        </p>
      </div>

      {ativos.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-4 font-heading text-sm font-semibold">Resumo mensal</h2>
          <div className="mb-4 flex items-baseline gap-2">
            <span className="font-mono text-[24px] font-semibold">{formatBRL(custoTotalMensal)}</span>
            <span className="text-[12px] text-text-muted">/mês — {ativos.length} {ativos.length === 1 ? "pessoa ativa" : "pessoas ativas"}</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[...custoPorCategoria.entries()].map(([cat, valor]) => (
              <div key={cat} className="rounded-lg bg-bg p-3">
                <div className="text-[10.5px] text-text-faint">{LABEL_CATEGORIA_ALOCACAO[cat]}</div>
                <div className="mt-0.5 font-mono text-[14px] font-semibold">{formatBRL(valor)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-[420px_1fr] items-start gap-5">
        <EquipeForm regimes={regimesTyped} produtos={produtosTyped} />

        <div className="flex flex-col gap-3">
          {membros.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
              <p className="text-sm text-text-muted">Nenhuma contratação registrada ainda.</p>
            </div>
          ) : (
            membros.map((m) => <MembroRow key={m.id} membro={m} regimes={regimesTyped} produtos={produtosTyped} />)
          )}
        </div>
      </div>
    </div>
  );
}
