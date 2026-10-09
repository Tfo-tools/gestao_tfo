import type { PerfilCliente } from "@/lib/precificacao";

/**
 * Perfis de cliente (aba 3 da tela de Produto). Cada perfil tem uma participação (fatia da base) e a
 * descrição do cliente típico: faturamento, lojas, canais, sistema. A média ponderada pela
 * participação vira o "cliente médio" que alimenta o volume, o custo médio e o preço no COGS.
 */
export type CanaisMix = { atacado?: number; varejo_proprio?: number; ecommerce?: number; marketplace?: number };

export type PerfilSimulado = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  participacao_pct: number; // fatia da base (0..1)
  faturamento_anual: number | null;
  producao_anual_pecas: number | null;
  compra_pronto_pecas: number | null;
  lojas: number;
  usuarios: number;
  preco_medio: number | null;
  atacado: boolean;
  ecommerce: boolean;
  tem_erp_qualidade: boolean;
  tem_pcp: boolean;
  tem_plm: boolean;
  integracao_pronta: boolean;
  canais: CanaisMix;
  sistema: string | null;
};

export const SISTEMAS = [
  { value: "erp_setorial", label: "ERP setorial de moda (PCP/custo)" },
  { value: "erp_varejo", label: "ERP de varejo (Tiny/Bling)" },
  { value: "planilha", label: "Planilha" },
  { value: "nenhum", label: "Nenhum" },
] as const;

/** Cliente médio ponderado pela participação dos perfis ativos. Booleanos pela maioria ponderada. */
export function clienteMedioPonderado(perfis: PerfilSimulado[]): { perfil: PerfilCliente; participacaoTotal: number } {
  const ativos = perfis.filter((p) => p.ativo && (Number(p.participacao_pct) || 0) > 0);
  const total = ativos.reduce((s, p) => s + (Number(p.participacao_pct) || 0), 0);
  const base = total || 1;
  const wn = (f: (p: PerfilSimulado) => number) =>
    ativos.reduce((s, p) => s + ((Number(p.participacao_pct) || 0) / base) * f(p), 0);
  const wb = (f: (p: PerfilSimulado) => boolean) =>
    ativos.reduce((s, p) => s + ((Number(p.participacao_pct) || 0) / base) * (f(p) ? 1 : 0), 0) >= 0.5;
  const perfil: PerfilCliente = {
    faturamento_anual: wn((p) => Number(p.faturamento_anual) || 0),
    producao_anual_pecas: wn((p) => Number(p.producao_anual_pecas) || 0),
    compra_pronto_pecas: wn((p) => Number(p.compra_pronto_pecas) || 0),
    lojas: wn((p) => Number(p.lojas) || 0),
    atacado: wb((p) => p.atacado),
    ecommerce: wb((p) => p.ecommerce),
    usuarios: wn((p) => Number(p.usuarios) || 0),
    preco_medio: wn((p) => Number(p.preco_medio) || 0),
    tem_erp_qualidade: wb((p) => p.tem_erp_qualidade),
    tem_pcp: wb((p) => p.tem_pcp),
    tem_plm: wb((p) => p.tem_plm),
    integracao_pronta: wb((p) => p.integracao_pronta),
  };
  return { perfil, participacaoTotal: total };
}
