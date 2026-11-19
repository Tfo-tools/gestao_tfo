import { matrizEntreSocias, investimentoSocias } from "../entre-socias-actions";
import { Matriz } from "./matriz";
import { InvestimentoFooter } from "./investimento";

export const dynamic = "force-dynamic";

export default async function EntreSociasPage() {
  const [matriz, investimento] = await Promise.all([matrizEntreSocias(), investimentoSocias({})]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-heading text-lg font-semibold">Entre sócias</h2>
        <p className="mt-0.5 text-[12.5px] text-text-muted">
          Despesas divididas, por mês. A parcela cheia em cima, os 50% embaixo. Clique num valor pra confirmar o depósito, ou use a tarjinha do mês pra confirmar tudo de uma vez.
        </p>
      </div>

      <Matriz matriz={matriz} />

      <InvestimentoFooter inicial={investimento} />
    </div>
  );
}
