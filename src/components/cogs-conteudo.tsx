import { ParametrosForm } from "@/app/(comercial)/propostas/parametros/parametros-form";
import { SimuladorDesconto } from "@/app/(comercial)/propostas/parametros/simulador-desconto";
import { TaxasPagamentoCard } from "@/app/(app)/configuracoes/taxas-pagamento-card";
import { CustoMedioPanel } from "@/components/custo-medio-panel";
import type { BasesProposta } from "@/lib/precificacao-bases";
import type { TaxaPagamento } from "@/lib/taxas-pagamento";
import type { PerfilSimulado } from "@/lib/perfis";

/**
 * Conteúdo único da tela de COGS, usado igual em Plano (cenário) e em Realizado. Enquanto não há
 * vendas importadas, os dois editam a mesma fonte, então mudar num lugar vale no outro. Projeção de
 * custo médio no topo, parâmetros de preço, taxas (COGS) e simulador de desconto.
 */
export function CogsConteudo({ bases, taxas, clientesAno1, perfis }: { bases: BasesProposta; taxas: TaxaPagamento[]; clientesAno1: number; perfis: PerfilSimulado[] }) {
  return (
    <div className="flex flex-col gap-4">
      <CustoMedioPanel bases={bases} clientesAno1={clientesAno1} perfis={perfis} />
      <ParametrosForm params={bases.params} cargos={bases.cargos} />
      <TaxasPagamentoCard taxas={taxas} />
      <SimuladorDesconto bases={bases} />
    </div>
  );
}
