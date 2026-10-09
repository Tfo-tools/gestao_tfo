import { ParametrosForm } from "@/app/(comercial)/propostas/parametros/parametros-form";
import { CustoMedioPanel } from "@/components/custo-medio-panel";
import type { BasesProposta } from "@/lib/precificacao-bases";
import type { TaxaPagamento } from "@/lib/taxas-pagamento";
import type { PerfilSimulado } from "@/lib/perfis";

/**
 * Conteúdo único da tela de COGS, usado igual em Plano (cenário) e em Realizado. Projeção de custo
 * médio no topo (ponderada pelos perfis) e, em abas, os parâmetros de custo/preço: Infra (com custo
 * por funcionalidade), Implantação, Taxas, Suporte e CS, e Parâmetros + simulador de descontos.
 */
export function CogsConteudo({ bases, taxas, clientesAno1, perfis }: { bases: BasesProposta; taxas: TaxaPagamento[]; clientesAno1: number; perfis: PerfilSimulado[] }) {
  return (
    <div className="flex flex-col gap-4">
      <CustoMedioPanel bases={bases} clientesAno1={clientesAno1} perfis={perfis} />
      <ParametrosForm params={bases.params} cargos={bases.cargos} taxas={taxas} bases={bases} />
    </div>
  );
}
