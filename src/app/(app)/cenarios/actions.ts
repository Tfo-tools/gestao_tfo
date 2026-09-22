"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { capturarPontoPartida } from "@/lib/ponto-partida";
import { recalcularTodosProdutos } from "@/app/(app)/produtos/[id]/simulacao-actions";

export type CenarioFormState = { error: string | null };

type Supabase = Awaited<ReturnType<typeof createClient>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Colunas que o banco gera sozinho — nunca vão no insert de uma cópia. */
function semColunasDeSistema(row: Row): Row {
  const { id: _id, created_at: _c, updated_at: _u, ...resto } = row;
  return resto;
}

export async function renomearCenario(
  _prevState: CenarioFormState,
  formData: FormData,
): Promise<CenarioFormState> {
  const id = String(formData.get("id") || "");
  const nome = String(formData.get("nome") || "").trim();
  const descricao = String(formData.get("descricao") || "").trim() || null;
  const mesInicio = String(formData.get("data_inicio") || "");
  const mesFim = String(formData.get("data_fim") || "");

  if (!id || !nome) {
    return { error: "Dê um nome para o cenário." };
  }
  if (!mesInicio || !mesFim) {
    return { error: "Informe o início e o fim do período do plano." };
  }
  if (mesFim < mesInicio) {
    return { error: "O fim precisa ser depois (ou igual) do início." };
  }

  const supabase = await createClient();
  const { data: antes } = await supabase
    .from("cenarios")
    .select("data_inicio, data_fim, cenario_origem_id")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("cenarios")
    .update({
      nome,
      descricao,
      data_inicio: `${mesInicio}-01`,
      data_fim: `${mesFim}-01`,
    })
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível renomear o cenário." };
  }

  // Mudou o período: a projeção precisa ser refeita pro novo horizonte e, se o cenário herda o ponto
  // de partida de outro, a abertura passa a ser a do novo mês de início.
  const mudouInicio = antes && antes.data_inicio?.slice(0, 7) !== mesInicio;
  const mudouFim = antes && antes.data_fim?.slice(0, 7) !== mesFim;
  if (mudouInicio && antes?.cenario_origem_id) {
    const ponto = await capturarPontoPartida(
      supabase,
      antes.cenario_origem_id,
      `${mesInicio}-01`,
    );
    await supabase
      .from("cenarios")
      .update({ ponto_partida: ponto })
      .eq("id", id);
  }
  if (mudouInicio || mudouFim) {
    await recalcularTodosProdutos(id);
  }

  revalidatePath("/cenarios");
  revalidatePath(`/plano/${id}`, "layout");
  return { error: null };
}

export async function excluirCenario(
  id: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("cenarios").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "Não é possível excluir: existem outros cenários duplicados a partir deste. Exclua-os primeiro.",
      };
    }
    return { error: "Não foi possível excluir o cenário." };
  }

  revalidatePath("/cenarios");
  return { error: null };
}

export async function salvarMetasCenario(
  _prevState: CenarioFormState,
  formData: FormData,
): Promise<CenarioFormState> {
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Cenário não encontrado." };

  function numOuNull(campo: string) {
    const raw = String(formData.get(campo) || "").trim();
    return raw ? Number(raw) : null;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cenarios")
    .update({
      meta_receita_mensal: numOuNull("meta_receita_mensal"),
      meta_cac: numOuNull("meta_cac"),
      meta_ltv: numOuNull("meta_ltv"),
      meta_margem_bruta_pct: numOuNull("meta_margem_bruta_pct"),
      meta_tir_pct: numOuNull("meta_tir_pct"),
    })
    .eq("id", id);

  if (error) return { error: "Não foi possível salvar as metas." };

  revalidatePath(`/plano/${id}`, "layout");
  return { error: null };
}

export async function criarCenario(
  _prevState: CenarioFormState,
  formData: FormData,
): Promise<CenarioFormState> {
  const nome = String(formData.get("nome") || "").trim();
  const descricao = String(formData.get("descricao") || "").trim() || null;
  const duplicarDe = String(formData.get("duplicar_de") || "") || null;
  // Vários programas: os que o cenário de origem já tinha (vêm marcados no formulário) + o novo.
  const programaIds = [
    ...new Set(formData.getAll("programa_id").map(String).filter(Boolean)),
  ];
  const mesInicio = String(formData.get("data_inicio") || "");
  const mesFim = String(formData.get("data_fim") || "");

  if (!nome) {
    return { error: "Dê um nome para o cenário." };
  }
  if (!mesInicio || !mesFim) {
    return { error: "Informe o início e o fim do período do plano." };
  }
  if (mesFim < mesInicio) {
    return { error: "O fim precisa ser depois (ou igual) do início." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Metas do cenário de origem vêm junto — o espelho começa idêntico e só muda o que for editado.
  const { data: origem } = duplicarDe
    ? await supabase
        .from("cenarios")
        .select(
          "meta_receita_mensal, meta_cac, meta_ltv, meta_margem_bruta_pct, meta_tir_pct, modelo_plano, pct_vendas_combo, pesos_receita",
        )
        .eq("id", duplicarDe)
        .single()
    : { data: null };

  const { data: novoCenario, error } = await supabase
    .from("cenarios")
    .insert({
      nome,
      descricao,
      status: "rascunho",
      is_base: false,
      cenario_origem_id: duplicarDe,
      created_by: user?.id ?? null,
      data_inicio: `${mesInicio}-01`,
      data_fim: `${mesFim}-01`,
      meta_receita_mensal: origem?.meta_receita_mensal ?? null,
      meta_cac: origem?.meta_cac ?? null,
      meta_ltv: origem?.meta_ltv ?? null,
      meta_margem_bruta_pct: origem?.meta_margem_bruta_pct ?? null,
      meta_tir_pct: origem?.meta_tir_pct ?? null,
      // Modelo de planejamento vem junto: espelho de um cenário pela receita também é pela receita.
      modelo_plano: origem?.modelo_plano ?? "trimestral",
      pct_vendas_combo: origem?.pct_vendas_combo ?? null,
    })
    .select("id")
    .single();

  if (error || !novoCenario) {
    return { error: "Não foi possível criar o cenário." };
  }

  if (programaIds.length > 0) {
    await supabase
      .from("cenario_programas")
      .insert(
        programaIds.map((programa_id) => ({
          cenario_id: novoCenario.id,
          programa_id,
        })),
      );
  }

  const falhas: string[] = [];
  if (duplicarDe) {
    const mapProdutoId = await clonarCenario(
      supabase,
      duplicarDe,
      novoCenario.id,
      falhas,
    );
    await copiarConfiguracoesDeCenario(
      supabase,
      duplicarDe,
      novoCenario.id,
      mapProdutoId,
    );

    // Plano pela receita: pesos por produto e metas de receita por ano.
    const trocarIds = (obj: unknown) =>
      obj && typeof obj === "object"
        ? Object.fromEntries(
            Object.entries(obj as Record<string, number>).map(([k, v]) => [
              mapProdutoId(k) ?? k,
              v,
            ]),
          )
        : null;
    if (origem?.pesos_receita)
      await supabase
        .from("cenarios")
        .update({ pesos_receita: trocarIds(origem.pesos_receita) })
        .eq("id", novoCenario.id);
    const { data: metasOrigem } = await supabase
      .from("cenario_meta_receita")
      .select("ano, crescimento_pct, metas_produto")
      .eq("cenario_id", duplicarDe);
    if (metasOrigem && metasOrigem.length > 0)
      await supabase.from("cenario_meta_receita").insert(
        metasOrigem.map((m) => ({
          cenario_id: novoCenario.id,
          ano: m.ano,
          crescimento_pct: m.crescimento_pct,
          metas_produto: trocarIds(m.metas_produto),
        })),
      );

    // Abertura do cenário = base de clientes que a origem tinha no mês anterior ao início escolhido.
    const ponto = await capturarPontoPartida(
      supabase,
      duplicarDe,
      `${mesInicio}-01`,
      (id) => mapProdutoId(id) ?? id,
    );
    if (ponto)
      await supabase
        .from("cenarios")
        .update({ ponto_partida: ponto })
        .eq("id", novoCenario.id);

    // Sem recalcular, o cenário novo abria sem projeção nenhuma (ou com a de outro momento).
    const { falhas: falhasCalculo } = await recalcularTodosProdutos(
      novoCenario.id,
    );
    falhas.push(...falhasCalculo.map((f) => `projeção de ${f}`));
  }

  revalidatePath("/cenarios");
  if (programaIds.length > 0) revalidatePath("/fomento");
  if (falhas.length > 0) {
    return {
      error: `Cenário "${nome}" criado, mas algumas partes não foram copiadas: ${falhas.join("; ")}. Abra o cenário e use "Completar cópia".`,
    };
  }
  redirect(`/produtos?cenario=${novoCenario.id}`);
}

/**
 * Copia tudo o que vive na FASE ou no CENÁRIO de origem para o destino. Cada tabela é copiada com
 * todas as colunas (select *), trocando só os vínculos (cenário, produto, fase, plano, módulo) —
 * assim uma coluna nova nunca mais fica de fora da cópia (foi o que fez os níveis do Fashion Mind
 * não virem: a cópia listava colunas à mão e não levava a data de disponibilidade).
 * Devolve o mapa de produto (exclusivos da origem viram cópias novas).
 */
async function clonarCenario(
  supabase: Supabase,
  origemId: string,
  destinoId: string,
  falhas: string[],
): Promise<(id: string | null) => string | null> {
  const inserirVarios = async (
    tabela: string,
    linhas: Row[],
    rotulo: string,
  ) => {
    if (linhas.length === 0) return;
    const { error } = await supabase.from(tabela).insert(linhas);
    if (error) falhas.push(rotulo);
  };

  // Produtos exclusivos do cenário de origem (cenario_id preenchido) viram cópias novas, com id
  // próprio, presas ao cenário novo. Produtos globais (cenario_id nulo) continuam compartilhados.
  const { data: produtosCenarioOrigem } = await supabase
    .from("produtos")
    .select("*")
    .eq("cenario_id", origemId);
  const produtoIdMap = new Map<string, string>();
  for (const p of (produtosCenarioOrigem ?? []) as Row[]) {
    const { data: novoProduto } = await supabase
      .from("produtos")
      .insert({ ...semColunasDeSistema(p), cenario_id: destinoId })
      .select("id")
      .single();
    if (novoProduto) produtoIdMap.set(p.id, novoProduto.id);
    else falhas.push(`produto ${p.nome}`);
  }
  const mapProdutoId = (id: string | null) =>
    id ? (produtoIdMap.get(id) ?? id) : id;

  // Fases + tudo que pendura nelas (funil, custos da fase, equipe, trimestres de crescimento/churn).
  const { data: fasesOrigem } = await supabase
    .from("fases_produto")
    .select("*")
    .eq("cenario_id", origemId);
  for (const fase of (fasesOrigem ?? []) as Row[]) {
    const { data: novaFase } = await supabase
      .from("fases_produto")
      .insert({
        ...semColunasDeSistema(fase),
        produto_id: mapProdutoId(fase.produto_id),
        cenario_id: destinoId,
      })
      .select("id")
      .single();
    if (!novaFase) {
      falhas.push(`fase ${fase.fase}`);
      continue;
    }
    const filhas = [
      "premissas_funil",
      "plano_custos_fixos",
      "plano_custos_variaveis",
      "equipe_alocada",
      "fases_trimestres",
    ];
    const resultados = await Promise.all(
      filhas.map((t) =>
        supabase.from(t).select("*").eq("fase_produto_id", fase.id),
      ),
    );
    for (const [i, tabela] of filhas.entries()) {
      const linhas = ((resultados[i].data ?? []) as Row[]).map((r) => ({
        ...semColunasDeSistema(r),
        fase_produto_id: novaFase.id,
      }));
      await inserirVarios(
        tabela,
        linhas,
        `${tabela.replace(/_/g, " ")} (${fase.fase})`,
      );
    }
  }

  // Tabelas presas direto ao cenário, sem filhas. `produto_cenario` é a seleção de quais produtos
  // o cenário simula — sem ela o clone nasce vazio (aconteceu com o FUNSES - Pessimista).
  for (const tabela of [
    "produto_cenario",
    "contratacoes",
    "beta_testers_config",
    "alocacao_modelo_contratacao",
    "alocacao_investimento",
    // A observação de planejamento por cargo vai junto: um cenário copiado sem ela perde o porquê
    // da alocação e só leva o número.
    "notas_cargo_cenario",
  ]) {
    const { data } = await supabase
      .from(tabela)
      .select("*")
      .eq("cenario_id", origemId);
    const linhas = ((data ?? []) as Row[]).map((r) => ({
      ...semColunasDeSistema(r),
      cenario_id: destinoId,
      ...("produto_id" in r ? { produto_id: mapProdutoId(r.produto_id) } : {}),
      ...(Array.isArray(r.produto_ids)
        ? {
            produto_ids: (r.produto_ids as string[]).map((id) =>
              mapProdutoId(id),
            ),
          }
        : {}),
    }));
    await inserirVarios(tabela, linhas, tabela.replace(/_/g, " "));
  }

  const { data: custosEmpresaOrigem } = await supabase
    .from("custos_empresa")
    .select("*")
    .eq("cenario_id", origemId);
  await inserirVarios(
    "custos_empresa",
    ((custosEmpresaOrigem ?? []) as Row[]).map((c) => {
      const parametros = c.parametros ? { ...c.parametros } : c.parametros;
      if (parametros?.produto_referencia_id)
        parametros.produto_referencia_id = mapProdutoId(
          parametros.produto_referencia_id,
        );
      return { ...semColunasDeSistema(c), cenario_id: destinoId, parametros };
    }),
    "custos da empresa",
  );

  // Planos de preço (+ preço por fase) e módulos/níveis (+ beta testers do módulo).
  const { data: planosOrigem } = await supabase
    .from("planos_precificacao")
    .select("*")
    .eq("cenario_id", origemId);
  for (const plano of (planosOrigem ?? []) as Row[]) {
    const { data: novoPlano } = await supabase
      .from("planos_precificacao")
      .insert({
        ...semColunasDeSistema(plano),
        produto_id: mapProdutoId(plano.produto_id),
        cenario_id: destinoId,
      })
      .select("id")
      .single();
    if (!novoPlano) {
      falhas.push(`plano ${plano.nome_plano ?? plano.tipo_cobranca}`);
      continue;
    }
    const { data: precosFase } = await supabase
      .from("planos_precificacao_fases")
      .select("*")
      .eq("plano_id", plano.id);
    await inserirVarios(
      "planos_precificacao_fases",
      ((precosFase ?? []) as Row[]).map((pf) => ({
        ...semColunasDeSistema(pf),
        plano_id: novoPlano.id,
      })),
      "preço por fase",
    );
  }

  await clonarModulos(supabase, origemId, destinoId, mapProdutoId, falhas);

  return mapProdutoId;
}

/** Módulos/níveis de uma lista de produtos (ou de todos), com os beta testers de cada módulo. */
async function clonarModulos(
  supabase: Supabase,
  origemId: string,
  destinoId: string,
  mapProdutoId: (id: string | null) => string | null,
  falhas: string[],
  somenteProdutos?: Set<string>,
) {
  const { data: modulosOrigem } = await supabase
    .from("modulos_produto")
    .select("*")
    .eq("cenario_id", origemId);
  for (const modulo of (modulosOrigem ?? []) as Row[]) {
    if (somenteProdutos && !somenteProdutos.has(modulo.produto_id)) continue;
    const { data: novoModulo } = await supabase
      .from("modulos_produto")
      .insert({
        ...semColunasDeSistema(modulo),
        produto_id: mapProdutoId(modulo.produto_id),
        cenario_id: destinoId,
      })
      .select("id")
      .single();
    if (!novoModulo) {
      falhas.push(`módulo ${modulo.nome}`);
      continue;
    }
    const { data: betas } = await supabase
      .from("beta_testers_modulo")
      .select("*")
      .eq("modulo_id", modulo.id);
    const linhas = ((betas ?? []) as Row[]).map((b) => ({
      ...semColunasDeSistema(b),
      modulo_id: novoModulo.id,
    }));
    if (linhas.length > 0) {
      const { error } = await supabase
        .from("beta_testers_modulo")
        .insert(linhas);
      if (error) falhas.push(`beta testers do módulo ${modulo.nome}`);
    }
  }
}

/**
 * Copia o que vive no CENÁRIO (não na fase): canais de aquisição com matriz e parceiros, regras
 * de COGS, feiras e eventos e etapas de implementação. Separado pra poder completar um clone feito antes destas
 * tabelas existirem — nunca sobrescreve o que o destino já tem.
 */
export async function copiarConfiguracoesDeCenario(
  supabase: Supabase,
  origemId: string,
  destinoId: string,
  mapProdutoId: (id: string | null) => string | null = (id) => id,
) {
  // Canais (empresa) + matriz produto × canal + parceiros por fase
  const { data: canaisDestino } = await supabase
    .from("canais_aquisicao")
    .select("id")
    .eq("cenario_id", destinoId);
  if (!canaisDestino || canaisDestino.length === 0) {
    const { data: canaisOrigem } = await supabase
      .from("canais_aquisicao")
      .select("*")
      .eq("cenario_id", origemId);
    for (const c of (canaisOrigem ?? []) as Row[]) {
      const { data: novo } = await supabase
        .from("canais_aquisicao")
        .insert({ ...semColunasDeSistema(c), cenario_id: destinoId })
        .select("id")
        .single();
      if (!novo) continue;
      const [{ data: matriz }, { data: parceiros }] = await Promise.all([
        supabase.from("canal_produto").select("*").eq("canal_id", c.id),
        supabase.from("canal_parceiros_fase").select("*").eq("canal_id", c.id),
      ]);
      if (matriz && matriz.length > 0) {
        await supabase
          .from("canal_produto")
          .insert(
            (matriz as Row[]).map((m) => ({
              ...semColunasDeSistema(m),
              canal_id: novo.id,
              produto_id: mapProdutoId(m.produto_id),
            })),
          );
      }
      if (parceiros && parceiros.length > 0) {
        await supabase
          .from("canal_parceiros_fase")
          .insert(
            (parceiros as Row[]).map((p) => ({
              ...semColunasDeSistema(p),
              canal_id: novo.id,
            })),
          );
      }
    }
  }

  // Regras de COGS por produto
  const { data: cogsDestino } = await supabase
    .from("cogs_premissas")
    .select("id")
    .eq("cenario_id", destinoId);
  if (!cogsDestino || cogsDestino.length === 0) {
    const { data: cogsOrigem } = await supabase
      .from("cogs_premissas")
      .select("*")
      .eq("cenario_id", origemId);
    if (cogsOrigem && cogsOrigem.length > 0) {
      await supabase
        .from("cogs_premissas")
        .insert(
          (cogsOrigem as Row[]).map((c) => ({
            ...semColunasDeSistema(c),
            produto_id: mapProdutoId(c.produto_id),
            cenario_id: destinoId,
          })),
        );
    }
  }

  // Feiras e eventos (o retorno aponta pra produtos — remapeia os exclusivos do cenário de origem)
  const { data: acoesDestino } = await supabase
    .from("acoes_marketing")
    .select("id")
    .eq("cenario_id", destinoId)
    .limit(1);
  if (!acoesDestino || acoesDestino.length === 0) {
    const { data: acoesOrigem } = await supabase
      .from("acoes_marketing")
      .select("*")
      .eq("cenario_id", origemId);
    if (acoesOrigem && acoesOrigem.length > 0) {
      await supabase.from("acoes_marketing").insert(
        (acoesOrigem as Row[]).map((a) => ({
          ...semColunasDeSistema(a),
          cenario_id: destinoId,
          retorno: ((a.retorno ?? []) as Row[]).map((r) => ({
            ...r,
            produto_id: mapProdutoId(r.produto_id),
          })),
        })),
      );
    }
  }

  // Tração antes do produto (consultoria) — vai junto, inclusive o "entra na DRE".
  const { data: receitasDestino } = await supabase
    .from("receitas_historicas")
    .select("id")
    .eq("cenario_id", destinoId);
  if (!receitasDestino || receitasDestino.length === 0) {
    const { data: receitasOrigem } = await supabase
      .from("receitas_historicas")
      .select("*")
      .eq("cenario_id", origemId);
    if (receitasOrigem && receitasOrigem.length > 0) {
      await supabase
        .from("receitas_historicas")
        .insert(
          (receitasOrigem as Row[]).map((r) => ({
            ...semColunasDeSistema(r),
            cenario_id: destinoId,
          })),
        );
    }
  }

  // Etapas de implementação
  const { data: etapasDestino } = await supabase
    .from("implementacao_etapas")
    .select("id")
    .eq("cenario_id", destinoId);
  if (!etapasDestino || etapasDestino.length === 0) {
    const { data: etapasOrigem } = await supabase
      .from("implementacao_etapas")
      .select("*")
      .eq("cenario_id", origemId);
    if (etapasOrigem && etapasOrigem.length > 0) {
      await supabase
        .from("implementacao_etapas")
        .insert(
          (etapasOrigem as Row[]).map((e) => ({
            ...semColunasDeSistema(e),
            produto_id: mapProdutoId(e.produto_id),
            cenario_id: destinoId,
          })),
        );
    }
  }

  // Trimestres das fases (pra clones feitos antes de existirem) — casa fase a fase por produto+fase
  const [{ data: fasesOrigem }, { data: fasesDestino }] = await Promise.all([
    supabase
      .from("fases_produto")
      .select("id, produto_id, fase")
      .eq("cenario_id", origemId),
    supabase
      .from("fases_produto")
      .select("id, produto_id, fase")
      .eq("cenario_id", destinoId),
  ]);
  const destinoPorChave = new Map(
    (fasesDestino ?? []).map((f) => [`${f.produto_id}__${f.fase}`, f.id]),
  );
  for (const fo of fasesOrigem ?? []) {
    const destinoId2 = destinoPorChave.get(
      `${mapProdutoId(fo.produto_id)}__${fo.fase}`,
    );
    if (!destinoId2) continue;
    const { data: jaTem } = await supabase
      .from("fases_trimestres")
      .select("id")
      .eq("fase_produto_id", destinoId2)
      .limit(1);
    if (jaTem && jaTem.length > 0) continue;
    const { data: tri } = await supabase
      .from("fases_trimestres")
      .select("indice, taxa_crescimento_mensal, taxa_churn_mensal")
      .eq("fase_produto_id", fo.id);
    if (tri && tri.length > 0)
      await supabase
        .from("fases_trimestres")
        .insert(tri.map((t) => ({ ...t, fase_produto_id: destinoId2 })));
  }
}

/**
 * Completa um cenário espelhado com o que a cópia deixou pra trás — módulos/níveis e planos de
 * produtos que ficaram sem nenhum, premissas de funil em branco, canais, COGS, trimestres, etapas.
 * Só preenche lacunas: nada que já exista no cenário (inclusive o que você editou) é sobrescrito.
 * No fim recalcula a projeção de todos os produtos.
 */
export async function completarCenarioClonado(
  cenarioId: string,
): Promise<{ error: string | null; aviso?: string }> {
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("cenarios")
    .select("id, cenario_origem_id")
    .eq("id", cenarioId)
    .single();
  if (!c?.cenario_origem_id)
    return { error: "Este cenário não foi criado a partir de outro." };
  const origemId = c.cenario_origem_id as string;

  // Produtos exclusivos da origem × cópias no destino casam pelo nome; globais são o mesmo id.
  const [{ data: exclusivosOrigem }, { data: exclusivosDestino }] =
    await Promise.all([
      supabase.from("produtos").select("id, nome").eq("cenario_id", origemId),
      supabase.from("produtos").select("id, nome").eq("cenario_id", cenarioId),
    ]);
  const destinoPorNome = new Map(
    (exclusivosDestino ?? []).map((p) => [p.nome, p.id]),
  );
  const produtoIdMap = new Map<string, string>();
  for (const p of exclusivosOrigem ?? []) {
    const d = destinoPorNome.get(p.nome);
    if (d) produtoIdMap.set(p.id, d);
  }
  const mapProdutoId = (id: string | null) =>
    id ? (produtoIdMap.get(id) ?? id) : id;

  const falhas: string[] = [];

  // Módulos/níveis e planos: copia pros produtos que ficaram sem nenhum no destino.
  const [
    { data: modulosOrigem },
    { data: modulosDestino },
    { data: planosOrigem },
    { data: planosDestino },
  ] = await Promise.all([
    supabase
      .from("modulos_produto")
      .select("produto_id")
      .eq("cenario_id", origemId),
    supabase
      .from("modulos_produto")
      .select("produto_id")
      .eq("cenario_id", cenarioId),
    supabase.from("planos_precificacao").select("*").eq("cenario_id", origemId),
    supabase
      .from("planos_precificacao")
      .select("produto_id")
      .eq("cenario_id", cenarioId),
  ]);
  const comModuloNoDestino = new Set(
    (modulosDestino ?? []).map((m) => m.produto_id),
  );
  const produtosSemModulo = new Set(
    (modulosOrigem ?? [])
      .map((m) => m.produto_id as string)
      .filter((pid) => !comModuloNoDestino.has(mapProdutoId(pid))),
  );
  if (produtosSemModulo.size > 0)
    await clonarModulos(
      supabase,
      origemId,
      cenarioId,
      mapProdutoId,
      falhas,
      produtosSemModulo,
    );

  const comPlanoNoDestino = new Set(
    (planosDestino ?? []).map((p) => p.produto_id),
  );
  for (const plano of (planosOrigem ?? []) as Row[]) {
    if (comPlanoNoDestino.has(mapProdutoId(plano.produto_id))) continue;
    const { data: novoPlano } = await supabase
      .from("planos_precificacao")
      .insert({
        ...semColunasDeSistema(plano),
        produto_id: mapProdutoId(plano.produto_id),
        cenario_id: cenarioId,
      })
      .select("id")
      .single();
    if (!novoPlano) {
      falhas.push("plano de preço");
      continue;
    }
    const { data: precosFase } = await supabase
      .from("planos_precificacao_fases")
      .select("*")
      .eq("plano_id", plano.id);
    if (precosFase && precosFase.length > 0) {
      await supabase
        .from("planos_precificacao_fases")
        .insert(
          (precosFase as Row[]).map((pf) => ({
            ...semColunasDeSistema(pf),
            plano_id: novoPlano.id,
          })),
        );
    }
  }

  // Premissas de funil: preenche só os campos que estão em branco no destino.
  const [{ data: fasesOrigem }, { data: fasesDestino }] = await Promise.all([
    supabase
      .from("fases_produto")
      .select("id, produto_id, fase")
      .eq("cenario_id", origemId),
    supabase
      .from("fases_produto")
      .select("id, produto_id, fase")
      .eq("cenario_id", cenarioId),
  ]);
  const faseDestinoPorChave = new Map(
    (fasesDestino ?? []).map((f) => [
      `${f.produto_id}__${f.fase}`,
      f.id as string,
    ]),
  );
  for (const fo of fasesOrigem ?? []) {
    const faseDestinoId = faseDestinoPorChave.get(
      `${mapProdutoId(fo.produto_id)}__${fo.fase}`,
    );
    if (!faseDestinoId) continue;
    const [{ data: funilOrigem }, { data: funilDestino }] = await Promise.all([
      supabase
        .from("premissas_funil")
        .select("*")
        .eq("fase_produto_id", fo.id)
        .maybeSingle(),
      supabase
        .from("premissas_funil")
        .select("*")
        .eq("fase_produto_id", faseDestinoId)
        .maybeSingle(),
    ]);
    if (!funilOrigem) continue;
    const dadosOrigem = semColunasDeSistema(funilOrigem as Row);
    delete dadosOrigem.fase_produto_id;
    if (!funilDestino) {
      await supabase
        .from("premissas_funil")
        .insert({ ...dadosOrigem, fase_produto_id: faseDestinoId });
      continue;
    }
    const lacunas: Row = {};
    for (const [k, v] of Object.entries(dadosOrigem)) {
      if (v != null && (funilDestino as Row)[k] == null) lacunas[k] = v;
    }
    if (Object.keys(lacunas).length > 0)
      await supabase
        .from("premissas_funil")
        .update(lacunas)
        .eq("id", (funilDestino as Row).id);
  }

  await copiarConfiguracoesDeCenario(
    supabase,
    origemId,
    cenarioId,
    mapProdutoId,
  );

  const { falhas: falhasCalculo } = await recalcularTodosProdutos(cenarioId);
  falhas.push(...falhasCalculo.map((f) => `projeção de ${f}`));

  revalidatePath("/cenarios");
  revalidatePath(`/plano/${cenarioId}`, "layout");
  return falhas.length > 0
    ? { error: null, aviso: `Completado, exceto: ${falhas.join("; ")}.` }
    : { error: null };
}

/** Refaz a projeção de todos os produtos do cenário com as premissas atuais — botão do hub. */
export async function recalcularCenario(
  cenarioId: string,
): Promise<{ error: string | null }> {
  if (!cenarioId) return { error: "Cenário não identificado." };
  const { falhas } = await recalcularTodosProdutos(cenarioId);
  revalidatePath("/plano", "layout");
  revalidatePath("/relatorios");
  revalidatePath("/contratacoes/necessidade");
  return falhas.length > 0
    ? { error: `Não foi possível recalcular ${falhas.length} produto(s).` }
    : { error: null };
}
