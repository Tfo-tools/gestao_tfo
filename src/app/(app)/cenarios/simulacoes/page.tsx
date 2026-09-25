import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SIMULACOES_PADRAO } from "@/lib/admin-tasks/simular-cenarios-vs-funses1";
import { SimulacoesForm } from "./simulacoes-form";

// Calibra o crescimento de cada produto por bissecção e recalcula a projeção — leva bem mais que
// uma página comum.
export const maxDuration = 300;

const INTOCAVEIS = new Set(["FUNSES 1"]);

export default async function SimulacoesPage() {
  const supabase = await createClient();
  const { data: cenarios } = await supabase.from("cenarios").select("nome").order("created_at");
  const linhas = (cenarios ?? [])
    .map((c) => c.nome as string)
    .filter((n) => !INTOCAVEIS.has(n))
    .map((nome) => {
      const padrao = SIMULACOES_PADRAO.find((s) => s.nome === nome);
      return {
        nome,
        indice: padrao?.indice ?? 1,
        churnPct: padrao?.churnMensal != null ? Math.round(padrao.churnMensal * 1000) / 10 : null,
        vendedor: padrao ? padrao.vendedor : ("manter" as const),
        marcado: Boolean(padrao),
      };
    });

  return (
    <div>
      <div className="mb-6">
        <Link href="/cenarios" className="text-[12px] text-text-muted hover:text-primary-deep">
          ← Cenários
        </Link>
        <h1 className="mt-1 font-heading text-[22px] font-semibold">Simulações a partir do FUNSES 1</h1>
        <p className="mt-1 max-w-[720px] text-[13px] text-text-muted">
          Cada cenário marcado passa a ter, mês a mês, o índice informado dos clientes ativos do FUNSES 1 (por produto) — preço é premissa à parte. O
          churn segue a mesma curva do FUNSES 1 (por fase, com decaimento), escalada até o churn médio do período
          — o mesmo cálculo do card de indicadores — bater no valor informado. COGS continua por demanda (Suporte
          e CS em PJ, proporcionais); SDR fica PJ por resultado; o vendedor do Fashion Mind pode ficar 100% PJ proporcional à demanda,
          PJ até a necessidade 1,4 e CLT em degraus (1,5 → 1 pessoa, 2,5 → 2, 3,5 → 3…), ou como está no cenário. Churn vazio = a mesma curva do FUNSES 1.
          P&amp;D e G&amp;A seguem as regras já cadastradas no cenário.
        </p>
      </div>
      <SimulacoesForm linhas={linhas} />
    </div>
  );
}
