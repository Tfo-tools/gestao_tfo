"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recalcularTodosProdutos } from "@/app/(app)/produtos/[id]/simulacao-actions";
import { mesMaisAnos, type ParametrosAcao, type RetornoAcao, type TipoAcao } from "@/lib/acoes-marketing";

export type AcaoMarketingForm = {
  id?: string | null;
  tipo: TipoAcao;
  nome: string;
  /** Feira: mês da feira; campanha: primeiro mês ("AAAA-MM"). */
  mes: string | null;
  /** Campanha: último mês ("AAAA-MM"); null = até o fim do cenário. */
  mes_fim?: string | null;
  ano: number | null;
  quantidade: number | null;
  /** Feira: custo total; evento: custo médio por evento; campanha: verba mensal. */
  custo: number;
  retorno: RetornoAcao[];
  parametros?: ParametrosAcao | null;
  soma_na_meta?: boolean;
  observacoes: string | null;
};

// Feira e evento: 2.1.8 Participação em Feiras e Eventos Setoriais. Campanha: 2.1.1 Mídia Paga.
const CONTA_POR_TIPO: Record<TipoAcao, string> = { feira: "2.1.8", evento: "2.1.8", campanha: "2.1.1" };

function numOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function recalcularERevalidar(cenarioId: string): Promise<string[]> {
  const { falhas } = await recalcularTodosProdutos(cenarioId);
  revalidatePath(`/plano/${cenarioId}`, "layout");
  revalidatePath("/relatorios");
  return falhas;
}

/** Cria ou atualiza uma ação de marketing e recalcula a projeção. */
export async function salvarAcaoMarketing(cenarioId: string, dados: AcaoMarketingForm): Promise<{ error: string | null }> {
  const nome = dados.nome.trim();
  if (!cenarioId || !nome) return { error: "Dê um nome pra ação." };
  const p = dados.parametros ?? {};
  let custo = Number(dados.custo);
  let parametros: ParametrosAcao = {};

  if (dados.tipo === "feira") {
    if (!dados.mes) return { error: "Informe o mês e o ano da feira." };
    const partes = { estande: numOuNull(p.estande), logistica: numOuNull(p.logistica), material: numOuNull(p.material) };
    // Com a composição preenchida, o custo é a soma dela — um número só, sem divergência.
    if (Object.values(partes).some((v) => v != null)) custo = (partes.estande ?? 0) + (partes.logistica ?? 0) + (partes.material ?? 0);
    parametros = partes;
  } else if (dados.tipo === "evento") {
    if (!dados.ano || !dados.quantidade || dados.quantidade < 1) return { error: "Informe o ano e a quantidade de eventos." };
  } else {
    if (!dados.mes) return { error: "Informe o mês em que a campanha começa." };
    if (dados.mes_fim && dados.mes_fim.slice(0, 7) < dados.mes.slice(0, 7)) return { error: "O fim da campanha é antes do início." };
    const cpl = numOuNull(p.cpl);
    const conversao = numOuNull(p.conversao);
    if (!(custo > 0)) return { error: "Informe a verba mensal da campanha." };
    if (!cpl || cpl <= 0) return { error: "Informe o custo por lead (CPL)." };
    if (conversao == null || conversao <= 0 || conversao > 1) return { error: "Informe a conversão lead → cliente (entre 0 e 100%)." };
    parametros = { canal: (p.canal ?? "").toString().trim() || null, cpl, conversao };
  }
  if (!Number.isFinite(custo) || custo < 0) return { error: "Informe o custo (pode ser zero)." };

  const retorno = dados.retorno
    .filter((r) => r.produto_id && (dados.tipo === "campanha" || Number(r.clientes) > 0))
    .map((r) => ({
      produto_id: r.produto_id,
      plano_tipo: r.plano_tipo ?? null,
      plano_nome: r.plano_nome ?? null,
      clientes: dados.tipo === "campanha" ? Math.max(1, Number(r.clientes) || 1) : Number(r.clientes),
    }));
  if (dados.tipo === "campanha" && retorno.length === 0) return { error: "Escolha pra qual ferramenta a campanha traz clientes." };

  const supabase = await createClient();
  const { data: conta } = await supabase.from("plano_contas").select("id").eq("codigo", CONTA_POR_TIPO[dados.tipo]).maybeSingle();
  const linha = {
    cenario_id: cenarioId,
    tipo: dados.tipo,
    nome,
    mes: dados.tipo === "evento" ? null : `${dados.mes!.slice(0, 7)}-01`,
    mes_fim: dados.tipo === "campanha" && dados.mes_fim ? `${dados.mes_fim.slice(0, 7)}-01` : null,
    ano: dados.tipo === "evento" ? dados.ano : null,
    quantidade: dados.tipo === "evento" ? dados.quantidade : null,
    custo,
    retorno,
    parametros,
    soma_na_meta: dados.soma_na_meta === true,
    plano_contas_id: conta?.id ?? null,
    observacoes: dados.observacoes?.trim() || null,
  };
  const { error } = dados.id
    ? await supabase.from("acoes_marketing").update(linha).eq("id", dados.id)
    : await supabase.from("acoes_marketing").insert(linha);
  if (error) return { error: "Não foi possível salvar a ação." };

  const falhas = await recalcularERevalidar(cenarioId);
  return falhas.length > 0 ? { error: `Salvo, mas a projeção falhou em: ${falhas.join("; ")}` } : { error: null };
}

export async function excluirAcaoMarketing(id: string, cenarioId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("acoes_marketing").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir." };
  await recalcularERevalidar(cenarioId);
  return { error: null };
}

/** Copia a ação para o ano seguinte (feira no mesmo mês, eventos do ano seguinte, campanha deslocada
 *  12 meses). O ano no nome também avança: "Febratex 2027" vira "Febratex 2028". */
export async function duplicarAcaoMarketing(id: string, cenarioId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: a } = await supabase.from("acoes_marketing").select("*").eq("id", id).maybeSingle();
  if (!a) return { error: "Ação não encontrada." };
  const nome = String(a.nome).replace(/\b(20\d{2})\b/g, (ano) => String(Number(ano) + 1));
  const copia = {
    cenario_id: cenarioId,
    tipo: a.tipo,
    nome: nome === a.nome ? `${a.nome} (ano seguinte)` : nome,
    mes: a.mes ? mesMaisAnos(a.mes, 1) : null,
    mes_fim: a.mes_fim ? mesMaisAnos(a.mes_fim, 1) : null,
    ano: a.ano ? Number(a.ano) + 1 : null,
    quantidade: a.quantidade,
    custo: a.custo,
    retorno: a.retorno,
    parametros: a.parametros ?? {},
    soma_na_meta: a.soma_na_meta ?? false,
    plano_contas_id: a.plano_contas_id,
    observacoes: a.observacoes,
  };
  const { error } = await supabase.from("acoes_marketing").insert(copia);
  if (error) return { error: "Não foi possível duplicar." };
  await recalcularERevalidar(cenarioId);
  return { error: null };
}
