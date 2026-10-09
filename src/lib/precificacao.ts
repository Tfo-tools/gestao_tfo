/**
 * Motor de precificação da plataforma (decisões de 07 e 08/10/2026). Tudo aqui é função pura:
 * (perfil do cliente, catálogo, parâmetros, bases do plano) → custos, preço e margem. A tela de
 * proposta e, depois, a simulação do plano chamam as mesmas funções.
 *
 * Preço da mensalidade = (Σ custos dos componentes + taxa fixa do meio) ÷ (1 − imposto − taxa % − margem)
 * Margem resultante    = 1 − imposto − taxa % − (Σ custos + taxa fixa) ÷ preço com desconto
 *
 * Custos por cliente/mês: uso de banco (volume estimado × R$/GB), rateio do custo fixo da plataforma,
 * suporte como MÉDIA do negócio (horas × custo da hora). Implantação é um pacote fixo por cliente,
 * independente dos módulos; com ERP integrado (Matriz Sistemas) o tempo cai pela redução cadastrada.
 */

import type { TaxaPagamento, MeioPagamento, PrazoPagamento } from "@/lib/taxas-pagamento";
import { taxaPara } from "@/lib/taxas-pagamento";

// ── Tipos ──────────────────────────────────────────────────────────────────────────────────────

export type ParametrosPrecificacao = {
  estimativa: {
    faturamento_por_loja: number; parte_atacado_sobra: number; pecas_por_modelo_cor_ano: number;
    mix_por_loja: number; mix_por_cd: number; mix_ecommerce: number; cds_por_cliente: number;
    pecas_por_linha_atacado: number; pedidos_por_modelo_cor: number; meses_guardados: number; dias_por_mes: number;
    bytes_estoque: number; bytes_venda: number; bytes_pedido: number; bytes_mensal_price: number; bytes_ficha_skills: number;
    insumos_por_modelo_cor: number; fator_sobrecarga: number; outros_gb_por_cliente: number; preco_medio_padrao: number;
  };
  custo_gb: { disco_usd_gb: number; memoria_usd_gb: number; memoria_pct_volume: number; cambio: number };
  /** processamento no banco (consultas e agregações): R$ por GB de dados do cliente ao mês */
  processamento: { reais_por_gb_mes: number };
  /** custo fixo mensal de infraestrutura usado no rateio quando o Base ainda não tem o número */
  custo_fixo_infra_mes: number;
  rateio: { modo: "clientes_previstos" | "fixo"; clientes_fixo: number };
  /** suporte = reativo (fração que abre chamado × horas) + proativo (base + por GB de dados) */
  suporte: { contato_mes_pct: number; horas_por_contato: number; proativo_horas_base: number; proativo_horas_por_gb: number; cargo: string; tipo_contratacao: string; senioridade: string };
  margens: { mensalidade_pct: number; implantacao_pct: number };
  tabela_comercial: { desconto_max_mensalidade_pct: number; desconto_max_implantacao_pct: number };
  implantacao: { prazo_dias: number; reducao_integracao_pct: number; prazos_permitidos: PrazoPagamento[]; margem_fixa_parcela: boolean };
  imposto: { modo: "fixo" | "base"; aliquota_fixa: number };
  plano_pequeno: { ativo: boolean; nome: string; preco_mensal: number; faturamento_max: number; lojas_max: number; usuarios_max: number; modulos: string[]; meios: MeioPagamento[] };
  /** piso de preço por faturamento: cliente grande paga no mínimo isto, mesmo sem canais (lógica de valor) */
  piso_por_faturamento: { ativo: boolean; faturamento_min: number; preco_min: number };
  arredondar_90: boolean;
};

export type Modulo = { id: string; codigo: string; nome: string; descricao: string | null; ordem: number; ativo: boolean; contem_codigo: string | null };
export type Bloco = {
  id: string; modulo_id: string; codigo: string; nome: string; descricao: string | null; peso_pct: number;
  regra_perfil: { remove_se?: string[]; motivo?: string }; adesao_pct: number; ordem: number; ativo: boolean;
  /** processamento extra do bloco (R$/mês): blocos pesados como o orçamento consomem banco além do armazenamento */
  custo_processamento_mes: number;
};

export type PerfilCliente = {
  faturamento_anual: number | null;
  producao_anual_pecas: number | null;
  compra_pronto_pecas: number | null;
  lojas: number;
  atacado: boolean;
  ecommerce: boolean;
  usuarios: number;
  preco_medio: number | null;
  /** sistemas que o cliente já tem */
  tem_erp_qualidade: boolean;
  tem_pcp: boolean;
  tem_plm: boolean;
  /** ERP com conector pronto (Matriz Sistemas): implantação mais curta */
  integracao_pronta: boolean;
};

export type Selecao = {
  modulos: string[]; // códigos
  blocos: string[]; // ids dos blocos ligados (vazio = todos os blocos do módulo)
  plano_pequeno: boolean;
};

export type Pagamento = {
  meio_mensalidade: MeioPagamento;
  /** implantação: null = sem implantação */
  meio_implantacao: MeioPagamento | null;
  prazo_implantacao: PrazoPagamento | null;
};

export type Desconto = { mensalidade_pct: number; implantacao_pct: number; motivo: string };

/** O que vem do plano Base no mês da proposta. */
export type BasesDoPlano = {
  /** custo fixo mensal de infraestrutura (conta 1.1.1) do cenário Base no mês */
  custo_fixo_infra_mes: number;
  /** clientes ativos previstos no cenário Base no mês */
  clientes_previstos_mes: number;
  /** custo da hora do cargo de suporte (tabela de custo/hora) */
  custo_hora_suporte: number;
  /** horas × R$/h das etapas de implantação cadastradas no Base (pacote padrão) */
  custo_implantacao_padrao: number;
  horas_implantacao_padrao: number;
  /** alíquota efetiva do mês (0,06 = 6%) */
  aliquota_imposto: number;
  taxas: TaxaPagamento[];
};

// ── Estimativa de volume (planilha Tabelas_custo_e_taxas_TFO, aba Custos) ─────────────────────

export type Volume = {
  base_estimativa: "Faturamento + peças" | "Faturamento" | "Peças (faturamento estimado)" | "Falta dado";
  pecas_ano: number; faturamento_usado: number; venda_lojas: number; venda_atacado: number; venda_ecommerce: number;
  modelo_cor: number; linhas_estoque_dia: number; linhas_venda_ano: number; linhas_pedido_ano: number;
  gb_mind: number; gb_price_sem_mind: number; gb_skills: number;
};

export function estimarVolume(perfil: PerfilCliente, e: ParametrosPrecificacao["estimativa"]): Volume {
  const precoMedio = perfil.preco_medio && perfil.preco_medio > 0 ? perfil.preco_medio : e.preco_medio_padrao;
  const pecasInformadas = (perfil.producao_anual_pecas ?? 0) + (perfil.compra_pronto_pecas ?? 0);
  const fat = perfil.faturamento_anual ?? 0;
  let base: Volume["base_estimativa"] = "Falta dado";
  if (fat > 0 && pecasInformadas > 0) base = "Faturamento + peças";
  else if (fat > 0) base = "Faturamento";
  else if (pecasInformadas > 0) base = "Peças (faturamento estimado)";
  const pecas_ano = pecasInformadas > 0 ? pecasInformadas : fat / precoMedio;
  const faturamento_usado = fat > 0 ? fat : pecas_ano * precoMedio;

  const venda_lojas = Math.min(perfil.lojas * e.faturamento_por_loja, faturamento_usado);
  const sobra = Math.max(0, faturamento_usado - venda_lojas);
  let venda_atacado = 0, venda_ecommerce = 0;
  if (perfil.atacado && perfil.ecommerce) { venda_atacado = sobra * e.parte_atacado_sobra; venda_ecommerce = sobra - venda_atacado; }
  else if (perfil.atacado) venda_atacado = sobra;
  else if (perfil.ecommerce) venda_ecommerce = sobra;
  else venda_atacado = sobra; // sem canal marcado além das lojas: trata a sobra como atacado

  const modelo_cor = pecas_ano / e.pecas_por_modelo_cor_ano;
  const linhas_estoque_dia = modelo_cor * (perfil.lojas * e.mix_por_loja + e.cds_por_cliente * e.mix_por_cd + (perfil.ecommerce ? e.mix_ecommerce : 0));
  const pecasAtacado = venda_atacado / precoMedio;
  const pecasVarejoEcom = (venda_lojas + venda_ecommerce) / precoMedio;
  const linhas_venda_ano = pecasVarejoEcom + pecasAtacado / e.pecas_por_linha_atacado;
  const linhas_pedido_ano = modelo_cor * e.pedidos_por_modelo_cor;
  const anos = e.meses_guardados / 12;
  const bytesMind = linhas_estoque_dia * e.meses_guardados * e.dias_por_mes * e.bytes_estoque + linhas_venda_ano * anos * e.bytes_venda + linhas_pedido_ano * anos * e.bytes_pedido;
  const gb_mind = (bytesMind * e.fator_sobrecarga) / 1e9 + e.outros_gb_por_cliente;
  // Price sem Mind: cargas mensais agregadas (uma linha por modelo-cor × local por mês) ao longo dos meses guardados.
  const locais = perfil.lojas + e.cds_por_cliente + (perfil.ecommerce ? 1 : 0);
  const gb_price_sem_mind = (modelo_cor * locais * e.meses_guardados * e.bytes_mensal_price * e.fator_sobrecarga) / 1e9 + e.outros_gb_por_cliente;
  // Skills: fichas = modelo-cor × (insumos + o produto), por coleção guardada (meses_guardados/12 anos × ~2 coleções)
  const fichas = modelo_cor * (e.insumos_por_modelo_cor + 1) * anos * 2;
  const gb_skills = (fichas * e.bytes_ficha_skills * e.fator_sobrecarga) / 1e9 + e.outros_gb_por_cliente / 3;
  return { base_estimativa: base, pecas_ano, faturamento_usado, venda_lojas, venda_atacado, venda_ecommerce, modelo_cor, linhas_estoque_dia, linhas_venda_ano, linhas_pedido_ano, gb_mind, gb_price_sem_mind, gb_skills };
}

export function custoPorGb(c: ParametrosPrecificacao["custo_gb"]): number {
  return (c.disco_usd_gb + c.memoria_usd_gb * c.memoria_pct_volume) * c.cambio;
}

// ── Blocos sugeridos pelo perfil ───────────────────────────────────────────────────────────────

export function blocoRemovidoPeloPerfil(b: Bloco, perfil: PerfilCliente): string | null {
  const r = b.regra_perfil?.remove_se ?? [];
  if (r.includes("pcp") && perfil.tem_pcp) return b.regra_perfil.motivo ?? "tem PCP";
  if (r.includes("plm") && perfil.tem_plm) return b.regra_perfil.motivo ?? "tem PLM";
  if (r.includes("erp") && perfil.tem_erp_qualidade) return b.regra_perfil.motivo ?? "tem ERP de qualidade";
  return null;
}

export function perfilCabeNoPlanoPequeno(perfil: PerfilCliente, pp: ParametrosPrecificacao["plano_pequeno"]): boolean {
  if (!pp.ativo) return false;
  const fat = perfil.faturamento_anual ?? 0;
  const okUsuarios = !pp.usuarios_max || perfil.usuarios <= pp.usuarios_max;
  return fat > 0 && fat <= pp.faturamento_max && perfil.lojas <= pp.lojas_max && okUsuarios;
}

// ── Cálculo ────────────────────────────────────────────────────────────────────────────────────

export type LinhaCusto = { componente: string; modulo: string | null; valor: number; detalhe: string; conta: string };

export type ResultadoPreco = {
  volume: Volume;
  custo_gb: number;
  custos: LinhaCusto[];
  custo_total_mes: number;
  taxa_mensalidade: { pct: number; fixo: number; meio: MeioPagamento } | null;
  aliquota: number;
  margem_mensalidade: number;
  /** preço mensal cheio pela fórmula (sem plano fechado) */
  mensalidade_formula: number;
  /** preço por módulo (rateado pelo custo) e por bloco (pelo peso) */
  por_modulo: { codigo: string; nome: string; custo: number; preco: number; blocos: { id: string; nome: string; preco: number; ligado: boolean; removido_por: string | null }[] }[];
  plano_pequeno_aplicado: boolean;
  mensalidade: number;
  mensalidade_com_desconto: number;
  anual: number;
  margem_resultante_mensalidade: number;
  piso_mensalidade: number;
  implantacao: null | {
    horas: number; custo: number; integracao_pronta: boolean; prazo_dias: number;
    taxa: { pct: number; fixo: number; meio: MeioPagamento; prazo: PrazoPagamento } | null;
    preco: number; preco_com_desconto: number; parcelas: number; valor_parcela: number;
    margem_resultante: number; piso: number;
  };
  alertas: string[];
  /** situação do desconto frente à tabela comercial */
  desconto_situacao: "sem_desconto" | "dentro_da_tabela" | "precisa_aprovacao" | "bloqueado";
};

const parcelasDe = (prazo: PrazoPagamento | null) => (prazo === "3x" ? 3 : prazo === "5x" ? 5 : 1);
// Arredonda o preço de lista para cima até terminar em 9, em degraus de 30 (…379, 409, 439…).
const arredNove = (v: number) => (v <= 0 ? 0 : Math.ceil((v - 19) / 30) * 30 + 19);

export function calcularProposta(args: {
  perfil: PerfilCliente; selecao: Selecao; pagamento: Pagamento; desconto: Desconto;
  modulos: Modulo[]; blocos: Bloco[]; params: ParametrosPrecificacao; bases: BasesDoPlano;
}): ResultadoPreco {
  const { perfil, selecao, pagamento, desconto, params, bases } = args;
  const alertas: string[] = [];
  const modulosAtivos = args.modulos.filter((m) => m.ativo);
  // skills_completo contém skills_hc: se os dois estão marcados, vale só o completo
  const codigos = new Set(selecao.modulos);
  for (const m of modulosAtivos) if (m.contem_codigo && codigos.has(m.codigo)) codigos.delete(m.contem_codigo);
  const escolhidos = modulosAtivos.filter((m) => codigos.has(m.codigo)).sort((a, b) => a.ordem - b.ordem);

  const volume = estimarVolume(perfil, params.estimativa);
  if (volume.base_estimativa === "Falta dado") alertas.push("Informe o faturamento anual ou as peças por ano para estimar o uso de banco.");
  const custo_gb = custoPorGb(params.custo_gb);

  // GB por módulo: Mind leva o volume inteiro; Price sem Mind tem o seu; Skills o seu.
  const temMind = codigos.has("mind");
  const gbDoModulo = (codigo: string): number =>
    codigo === "mind" ? volume.gb_mind : codigo === "price" ? (temMind ? 0 : volume.gb_price_sem_mind) : codigo.startsWith("skills") ? volume.gb_skills : 0;
  const proc_gb = params.processamento?.reais_por_gb_mes ?? 0;
  // Bloco pesado (ex.: orçamento) ativo no perfil soma processamento próprio ao custo do módulo.
  const blocoAtivoNaSelecao = (b: Bloco): boolean => {
    const removido = blocoRemovidoPeloPerfil(b, perfil);
    return selecao.blocos.length === 0 ? !removido : selecao.blocos.includes(b.id);
  };
  const custoBlocosDoModulo = (m: Modulo): number =>
    args.blocos.filter((b) => b.modulo_id === m.id && b.ativo && blocoAtivoNaSelecao(b)).reduce((acc, b) => acc + (Number(b.custo_processamento_mes) || 0), 0);
  // Custo DIRETO do módulo = dado (armazenamento) + processamento no banco (ambos crescem com o GB) + blocos pesados.
  const custoDiretoModulo = (codigo: string): number => gbDoModulo(codigo) * (custo_gb + proc_gb);
  const custos: LinhaCusto[] = [];
  let gbUsado = 0;
  for (const m of escolhidos) {
    const gb = gbDoModulo(m.codigo);
    gbUsado += gb;
    custos.push({ componente: "Uso de banco", modulo: m.codigo, valor: gb * custo_gb, detalhe: `${gb.toFixed(2)} GB × R$ ${custo_gb.toFixed(2)}/GB`, conta: "1.1.1" });
    if (proc_gb > 0) custos.push({ componente: "Processamento", modulo: m.codigo, valor: gb * proc_gb, detalhe: `${gb.toFixed(2)} GB × R$ ${proc_gb.toFixed(2)}/GB (consultas e agregações no banco)`, conta: "1.1.1" });
    const cb = custoBlocosDoModulo(m);
    if (cb > 0) custos.push({ componente: "Processamento de blocos", modulo: m.codigo, valor: cb, detalhe: "blocos pesados ativos (ex.: orçamento)", conta: "1.1.1" });
  }
  // Rateio do custo fixo da plataforma (instância, plano, domínio): uma vez por cliente.
  // Usa o número do Base; se o Base ainda não tem, cai no valor manual dos parâmetros.
  const fixoInfra = bases.custo_fixo_infra_mes > 0 ? bases.custo_fixo_infra_mes : (params.custo_fixo_infra_mes ?? 0);
  const clientesRateio = params.rateio.modo === "fixo" ? params.rateio.clientes_fixo : bases.clientes_previstos_mes;
  const rateio = fixoInfra > 0 && clientesRateio > 0 ? fixoInfra / clientesRateio : 0;
  custos.push({ componente: "Plataforma (rateio)", modulo: null, valor: rateio, detalhe: fixoInfra > 0 ? `R$ ${fixoInfra.toFixed(2)} ÷ ${clientesRateio} clientes` : "custo fixo zero", conta: "1.1.1" });
  // Suporte como DEMANDA por cliente: reativo (quem abre chamado × horas) + proativo (monitoramento
  // dos dados, cresce com o volume). Nada por usuário — a pesquisa de nuvem mostrou que dado é o que pesa.
  const hReativo = (params.suporte.contato_mes_pct ?? 0) * (params.suporte.horas_por_contato ?? 0);
  const hProativo = (params.suporte.proativo_horas_base ?? 0) + (params.suporte.proativo_horas_por_gb ?? 0) * gbUsado;
  const horasSuporte = hReativo + hProativo;
  const suporte = horasSuporte * bases.custo_hora_suporte;
  custos.push({ componente: "Suporte (demanda do cliente)", modulo: null, valor: suporte, detalhe: `reativo ${hReativo.toFixed(2)} h + proativo ${hProativo.toFixed(2)} h = ${horasSuporte.toFixed(2)} h × R$ ${bases.custo_hora_suporte.toFixed(2)}/h`, conta: "1.1.3" });
  const custo_total_mes = custos.reduce((s, c) => s + c.valor, 0);

  const tx = taxaPara(bases.taxas, pagamento.meio_mensalidade, "mensal");
  if (!tx) alertas.push(`Sem taxa cadastrada para ${pagamento.meio_mensalidade} na mensalidade.`);
  const taxaPct = tx?.pct ?? 0, taxaFixo = tx?.fixo ?? 0;
  const aliquota = bases.aliquota_imposto;
  const margem = params.margens.mensalidade_pct;
  const divisor = 1 - aliquota - taxaPct - margem;
  if (divisor <= 0) alertas.push("Imposto + taxa + margem passam de 100%: a fórmula não fecha.");
  const mensalidade_formula = divisor > 0 ? (custo_total_mes + taxaFixo) / divisor : 0;

  // Por módulo: preço rateado pelo custo direto de cada um (custos comuns divididos igualmente)
  const custoDireto = new Map(escolhidos.map((m) => [m.codigo, custoDiretoModulo(m.codigo) + custoBlocosDoModulo(m)]));
  const comuns = rateio + suporte;
  const nMod = Math.max(1, escolhidos.length);
  const custoModulo = (codigo: string) => (custoDireto.get(codigo) ?? 0) + comuns / nMod;
  const somaCustoMod = escolhidos.reduce((s, m) => s + custoModulo(m.codigo), 0);
  const blocosDe = (m: Modulo) => args.blocos.filter((b) => b.modulo_id === m.id && b.ativo).sort((a, b) => a.ordem - b.ordem);
  const por_modulo = escolhidos.map((m) => {
    const precoModulo = somaCustoMod > 0 ? mensalidade_formula * (custoModulo(m.codigo) / somaCustoMod) : mensalidade_formula / nMod;
    const bl = blocosDe(m);
    const pesoTotal = bl.reduce((s, b) => s + Number(b.peso_pct), 0) || 1;
    const blocos = bl.map((b) => {
      const removido = blocoRemovidoPeloPerfil(b, perfil);
      const ligado = selecao.blocos.length === 0 ? !removido : selecao.blocos.includes(b.id);
      return { id: b.id, nome: b.nome, preco: precoModulo * (Number(b.peso_pct) / pesoTotal), ligado, removido_por: removido };
    });
    const fator = bl.length === 0 ? 1 : blocos.filter((b) => b.ligado).reduce((s, b) => s + b.preco, 0) / (precoModulo || 1);
    return { codigo: m.codigo, nome: m.nome, custo: custoModulo(m.codigo), preco: precoModulo * (bl.length === 0 ? 1 : fator), blocos };
  });
  let mensalidade = por_modulo.reduce((s, m) => s + m.preco, 0);

  // Plano fechado para marca pequena: preço fixo, sem desconto
  const pp = params.plano_pequeno;
  const cabe = perfilCabeNoPlanoPequeno(perfil, pp);
  const selecaoIgualAoPlano = pp.modulos.every((c) => codigos.has(c)) && [...codigos].every((c) => pp.modulos.includes(c));
  const plano_pequeno_aplicado = cabe && selecao.plano_pequeno && selecaoIgualAoPlano;
  if (plano_pequeno_aplicado) mensalidade = pp.preco_mensal;
  if (cabe && !selecao.plano_pequeno && selecaoIgualAoPlano) alertas.push(`Este perfil cabe no plano fechado ${pp.nome} (R$ ${pp.preco_mensal.toFixed(2)}).`);
  if (params.arredondar_90 && !plano_pequeno_aplicado) mensalidade = arredNove(mensalidade);
  // Piso de preço por faturamento: cliente acima do faturamento mínimo paga pelo menos o preço mínimo,
  // mesmo que o volume de dados seja baixo (ex.: atacado sem lojas). Lógica de valor, não de custo.
  const pf = params.piso_por_faturamento;
  if (pf?.ativo && !plano_pequeno_aplicado && (perfil.faturamento_anual ?? 0) >= pf.faturamento_min && mensalidade < pf.preco_min) mensalidade = pf.preco_min;

  const descMensal = plano_pequeno_aplicado ? 0 : Math.max(0, Math.min(1, desconto.mensalidade_pct || 0));
  const mensalidade_com_desconto = mensalidade * (1 - descMensal);
  const margem_resultante_mensalidade = mensalidade_com_desconto > 0 ? 1 - aliquota - taxaPct - (custo_total_mes + taxaFixo) / mensalidade_com_desconto : 0;
  const piso_mensalidade = 1 - aliquota - taxaPct > 0 ? (custo_total_mes + taxaFixo) / (1 - aliquota - taxaPct) : 0;

  // Implantação: pacote fixo; integração pronta reduz as horas
  let implantacao: ResultadoPreco["implantacao"] = null;
  if (pagamento.meio_implantacao && pagamento.prazo_implantacao && bases.horas_implantacao_padrao > 0) {
    const fator = perfil.integracao_pronta ? 1 - params.implantacao.reducao_integracao_pct : 1;
    const horas = bases.horas_implantacao_padrao * fator;
    const custo = bases.custo_implantacao_padrao * fator;
    const txi = taxaPara(bases.taxas, pagamento.meio_implantacao, pagamento.prazo_implantacao);
    if (!txi) alertas.push(`Sem taxa cadastrada para ${pagamento.meio_implantacao} ${pagamento.prazo_implantacao} na implantação.`);
    const parcelas = parcelasDe(pagamento.prazo_implantacao);
    const fixoTotal = (txi?.fixo ?? 0) * parcelas; // boleto/pix cobram por parcela paga
    const pctI = txi?.pct ?? 0;
    const divI = 1 - aliquota - pctI - params.margens.implantacao_pct;
    const preco = divI > 0 ? (custo + fixoTotal) / divI : 0;
    const descI = Math.max(0, Math.min(1, desconto.implantacao_pct || 0));
    const preco_com_desconto = preco * (1 - descI);
    implantacao = {
      horas, custo, integracao_pronta: perfil.integracao_pronta,
      prazo_dias: Math.round(params.implantacao.prazo_dias * fator),
      taxa: txi ? { pct: txi.pct, fixo: txi.fixo, meio: pagamento.meio_implantacao, prazo: pagamento.prazo_implantacao } : null,
      preco, preco_com_desconto, parcelas, valor_parcela: preco_com_desconto / parcelas,
      margem_resultante: preco_com_desconto > 0 ? 1 - aliquota - pctI - (custo + fixoTotal) / preco_com_desconto : 0,
      piso: 1 - aliquota - pctI > 0 ? (custo + fixoTotal) / (1 - aliquota - pctI) : 0,
    };
  }

  // Situação do desconto frente à tabela comercial
  let desconto_situacao: ResultadoPreco["desconto_situacao"] = "sem_desconto";
  const dI = implantacao ? Math.max(0, desconto.implantacao_pct || 0) : 0;
  if (descMensal > 0 || dI > 0) {
    const abaixoPiso = mensalidade_com_desconto < piso_mensalidade - 0.005 || (implantacao ? implantacao.preco_com_desconto < implantacao.piso - 0.005 : false);
    if (abaixoPiso) desconto_situacao = "bloqueado";
    else if (descMensal <= params.tabela_comercial.desconto_max_mensalidade_pct + 1e-9 && dI <= params.tabela_comercial.desconto_max_implantacao_pct + 1e-9) desconto_situacao = "dentro_da_tabela";
    else desconto_situacao = "precisa_aprovacao";
  }

  return {
    volume, custo_gb, custos, custo_total_mes,
    taxa_mensalidade: tx ? { pct: tx.pct, fixo: tx.fixo, meio: pagamento.meio_mensalidade } : null,
    aliquota, margem_mensalidade: margem, mensalidade_formula, por_modulo, plano_pequeno_aplicado,
    mensalidade, mensalidade_com_desconto, anual: mensalidade_com_desconto * 12,
    margem_resultante_mensalidade, piso_mensalidade, implantacao, alertas, desconto_situacao,
  };
}

export const PERFIL_VAZIO: PerfilCliente = {
  faturamento_anual: null, producao_anual_pecas: null, compra_pronto_pecas: null, lojas: 0, atacado: true, ecommerce: false,
  usuarios: 1, preco_medio: null, tem_erp_qualidade: false, tem_pcp: false, tem_plm: false, integracao_pronta: false,
};
