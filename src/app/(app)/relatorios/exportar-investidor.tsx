import { FOCOS_INVESTIMENTO, type FocoInvestimento } from "@/lib/indicadores-investidor";

/**
 * Planilha pro investidor: um botão logo abaixo dos filtros que abre a escolha do que incluir.
 * Formulário GET simples (sem JS) — o arquivo baixa direto. As frentes marcadas viram colunas
 * próprias e destacadas; o resto é somado em "Outros". O PDF sai da mesma montagem da planilha —
 * não é uma segunda versão dos números.
 */
export function ExportarInvestidor({
  cenarioId,
  inicio,
  fim,
  focosPadrao,
  origemFoco,
}: {
  cenarioId: string;
  inicio: string;
  fim: string;
  /** Frentes onde o orçamento proposto aplica o recurso — vêm marcadas. Sem orçamento, Marketing e Vendas. */
  focosPadrao: FocoInvestimento[] | null;
  origemFoco: string | null;
}) {
  return (
    <details className="group relative mb-5 w-fit">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg bg-wine-deep px-3.5 py-2 text-[12.5px] font-medium text-white [&::-webkit-details-marker]:hidden">
        Planilha para investidor
        <span className="text-[10px] transition-transform group-open:rotate-180">▾</span>
      </summary>
      <form
        method="get"
        action={`/plano/${cenarioId}/investidor/export`}
        className="absolute left-0 top-full z-20 mt-2 flex w-[520px] max-w-[90vw] flex-col gap-2.5 rounded-xl border border-border bg-surface p-4 shadow-lg"
      >
        <input type="hidden" name="inicio" value={inicio} />
        <input type="hidden" name="fim" value={fim} />
        <span className="text-[11px] font-medium text-text-muted">
          Foco do investimento (colunas destacadas)
          {origemFoco && <span className="font-normal text-text-faint"> — marcado conforme {origemFoco}</span>}
        </span>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {FOCOS_INVESTIMENTO.map((f) => (
            <label key={f.key} className="flex items-center gap-1.5 text-[12px]">
              <input type="checkbox" name="foco" value={f.key} defaultChecked={focosPadrao ? focosPadrao.includes(f.key) : f.padrao} />
              {f.label}
            </label>
          ))}
        </div>
        {/* Os dois botões mandam o MESMO formulário (período + focos marcados); só o formato muda. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border-soft pt-2.5">
          <button type="submit" className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12.5px] font-medium text-white">
            Baixar planilha (.xlsx)
          </button>
          <button
            type="submit"
            name="formato"
            value="pdf"
            className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-medium text-primary-deep hover:bg-bg"
          >
            Baixar PDF (todas as abas)
          </button>
        </div>
      </form>
    </details>
  );
}
