import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuloRow, BlocoRow } from "@/components/produto/linhas";
import type { PerfilSimulado } from "@/lib/perfis";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

const n = (v: unknown): number => (v == null ? 0 : Number(v) || 0);
const nOrNull = (v: unknown): number | null => (v == null || v === "" ? null : Number(v) || 0);

function normalizaPerfil(p: Record<string, unknown>): PerfilSimulado {
  return {
    id: String(p.id),
    codigo: String(p.codigo ?? ""),
    nome: String(p.nome ?? ""),
    descricao: (p.descricao as string) ?? null,
    ordem: n(p.ordem),
    ativo: p.ativo !== false,
    participacao_pct: n(p.participacao_pct),
    faturamento_anual: nOrNull(p.faturamento_anual),
    producao_anual_pecas: nOrNull(p.producao_anual_pecas),
    compra_pronto_pecas: nOrNull(p.compra_pronto_pecas),
    lojas: n(p.lojas),
    usuarios: n(p.usuarios),
    preco_medio: nOrNull(p.preco_medio),
    atacado: !!p.atacado,
    ecommerce: !!p.ecommerce,
    tem_erp_qualidade: !!p.tem_erp_qualidade,
    tem_pcp: !!p.tem_pcp,
    tem_plm: !!p.tem_plm,
    integracao_pronta: !!p.integracao_pronta,
    canais: (p.canais as PerfilSimulado["canais"]) ?? {},
    sistema: (p.sistema as string) ?? null,
  };
}

/** Linhas (módulos/blocos) e perfis da tela de Produto. */
export async function carregarDadosProduto(supabase: Db): Promise<{ modulos: ModuloRow[]; blocos: BlocoRow[]; perfis: PerfilSimulado[] }> {
  const [{ data: modulos }, { data: blocos }, { data: perfis }] = await Promise.all([
    supabase.from("catalogo_modulos").select("id,codigo,nome,ordem,ativo,fases_datas,teste,crescimento_fases").eq("ativo", true).order("ordem"),
    supabase.from("catalogo_blocos").select("id,modulo_id,nome,ordem,ativo,fases_datas,teste,crescimento_fases").eq("ativo", true).order("ordem"),
    supabase.from("perfis_cliente").select("*").order("ordem"),
  ]);
  return {
    modulos: (modulos ?? []) as ModuloRow[],
    blocos: (blocos ?? []) as BlocoRow[],
    perfis: ((perfis ?? []) as Record<string, unknown>[]).map(normalizaPerfil),
  };
}
