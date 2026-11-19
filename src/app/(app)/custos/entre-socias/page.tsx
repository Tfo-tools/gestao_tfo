import { matrizEntreSocias, investimentoSocias } from "../entre-socias-actions";
import { Matriz } from "./matriz";
import { InvestimentoFooter } from "./investimento";

export const dynamic = "force-dynamic";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function EntreSociasPage() {
  const [matriz, investimento] = await Promise.all([matrizEntreSocias(), investimentoSocias({})]);
  const c = matriz.consolidado;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-heading text-lg font-semibold">Entre sócias</h2>
        <p className="mt-0.5 text-[12.5px] text-text-muted">
          Despesas divididas, por mês. Clique no valor pra confirmar o depósito; no total do mês pra confirmar todos de uma vez.
        </p>
      </div>

      {c && (
        <div className={`rounded-xl border p-5 ${c.valor > 0 ? "border-wine/30 bg-wine-soft/40" : "border-border bg-surface"}`}>
          <div className="text-[10.5px] uppercase tracking-wide text-text-faint">Consolidado — falta depositar</div>
          <div className="mt-1 text-[15px] font-semibold">
            {c.valor > 0 ? (
              <>
                {cap(c.devedora)} deve <span className="font-mono">{fmt(c.valor)}</span> a {cap(c.credora)}
              </>
            ) : (
              "Tudo quitado — ninguém deve nada."
            )}
          </div>
        </div>
      )}

      <Matriz matriz={matriz} />

      <InvestimentoFooter inicial={investimento} />
    </div>
  );
}
