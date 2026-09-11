import { FOCOS_INVESTIMENTO } from "@/lib/indicadores-investidor";

/**
 * Planilha pro investidor: um formulário GET simples (sem JS) — o arquivo baixa direto. As
 * categorias marcadas viram colunas próprias e destacadas; o resto é somado em "Outros".
 */
export function ExportarInvestidor({ cenarioId, inicio, fim }: { cenarioId: string; inicio: string; fim: string }) {
  return (
    <div className="mb-5 rounded-xl border border-primary-fill/60 bg-primary-soft/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="font-heading text-sm font-semibold">Planilha para investidor</h2>
          <p className="mt-1 text-[11.5px] text-text-muted">
            Primeira aba com os indicadores que a banca usa pra decidir (ARR, margem bruta, CAC, LTV:CAC, payback do CAC, churn,
            queima de caixa, burn multiple, Regra dos 40, retorno do capital novo), depois o resumo por ano com EBITDA consolidado
            e a DRE mês a mês — receita e clientes sempre, custos fixos e variáveis. Marque onde o recurso vai ser aplicado: essas
            linhas saem em colunas próprias, destacadas.
          </p>
        </div>
        <form method="get" action={`/plano/${cenarioId}/investidor/export`} className="flex flex-col gap-2">
          <input type="hidden" name="inicio" value={inicio} />
          <input type="hidden" name="fim" value={fim} />
          <span className="text-[11px] font-medium text-text-muted">Foco do investimento</span>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {FOCOS_INVESTIMENTO.map((f) => (
              <label key={f.key} className="flex items-center gap-1.5 text-[12px]">
                <input type="checkbox" name="foco" value={f.key} defaultChecked={f.padrao} />
                {f.label}
              </label>
            ))}
          </div>
          <button type="submit" className="mt-1 w-fit rounded-lg bg-wine-deep px-3.5 py-2 text-[12.5px] font-medium text-white">
            Baixar planilha (.xlsx)
          </button>
        </form>
      </div>
    </div>
  );
}
