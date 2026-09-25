/**
 * Simulação a partir do FUNSES 1: recalibra um cenário como fração do FUNSES 1 (MRR mês a mês),
 * com churn fixo, e aplica a regra de vendedor (PJ proporcional até 1,4 de necessidade; a partir
 * de 1,5 entra 1 CLT, 2,5 o segundo, 3,5 o terceiro…). O FUNSES 1 é só lido — nunca alterado.
 *
 * Roda com a sessão de quem clicou (RLS), a partir da tela Cenários → Simulações.
 */
import { calcularSimulacao } from "@/lib/simulacao";
import { montarEntradaSimulacao, simularProduto } from "@/lib/simulacao-produto";
import { calibrarCrescimento, churnMensalParaAnual, FASES_PLANO, type FasePlanoReceita } from "@/lib/plano-receita";
import { fasesDoMotor, mesesComFase, horizonte, type FaseLinha } from "@/lib/plano-receita-cenario";
import { idsDoCenario, produtosDoCenario } from "@/lib/fases-produto";
import {
  calcularDemandaPorCargo,
  type CanalFunilInput,
  type FaseProdutoInput,
  type FunilPremissaInput,
  type SimulacaoMesInput,
} from "@/lib/necessidade-contratacao";
import { horasAtendimentoPorProduto, horasCsProativoPorProduto } from "@/lib/cogs";
import type { FaseValue } from "@/lib/fases";

const MODELO_PJ_SOB_DEMANDA = "821a6825-0905-4178-a67c-1d3fe2b045b0"; // "PJ - Sob demanda" (cobra pessoa inteira — sai da alocação)
// PJ variável de verdade: paga a fração de pessoa que a demanda pede (sem arredondar pra cima).
const MODELO_PJ_VARIAVEL_NOME = "Vendedor PJ — variável (proporcional à demanda)";
const MODELO_CLT = "96a512a7-b9d5-417c-a57a-bad95d89d308"; // "Vendedor pleno — CLT + comissão"
const INICIO_REGRA_VENDEDOR = "2027-12-01"; // depois das sócias (set/26–nov/27), que ficam como estão

export type ConfigSimulacao = { nome: string; indice: number; churnMensal: number };

export const SIMULACOES_PADRAO: ConfigSimulacao[] = [
  { nome: "Base", indice: 0.7, churnMensal: 0.031 },
  { nome: "FUNSES - Pessimista", indice: 0.5, churnMensal: 0.039 },
];
const mesIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const proximoMes = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return mesIso(new Date(d.getFullYear(), d.getMonth() + 1, 1));
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executarSimulacaoCenarios(admin: any, CENARIOS: ConfigSimulacao[]): Promise<{ log: string[]; backup: unknown }> {
  const log: string[] = [];
  const escrever = (s: string) => log.push(s);
  if (CENARIOS.some((c) => /^FUNSES 1( - Otimista)?$/.test(c.nome))) throw new Error("FUNSES 1 e FUNSES 1 - Otimista não podem ser alterados.");
  const { data: f1 } = await admin.from("cenarios").select("id, nome").eq("nome", "FUNSES 1").single();
  if (!f1) throw new Error("FUNSES 1 não encontrado");
  const { data: f1Sim } = await admin.from("simulacao_mensal").select("produto_id, mes_referencia, mrr").eq("cenario_id", f1.id);
  const f1Por = new Map<string, Map<string, number>>();
  for (const r of f1Sim ?? []) {
    const m = f1Por.get(r.produto_id) ?? new Map<string, number>();
    m.set(r.mes_referencia, Number(r.mrr ?? 0));
    f1Por.set(r.produto_id, m);
  }

  // Cópia de segurança do que vai ser alterado (fases e alocações dos dois cenários).
  const nomes = CENARIOS.map((c) => c.nome);
  const { data: cenIds } = await admin.from("cenarios").select("id, nome").in("nome", nomes);
  const ids = (cenIds ?? []).map((c: { id: string }) => c.id);
  const [{ data: bkFases }, { data: bkAloc }] = await Promise.all([
    admin.from("fases_produto").select("*").in("cenario_id", ids),
    admin.from("alocacao_modelo_contratacao").select("*").in("cenario_id", ids),
  ]);
  const backup = { cenarios: cenIds, fases_produto: bkFases, alocacoes: bkAloc };
  const { error: erroBackup } = await admin.from("simulacoes_backup").insert({ descricao: CENARIOS.map((c) => `${c.nome} ${c.indice}× churn ${c.churnMensal}`).join(" | "), conteudo: backup });
  if (erroBackup) throw new Error(`Não consegui guardar a cópia de segurança: ${erroBackup.message}`);

  for (const cfg of CENARIOS) {
    const { data: cen } = await admin
      .from("cenarios")
      .select("id, nome, data_inicio, data_fim, pct_vendas_combo, modelo_plano")
      .eq("nome", cfg.nome)
      .single();
    if (!cen) throw new Error(`${cfg.nome} não encontrado`);
    const fim = `${String(cen.data_fim).slice(0, 7)}-01`;
    escrever(`\n=== ${cen.nome} — índice ${cfg.indice} × FUNSES 1, churn ${(cfg.churnMensal * 100).toFixed(1)}% a.m. ===`);

    const { data: curSim } = await admin.from("simulacao_mensal").select("produto_id, mes_referencia, mrr").eq("cenario_id", cen.id);
    const curPor = new Map<string, Map<string, number>>();
    for (const r of curSim ?? []) {
      const m = curPor.get(r.produto_id) ?? new Map<string, number>();
      m.set(r.mes_referencia, Number(r.mrr ?? 0));
      curPor.set(r.produto_id, m);
    }

    const produtos = await produtosDoCenario(admin, cen.id);
    for (const p of produtos) {
      const { data: linhas } = await admin
        .from("fases_produto")
        .select(
          "fase, taxa_crescimento_mensal, taxa_churn_mensal, plano_cresc_inicio, plano_cresc_alvo, plano_churn_inicio, plano_churn_alvo, fases_trimestres(indice, taxa_crescimento_mensal, taxa_churn_mensal)",
        )
        .eq("cenario_id", cen.id)
        .eq("produto_id", p.id);
      const motor = fasesDoMotor((linhas ?? []) as FaseLinha[], p.fases);
      const meses = mesesComFase(motor, horizonte(motor, fim));

      // Churn fixo em todas as fases (maturidade guarda ao ano).
      const base: FasePlanoReceita[] = FASES_PLANO.map((f) => ({
        fase: f.value,
        cresc_inicio: null,
        cresc_alvo: null,
        churn_inicio: f.value === "maturidade" ? null : cfg.churnMensal,
        churn_alvo: f.value === "maturidade" ? churnMensalParaAnual(cfg.churnMensal) : cfg.churnMensal,
      }));

      // Alvo: índice × MRR do FUNSES 1, mês a mês; depois do fim do FUNSES 1, segue o formato
      // atual deste cenário (o FUNSES 1 termina em 2030; Base e Pessimista vão até 2032).
      const f1P = f1Por.get(p.id) ?? new Map<string, number>();
      const curP = curPor.get(p.id) ?? new Map<string, number>();
      const ultimoF1 = [...f1P.entries()].filter(([, v]) => v > 0).map(([m]) => m).sort().at(-1);
      const mrrAlvo = new Map<string, number>();
      for (const { mes } of meses) {
        if (mes > fim) continue;
        let alvo: number | null = null;
        if (f1P.has(mes)) alvo = cfg.indice * f1P.get(mes)!;
        else if (ultimoF1 && mes > ultimoF1 && (curP.get(ultimoF1) ?? 0) > 0)
          alvo = cfg.indice * f1P.get(ultimoF1)! * ((curP.get(mes) ?? 0) / curP.get(ultimoF1)!);
        if (alvo != null && alvo > 0) mrrAlvo.set(mes, alvo);
      }

      const { data: prod } = await admin.from("produtos").select("sazonalidade_vendas").eq("id", p.id).single();
      const saz = Array.isArray(prod?.sazonalidade_vendas) ? (prod.sazonalidade_vendas as unknown[]).map(Number) : null;
      const pct = cen.pct_vendas_combo != null ? Number(cen.pct_vendas_combo) : null;
      const entrada = await montarEntradaSimulacao(admin, p.id, cen.id, { fases: base, sazonalidade: saz, pctVendasCombo: pct });
      if (!("input" in entrada)) {
        escrever(`  ${p.nome}: fora do cenário / sem entrada — pulado`);
        continue;
      }
      const calibrado = calibrarCrescimento({
        simular: (fases) => calcularSimulacao({ ...entrada.input, planoReceita: { fases, sazonalidade: saz } }),
        mesesComFase: meses,
        mrrAlvo,
        base,
        fim,
      });
      for (const f of calibrado) {
        const { error } = await admin
          .from("fases_produto")
          .update({
            plano_cresc_inicio: f.cresc_inicio,
            plano_cresc_alvo: f.cresc_alvo,
            plano_churn_inicio: f.churn_inicio,
            plano_churn_alvo: f.churn_alvo,
          })
          .eq("cenario_id", cen.id)
          .eq("produto_id", p.id)
          .eq("fase", f.fase);
        if (error) throw error;
      }
      escrever(`  ${p.nome}: calibrado — ${calibrado.map((f) => `${f.fase} ${f.cresc_alvo != null ? (f.cresc_alvo * 100).toFixed(2) : "—"}%`).join(" · ")}`);
    }

    if (cen.modelo_plano !== "receita") await admin.from("cenarios").update({ modelo_plano: "receita" }).eq("id", cen.id);
    // Metas salvas da seção 1 ficariam inconsistentes com o plano recalibrado — a tela recalcula
    // a partir da projeção quando não há meta gravada.
    await admin.from("cenario_meta_receita").delete().eq("cenario_id", cen.id);

    // Recalcula a projeção (mesmo upsert da action, sem o revalidatePath do Next).
    for (const id of await idsDoCenario(admin, cen.id)) {
      const r = await simularProduto(admin, id, cen.id);
      if ("error" in r) throw new Error(r.error);
      if ("foraDoCenario" in r) {
        await admin.from("simulacao_mensal").delete().eq("produto_id", id).eq("cenario_id", cen.id);
        continue;
      }
      const { error } = await admin.from("simulacao_mensal").upsert(
        r.resultado.map((x) => ({ produto_id: id, cenario_id: cen.id, ...x, calculado_em: new Date().toISOString() })),
        { onConflict: "produto_id,cenario_id,mes_referencia" },
      );
      if (error) throw error;
    }

    // ── Regra do vendedor ────────────────────────────────────────────────────────────────
    const [{ data: fasesRaw }, { data: simRaw }, { data: canaisRaw }, { data: cogsRaw }, { data: modelos }] = await Promise.all([
      admin.from("fases_produto").select("id, produto_id, fase, data_inicio, data_fim").eq("cenario_id", cen.id),
      admin
        .from("simulacao_mensal")
        .select("produto_id, mes_referencia, novos_clientes, clientes_ativos, receita_bruta, novos_direto, novos_representante, novos_associacao, novos_acoes")
        .eq("cenario_id", cen.id),
      admin.from("canais_aquisicao").select("id, tipo_canal, modelo_contratacao_id, canal_produto(produto_id, percentual_mix, taxa_fechamento)").eq("cenario_id", cen.id),
      admin.from("cogs_premissas").select("produto_id, parametros").eq("cenario_id", cen.id),
      admin.from("modelos_contratacao").select("id, parametros"),
    ]);
    const faseIds = (fasesRaw ?? []).map((f: { id: string }) => f.id);
    const { data: funisRaw } = await admin
      .from("premissas_funil")
      .select("fase_produto_id, capacidade_vendedor_mes, span_of_control, horas_suporte_por_cliente_mes, reunioes_por_oportunidade")
      .in("fase_produto_id", faseIds);
    const faseById = new Map((fasesRaw ?? []).map((f: { id: string }) => [f.id, f]));
    const fasesPorProduto: FaseProdutoInput[] = (fasesRaw ?? []).map((f: { produto_id: string; fase: string; data_inicio: string | null; data_fim: string | null }) => ({
      produtoId: f.produto_id,
      fase: f.fase as FaseValue,
      data_inicio: f.data_inicio,
      data_fim: f.data_fim,
    }));
    const funis: FunilPremissaInput[] = (funisRaw ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((f: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fase = faseById.get(f.fase_produto_id) as any;
        if (!fase) return null;
        return {
          produtoId: fase.produto_id,
          fase: fase.fase as FaseValue,
          capacidade_vendedor_mes: f.capacidade_vendedor_mes != null ? Number(f.capacidade_vendedor_mes) : null,
          span_of_control: f.span_of_control != null ? Number(f.span_of_control) : null,
          horas_suporte_por_cliente_mes: f.horas_suporte_por_cliente_mes != null ? Number(f.horas_suporte_por_cliente_mes) : null,
          reunioes_por_oportunidade: f.reunioes_por_oportunidade != null ? Number(f.reunioes_por_oportunidade) : null,
        } as FunilPremissaInput;
      })
      .filter((f: FunilPremissaInput | null): f is FunilPremissaInput => f !== null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const simulacao: SimulacaoMesInput[] = (simRaw ?? []).map((s: any) => ({
      produtoId: s.produto_id,
      mes_referencia: s.mes_referencia,
      novos_clientes: Number(s.novos_clientes),
      clientes_ativos: Number(s.clientes_ativos),
      novos_direto: s.novos_direto != null ? Number(s.novos_direto) : undefined,
      novos_representante: s.novos_representante != null ? Number(s.novos_representante) : undefined,
      novos_associacao: s.novos_associacao != null ? Number(s.novos_associacao) : undefined,
      novos_acoes: s.novos_acoes != null ? Number(s.novos_acoes) : undefined,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qualif = new Map((modelos ?? []).map((m: any) => [m.id, m.parametros?.taxa_qualificacao ?? null]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canais: CanalFunilInput[] = (canaisRaw ?? []).flatMap((c: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c.canal_produto ?? []).map((cp: any) => ({
        produtoId: cp.produto_id,
        tipo_canal: c.tipo_canal,
        percentual_mix: Number(cp.percentual_mix),
        taxa_fechamento: cp.taxa_fechamento,
        taxa_qualificacao: c.modelo_contratacao_id ? (qualif.get(c.modelo_contratacao_id) ?? null) : null,
      })),
    );
    const demanda = calcularDemandaPorCargo({
      fasesPorProduto,
      funis,
      canais,
      simulacao,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      horasSuportePorProduto: horasAtendimentoPorProduto((cogsRaw ?? []) as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      horasCsPorProduto: horasCsProativoPorProduto((cogsRaw ?? []) as any),
    });
    const necessidade = new Map<string, number>();
    for (const porMes of Object.values(demanda.porProduto))
      for (const [mes, d] of Object.entries(porMes)) necessidade.set(mes, (necessidade.get(mes) ?? 0) + d.vendedores);

    // 0 = PJ proporcional (até 1,4); n>=1 = n CLT (1,5→1, 2,5→2, 3,5→3…)
    const cltDe = (n: number) => (n < 1.5 ? 0 : Math.floor(n - 0.5));
    let { data: pjVar } = await admin.from("modelos_contratacao").select("id").eq("nome", MODELO_PJ_VARIAVEL_NOME).maybeSingle();
    if (!pjVar) {
      const { data: novoModelo, error } = await admin
        .from("modelos_contratacao")
        .insert({
          cargo: "Vendedor",
          tipo_modelo: "pj",
          categoria: "sm",
          nome: MODELO_PJ_VARIAVEL_NOME,
          ativo: true,
          observacoes: "Mesmos valores do PJ sob demanda (R$ 4.500 por 80 reuniões, 3% + R$ 500 por venda), mas cobrado pela fração de pessoa que a demanda pede — é o vendedor variável do Base e do Pessimista até a necessidade chegar a 1,4.",
          parametros: { valor_mensal: 4500, valor_por_venda: 500, valor_por_ligacao: 0, valor_por_reuniao: 0, ligacoes_maximas_mes: 0, capacidade_unidade_mes: 80, comissao_por_venda_pct: 0.03, custo_estrutura_mensal: 50, fixo_por_pessoa_inteira: false },
        })
        .select("id")
        .single();
      if (error) throw error;
      pjVar = novoModelo;
    }
    const MODELO_PJ_VARIAVEL = pjVar!.id as string;
    await admin.from("alocacao_modelo_contratacao").delete().eq("cenario_id", cen.id).in("modelo_id", [MODELO_PJ_SOB_DEMANDA, MODELO_CLT, MODELO_PJ_VARIAVEL]);
    const faixas: { qtd: number; inicio: string; fim: string }[] = [];
    for (let mes = INICIO_REGRA_VENDEDOR; mes <= fim; mes = proximoMes(mes)) {
      const qtd = cltDe(necessidade.get(mes) ?? 0);
      const ult = faixas.at(-1);
      if (ult && ult.qtd === qtd) ult.fim = mes;
      else faixas.push({ qtd, inicio: mes, fim: mes });
    }
    const fimDoMes = (iso: string) => {
      const [a, m] = iso.slice(0, 7).split("-").map(Number);
      return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    };
    for (const fx of faixas) {
      const { error } = await admin.from("alocacao_modelo_contratacao").insert({
        cenario_id: cen.id,
        cargo: "Vendedor",
        modelo_id: fx.qtd === 0 ? MODELO_PJ_VARIAVEL : MODELO_CLT,
        quantidade: fx.qtd,
        data_inicio: fx.inicio,
        data_fim: fimDoMes(fx.fim),
        produto_ids: null,
        cobertura_modo: "demanda",
        cobertura_pct: null,
      });
      if (error) throw error;
    }
    escrever("  vendedor: " + faixas.map((f) => `${f.inicio.slice(0, 7)}→${f.fim.slice(0, 7)} ${f.qtd === 0 ? "PJ proporcional" : `${f.qtd} CLT`}`).join(" | "));

    // Resumo por dezembro
    const { data: novo } = await admin.from("simulacao_mensal").select("mes_referencia, clientes_ativos, mrr").eq("cenario_id", cen.id);
    const porAno = new Map<string, { cli: number; mrr: number }>();
    for (const r of novo ?? []) {
      if (!String(r.mes_referencia).endsWith("-12-01")) continue;
      const a = String(r.mes_referencia).slice(0, 4);
      const x = porAno.get(a) ?? { cli: 0, mrr: 0 };
      porAno.set(a, { cli: x.cli + Number(r.clientes_ativos ?? 0), mrr: x.mrr + Number(r.mrr ?? 0) });
    }
    for (const [a, x] of [...porAno.entries()].sort()) {
      const f1Mrr = [...f1Por.values()].reduce((s, m) => s + (m.get(`${a}-12-01`) ?? 0), 0);
      escrever(`  dez/${a}: ${Math.round(x.cli)} clientes · MRR ${Math.round(x.mrr)}${f1Mrr > 0 ? ` (${((x.mrr / f1Mrr) * 100).toFixed(1)}% do FUNSES 1)` : ""} · necessidade vendedor ${(necessidade.get(`${a}-12-01`) ?? 0).toFixed(2)}`);
    }
  }
  return { log, backup };
}
