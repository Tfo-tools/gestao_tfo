"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import type { FaseValue } from "@/lib/fases";
import {
  churnAnualParaMensal,
  churnMensalParaAnual,
  crescAnualParaMensal,
  crescMensalParaAnual,
  fatorDoAno,
  sugerirMetas,
  somaPonderada,
} from "@/lib/plano-receita";
import type { DadosPlanoReceita, FaseTela } from "@/lib/plano-receita-cenario";
import {
  previaPlanoReceita,
  salvarPlanoReceita,
  type LinhaPrevia,
  type PayloadPlanoReceita,
} from "./plano-receita-actions";

/**
 * Plano de crescimento e churn — planejado pela receita, por fase de vida do produto.
 * 1. Meta de receita do cenário, distribuída pelos produtos (peso × fase).
 * 2. Por fase: crescimento da receita e churn, em curva (começa onde a fase anterior terminou).
 * 3. Sazonalidade das vendas (do produto).
 * 4. Combo.
 * Cenário importado (modelo trimestral) mostra o plano atual convertido; ao salvar, a prévia vem
 * antes e só então ele passa para o modelo novo.
 */

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const LETRAS = ["j", "f", "m", "a", "m", "j", "j", "a", "s", "o", "n", "d"];
const LABEL_CURTO: Record<string, string> = {
  validacao: "Validação",
  pmf: "PMF",
  tracao: "Tração",
  escala: "Escala",
  maturidade: "Maturidade",
  ideacao: "Ideação",
};

const pct = (v: number | null | undefined, casas = 2) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(casas).replace(".", ",")}%`;
const sinalPct = (v: number | null | undefined, casas = 0) =>
  v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(casas).replace(".", ",")}%`;
const brl = (v: number) =>
  v >= 1_000_000
    ? `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")} mi`
    : v >= 1000
      ? `R$ ${(v / 1000).toFixed(1).replace(".", ",")} mil`
      : `R$ ${Math.round(v)}`;
const mesAno = (iso: string | null) => (iso ? `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}` : "—");

/** Campo em %: guarda o texto enquanto a pessoa digita e devolve a fração (ou null, em branco). */
function CampoPct({
  valor,
  onMudar,
  placeholder,
  largura = "w-[62px]",
  casas = 2,
  titulo,
}: {
  valor: number | null;
  onMudar: (v: number | null) => void;
  placeholder?: string;
  largura?: string;
  casas?: number;
  titulo?: string;
}) {
  const [texto, setTexto] = useState(valor == null ? "" : (valor * 100).toFixed(casas));
  return (
    <input
      type="number"
      step="0.01"
      value={texto}
      placeholder={placeholder}
      title={titulo}
      onChange={(e) => {
        setTexto(e.target.value);
        const n = e.target.value === "" ? null : Number(e.target.value);
        onMudar(n == null || !Number.isFinite(n) ? null : n / 100);
      }}
      className={`${largura} rounded border border-border-soft bg-transparent px-1 py-0.5 text-right font-mono text-[11px] outline-none focus:border-primary-fill`}
    />
  );
}

type EstadoProduto = { fases: FaseTela[]; sazonalidade: number[] | null };

export function PlanoReceitaPainel({ cenarioId, dados }: { cenarioId: string; dados: DadosPlanoReceita }) {
  const importado = dados.modelo === "trimestral";
  const [produtos, setProdutos] = useState<Record<string, EstadoProduto>>(() =>
    Object.fromEntries(dados.produtos.map((p) => [p.id, { fases: p.fases, sazonalidade: p.sazonalidade }])),
  );
  const [pesos, setPesos] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(dados.produtos.map((p) => [p.id, dados.pesos[p.id] ?? null])),
  );
  const [pctCombo, setPctCombo] = useState<number | null>(dados.pctVendasCombo);
  // Versão dos campos: sobe quando um botão reescreve valores, pra os campos mostrarem o novo número.
  const [versao, setVersao] = useState(0);
  const [produtoAberto, setProdutoAberto] = useState(dados.produtos[0]?.id ?? "");
  const [sujo, setSujo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [outrosRecalculados, setOutrosRecalculados] = useState<string[]>([]);
  const [previa, setPrevia] = useState<LinhaPrevia[] | null>(null);
  const [pendente, startTransition] = useTransition();

  // ── Seção 1: meta de receita ─────────────────────────────────────────────────────────────
  const mrrDez = (id: string, ano: number) => dados.produtos.find((p) => p.id === id)?.mrrPorMes[`${ano}-12-01`] ?? 0;
  const crescHoje = (id: string, ano: number) => {
    const antes = mrrDez(id, ano - 1);
    return antes > 0 ? mrrDez(id, ano) / antes - 1 : null;
  };
  const totalDez = (ano: number) => dados.produtos.reduce((s, p) => s + mrrDez(p.id, ano), 0);
  const crescTotalHoje = (ano: number) => (totalDez(ano - 1) > 0 ? totalDez(ano) / totalDez(ano - 1) - 1 : null);

  const [metas, setMetas] = useState(() =>
    dados.anos.map((a) => ({
      ano: a.ano,
      crescimento: a.crescimento ?? crescTotalHoje(a.ano),
      metasProduto: Object.fromEntries(
        dados.produtos.map((p) => [p.id, a.metasProduto[p.id] ?? crescHoje(p.id, a.ano) ?? 0]),
      ) as Record<string, number>,
    })),
  );
  const [anoAberto, setAnoAberto] = useState(dados.anos[0]?.ano ?? 0);
  const [refId, setRefId] = useState<string>(dados.outrosCenarios[0]?.id ?? "");
  const [indice, setIndice] = useState<string>("1");
  const [indiceChurn, setIndiceChurn] = useState<string>("1");
  const [detalheProduto, setDetalheProduto] = useState(false);
  const [secao2Aberta, setSecao2Aberta] = useState(false);
  const pesoDe = (id: string) => pesos[id] ?? dados.pesosCalculados[id] ?? 0;

  const fasesDoAno = (id: string, ano: number): (FaseValue | null)[] => {
    const p = dados.produtos.find((x) => x.id === id);
    return Array.from({ length: 12 }, (_, i) => p?.fasePorMes[`${ano}-${String(i + 1).padStart(2, "0")}-01`] ?? null);
  };
  const rotuloFasesDoAno = (id: string, ano: number) => {
    const lista = [...new Set(fasesDoAno(id, ano).filter((f): f is FaseValue => f != null))];
    return lista.length === 0 ? "—" : lista.map((f) => LABEL_CURTO[f]).join(" → ");
  };
  const metaAberta = metas.find((m) => m.ano === anoAberto);
  const sugeridas = useMemo(() => {
    if (!metaAberta || metaAberta.crescimento == null) return {} as Record<string, number>;
    return sugerirMetas(
      metaAberta.crescimento,
      dados.produtos.map((p) => ({ id: p.id, peso: pesoDe(p.id), fator: fatorDoAno(fasesDoAno(p.id, anoAberto)) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaAberta?.crescimento, anoAberto, pesos]);

  const mudarMeta = (ano: number, crescimento: number | null) => {
    setMetas((ms) => ms.map((m) => (m.ano === ano ? { ...m, crescimento } : m)));
    setSujo(true);
  };
  const mudarMetaProduto = (ano: number, id: string, v: number | null) => {
    setMetas((ms) => ms.map((m) => (m.ano === ano ? { ...m, metasProduto: { ...m.metasProduto, [id]: v ?? 0 } } : m)));
    setSujo(true);
  };
  const cenarioRef = dados.outrosCenarios.find((c) => c.id === refId);
  const crescRefNoAno = cenarioRef?.crescimentoPorAno[anoAberto];
  const indiceNum = indice === "" ? null : Number(indice.replace(",", "."));
  // meta = índice × (1 + crescimento do cenário de referência) − 1 — a fórmula que substitui
  // "cortar o % pela metade": crescimento é velocidade, não nível, então só multiplicar o índice
  // direto no % dá um resultado errado (ver conversa). É esta fórmula que faz o índice virar,
  // de fato, a fração/múltiplo do RESULTADO do outro cenário naquele ano.
  const mrrRefNoAno = cenarioRef?.mrrDezPorAno[anoAberto];
  const baseAqui = totalDez(anoAberto - 1);
  const metaDoIndice =
    indiceNum == null || !Number.isFinite(indiceNum)
      ? null
      : mrrRefNoAno != null && baseAqui > 0
        ? (indiceNum * mrrRefNoAno) / baseAqui - 1
        : crescRefNoAno != null
          ? indiceNum * (1 + crescRefNoAno) - 1
          : null;

  const clientesDez = (ano: number) => dados.produtos.reduce((s, p) => s + (p.clientesPorMes[`${ano}-12-01`] ?? 0), 0);

  /**
   * A trajetória inteira, não só o ano aberto — é a resposta direta a "não desce em cascata?":
   * desce sim, e a prova é que dá pra calcular todo o resto sem tocar em mais nada. A partir do
   * ano aplicado, o MRR de cada ano seguinte é sempre índice × MRR do cenário de referência —
   * porque manter o MESMO ritmo de crescimento do cenário de referência preserva a proporção
   * (ver conversa: crescimento é velocidade, não nível, então não precisa recalcular ano a ano).
   */
  type LinhaTrajetoria = {
    ano: number;
    mrr: number | null;
    clientesEstimados: number | null;
    porProduto: Record<string, { mrr: number | null; clientes: number | null }>;
  };

  const trajetoriaEstimada = useMemo((): LinhaTrajetoria[] => {
    if (metaDoIndice == null || !cenarioRef || indiceNum == null) return [];
    const linhas: LinhaTrajetoria[] = [];
    let mrrAnterior = totalDez(anoAberto - 1) * (1 + metaDoIndice);
    // Por produto: cada um tem seu próprio ritmo no cenário de referência — o mix muda o total.
    const mrrAnteriorPorProduto: Record<string, number> = {};
    for (const p of dados.produtos) {
      const absP = cenarioRef.mrrDezPorAnoPorProduto[p.id]?.[anoAberto];
      const crescRefP = cenarioRef.crescimentoPorAnoPorProduto[p.id]?.[anoAberto];
      mrrAnteriorPorProduto[p.id] =
        absP != null
          ? indiceNum * absP
          : crescRefP != null
            ? (p.mrrPorMes[`${anoAberto - 1}-12-01`] ?? 0) * (1 + (indiceNum * (1 + crescRefP) - 1))
            : 0;
    }
    for (const a of dados.anos) {
      if (a.ano < anoAberto) continue;
      // O cenário de referência pode terminar antes daqui (ex.: comparar com o FUNSES 1, que vai
      // só até 2030, num cenário que segue até 2032) — sem dado dele pra esse ano, não tem como
      // saber o ritmo: mostra "sem dado" em vez de supor 0% (flat) ou travar em zero.
      const absRef = cenarioRef.mrrDezPorAno[a.ano];
      const cresc = a.ano === anoAberto ? 0 : cenarioRef.crescimentoPorAno[a.ano];
      if (a.ano !== anoAberto && absRef == null && cresc == null) {
        linhas.push({ ano: a.ano, mrr: null, clientesEstimados: null, porProduto: {} });
        continue;
      }
      const mrr = absRef != null ? indiceNum * absRef : a.ano === anoAberto ? mrrAnterior : mrrAnterior * (1 + cresc!);
      mrrAnterior = mrr;
      // Clientes estimados: ticket médio DESTE cenário naquele ano (o que ele já projeta hoje),
      // aplicado ao MRR novo — é aproximação (o mix de produto muda o ticket), não o resultado
      // final; o número exato só sai depois de "Levar metas às fases" + recalcular de verdade.
      const clientesHoje = clientesDez(a.ano);
      const mrrHoje = totalDez(a.ano);
      const ticket = clientesHoje > 0 && mrrHoje > 0 ? mrrHoje / clientesHoje : null;

      const porProduto: LinhaTrajetoria["porProduto"] = {};
      for (const p of dados.produtos) {
        const absRefP = cenarioRef.mrrDezPorAnoPorProduto[p.id]?.[a.ano];
        const crescRefP = a.ano === anoAberto ? 0 : cenarioRef.crescimentoPorAnoPorProduto[p.id]?.[a.ano];
        if (absRefP == null && crescRefP == null && a.ano !== anoAberto) {
          porProduto[p.id] = { mrr: null, clientes: null };
          continue;
        }
        const mrrP = absRefP != null ? indiceNum * absRefP : a.ano === anoAberto ? mrrAnteriorPorProduto[p.id] : mrrAnteriorPorProduto[p.id] * (1 + crescRefP!);
        mrrAnteriorPorProduto[p.id] = mrrP;
        const clientesHojeP = p.clientesPorMes[`${a.ano}-12-01`] ?? 0;
        const mrrHojeP = p.mrrPorMes[`${a.ano}-12-01`] ?? 0;
        const ticketP = clientesHojeP > 0 && mrrHojeP > 0 ? mrrHojeP / clientesHojeP : null;
        porProduto[p.id] = { mrr: mrrP, clientes: ticketP ? mrrP / ticketP : null };
      }

      linhas.push({ ano: a.ano, mrr, clientesEstimados: ticket ? mrr / ticket : null, porProduto });
    }
    return linhas;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaDoIndice, refId, anoAberto, indice]);

  // ── Índice de churn — mesmo modelo do crescimento, só que a fórmula é direta: índice × churn do
  // cenário de referência, sem o ajuste de "1 + …" (churn é taxa, não nível que compõe). ─────────
  const indiceChurnNum = indiceChurn === "" ? null : Number(indiceChurn.replace(",", "."));
  const churnRefNoAno = cenarioRef?.churnAnualPorAno[anoAberto];
  const churnAlvoDoIndice =
    churnRefNoAno != null && indiceChurnNum != null && Number.isFinite(indiceChurnNum) ? indiceChurnNum * churnRefNoAno : null;

  type LinhaChurn = { ano: number; churn: number | null; porProduto: Record<string, number | null> };
  const trajetoriaChurnEstimada = useMemo((): LinhaChurn[] => {
    if (!cenarioRef || indiceChurnNum == null) return [];
    const linhas: LinhaChurn[] = [];
    for (const a of dados.anos) {
      if (a.ano < anoAberto) continue;
      const churnRef = cenarioRef.churnAnualPorAno[a.ano];
      const porProduto: Record<string, number | null> = {};
      for (const p of dados.produtos) {
        const refP = cenarioRef.churnAnualPorAnoPorProduto[p.id]?.[a.ano];
        porProduto[p.id] = refP != null ? indiceChurnNum * refP : null;
      }
      linhas.push({ ano: a.ano, churn: churnRef != null ? indiceChurnNum * churnRef : null, porProduto });
    }
    return linhas;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indiceChurn, refId, anoAberto]);

  const aplicarIndiceChurn = () => {
    if (churnAlvoDoIndice == null || indiceChurnNum == null) return;
    const produtosNovos = produtosComChurnNasFases(anoAberto, indiceChurnNum, refId, produtos);
    setProdutos(produtosNovos);
    setVersao((v) => v + 1);
    setSujo(true);
    startTransition(async () => {
      setErro(null);
      setOk(false);
      const r = await previaPlanoReceita(cenarioId, payload(metas, produtosNovos));
      if (r.error) setErro(r.error);
      else setPrevia(r.linhas ?? []);
    });
  };

  const usarSugerido = () => {
    setMetas((ms) => ms.map((m) => (m.ano === anoAberto ? { ...m, metasProduto: { ...m.metasProduto, ...sugeridas } } : m)));
    setVersao((v) => v + 1);
    setSujo(true);
  };

  /**
   * A mesma conta de "levar metas às fases", só que pura: recebe as metas e o estado atual dos
   * produtos e RETORNA o novo estado, sem mexer em nada. Assim dá pra encadear no mesmo clique —
   * "aplicar o índice" não precisa esperar dois re-renders pra saber com que fases ele vai mexer.
   */
  const produtosComMetasNasFases = (metasParaAplicar: typeof metas, produtosAtual: typeof produtos): typeof produtos => {
    const novo = { ...produtosAtual };
    for (const p of dados.produtos) {
      const deslocPorAno = new Map<number, number>();
      for (const m of metasParaAplicar) {
        const hoje = crescHoje(p.id, m.ano);
        const meta = m.metasProduto[p.id];
        if (hoje == null || meta == null || Math.abs(meta - hoje) < 0.001) continue;
        deslocPorAno.set(m.ano, crescAnualParaMensal(meta) - crescAnualParaMensal(hoje));
      }
      if (deslocPorAno.size === 0) continue;
      const fases = novo[p.id].fases.map((f) => {
        const meses = Object.entries(p.fasePorMes).filter(([, fase]) => fase === f.fase).map(([mes]) => Number(mes.slice(0, 4)));
        const desl = meses.map((a) => deslocPorAno.get(a)).filter((d): d is number => d != null);
        if (desl.length === 0) return f;
        const d = desl.reduce((s, v) => s + v, 0) / meses.length;
        if (f.fase === "maturidade") {
          return f.cresc_alvo == null ? f : { ...f, cresc_alvo: crescMensalParaAnual(crescAnualParaMensal(f.cresc_alvo) + d) };
        }
        return {
          ...f,
          cresc_alvo: f.cresc_alvo != null ? f.cresc_alvo + d : f.cresc_alvo,
          cresc_inicio: f.cresc_inicio != null ? f.cresc_inicio + d : f.cresc_inicio,
        };
      });
      novo[p.id] = { ...novo[p.id], fases };
    }
    return novo;
  };

  /**
   * Mesma ideia do índice de crescimento, só que pro churn: desloca o churn_alvo das fases que o
   * ano escolhido toca, pela diferença entre o churn de hoje (por produto) e índice × churn do
   * cenário de referência NAQUELE produto. Não precisa de "meta por ano" salva à parte — é um
   * ajuste direto nas fases, igual "Levar metas às fases" já faz pro crescimento.
   */
  const produtosComChurnNasFases = (ano: number, indiceCh: number, refIdCh: string, produtosAtual: typeof produtos): typeof produtos => {
    const ref = dados.outrosCenarios.find((c) => c.id === refIdCh);
    if (!ref) return produtosAtual;
    const novo = { ...produtosAtual };
    for (const p of dados.produtos) {
      const hoje = dados.churnAtualPorAnoPorProduto[p.id]?.[ano];
      const churnRef = ref.churnAnualPorAnoPorProduto[p.id]?.[ano];
      if (hoje == null || churnRef == null) continue;
      const alvo = indiceCh * churnRef;
      if (Math.abs(alvo - hoje) < 0.0005) continue;
      const desloc = churnAnualParaMensal(alvo) - churnAnualParaMensal(hoje);
      const meses = Object.entries(p.fasePorMes).filter(([m]) => Number(m.slice(0, 4)) === ano).map(([, fase]) => fase);
      if (meses.length === 0) continue;
      const fasesDoAno = new Set(meses);
      const fases = novo[p.id].fases.map((f) => {
        if (!fasesDoAno.has(f.fase)) return f;
        if (f.fase === "maturidade") {
          return f.churn_alvo == null ? f : { ...f, churn_alvo: churnMensalParaAnual(Math.max(0, churnAnualParaMensal(f.churn_alvo) + desloc)) };
        }
        return {
          ...f,
          churn_alvo: f.churn_alvo != null ? Math.max(0, f.churn_alvo + desloc) : f.churn_alvo,
          churn_inicio: f.churn_inicio != null ? Math.max(0, f.churn_inicio + desloc) : f.churn_inicio,
        };
      });
      novo[p.id] = { ...novo[p.id], fases };
    }
    return novo;
  };

  const levarMetasAsFases = () => {
    setProdutos((atual) => produtosComMetasNasFases(metas, atual));
    setVersao((v) => v + 1);
    setSujo(true);
  };

  // ── Seção 2: fases ──────────────────────────────────────────────────────────────────────
  const mudarFase = (id: string, fase: FaseValue, campo: keyof FaseTela, v: number | null) => {
    setProdutos((atual) => ({
      ...atual,
      [id]: { ...atual[id], fases: atual[id].fases.map((f) => (f.fase === fase ? { ...f, [campo]: v } : f)) },
    }));
    setSujo(true);
  };
  const mudarSazonalidade = (id: string, mes: number, v: number | null) => {
    setProdutos((atual) => {
      const base = atual[id].sazonalidade ?? Array(12).fill(1);
      const saz = base.map((x, i) => (i === mes ? (v ?? 0) : x));
      return { ...atual, [id]: { ...atual[id], sazonalidade: saz } };
    });
    setSujo(true);
  };

  // Aceita metas/produtos explícitos — pra montar o payload com um valor que acabou de ser
  // calculado, sem esperar o estado do React atualizar e re-renderizar antes de mandar pro servidor.
  const payload = (metasParaEnviar: typeof metas = metas, produtosParaEnviar: typeof produtos = produtos): PayloadPlanoReceita => ({
    pctVendasCombo: pctCombo,
    pesos: Object.fromEntries(dados.produtos.map((p) => [p.id, pesoDe(p.id)])),
    metas: metasParaEnviar.map((m) => ({ ano: m.ano, crescimento: m.crescimento, metasProduto: m.metasProduto })),
    produtos: dados.produtos.map((p) => ({
      id: p.id,
      fases: produtosParaEnviar[p.id].fases.map(({ fase, cresc_inicio, cresc_alvo, churn_inicio, churn_alvo }) => ({
        fase,
        cresc_inicio,
        cresc_alvo,
        churn_inicio,
        churn_alvo,
      })),
      sazonalidade: produtosParaEnviar[p.id].sazonalidade,
    })),
  });

  const verPrevia = () =>
    startTransition(async () => {
      setErro(null);
      setOk(false);
      const r = await previaPlanoReceita(cenarioId, payload());
      if (r.error) setErro(r.error);
      else setPrevia(r.linhas ?? []);
    });

  /**
   * O botão único: aplica o índice no ano escolhido — e SÓ nele, os anos seguintes continuam no
   * mesmo ritmo do cenário de referência, que é o que mantém a proporção sozinha dali pra frente
   * (ver conversa) — desloca as fases e já busca a prévia real no servidor. Sem isso, a pessoa
   * precisava de "usar em [ano]" + "Levar metas às fases" + "Ver prévia" em três cliques
   * separados pra ver QUALQUER número mudar, e cada um deles é reversível/intermediário — dava a
   * impressão de que nada tinha acontecido.
   */
  const aplicarIndice = () => {
    if (metaDoIndice == null) return;
    const distribuido = sugerirMetas(
      metaDoIndice,
      dados.produtos.map((p) => ({ id: p.id, peso: pesoDe(p.id), fator: fatorDoAno(fasesDoAno(p.id, anoAberto)) })),
    );
    const metasNovas = metas.map((m) =>
      m.ano === anoAberto ? { ...m, crescimento: metaDoIndice, metasProduto: { ...m.metasProduto, ...distribuido } } : m,
    );
    const produtosNovos = produtosComMetasNasFases(metasNovas, produtos);
    setMetas(metasNovas);
    setProdutos(produtosNovos);
    setVersao((v) => v + 1);
    setSujo(true);
    startTransition(async () => {
      setErro(null);
      setOk(false);
      const r = await previaPlanoReceita(cenarioId, payload(metasNovas, produtosNovos));
      if (r.error) setErro(r.error);
      else setPrevia(r.linhas ?? []);
    });
  };
  const salvar = () =>
    startTransition(async () => {
      setErro(null);
      const r = await salvarPlanoReceita(cenarioId, payload());
      setOutrosRecalculados(r.outrosRecalculados ?? []);
      if (r.error) setErro(r.error);
      else {
        setOk(true);
        setSujo(false);
        setPrevia(null);
      }
    });

  if (dados.produtos.length === 0) {
    return <p className="px-5 py-4 text-[13px] text-text-muted">Nenhum produto neste cenário ainda.</p>;
  }

  const prodAberto = dados.produtos.find((p) => p.id === produtoAberto) ?? dados.produtos[0];
  const fasesAbertas = produtos[prodAberto.id].fases;
  const somaMetas = metaAberta
    ? somaPonderada(metaAberta.metasProduto, Object.fromEntries(dados.produtos.map((p) => [p.id, pesoDe(p.id)])))
    : 0;
  const bate = metaAberta?.crescimento != null && Math.abs(somaMetas - metaAberta.crescimento) < 0.01;

  return (
    <div className="flex flex-col gap-3 p-4">
      {importado ? (
        <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-[12px] text-warning">
          Importado do modelo anterior — os números de hoje ficam como estão. Os valores abaixo são o plano atual convertido
          para o modelo novo. Ao salvar, a prévia mostra a diferença antes; só depois de confirmar o cenário passa a ser
          calculado assim.
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[11px] text-text-muted">
          <span className="rounded-full bg-primary-soft px-2 py-0.5 font-medium text-primary-deep">plano pela receita</span>
          Crescimento da receita e churn por fase, em curva; clientes = receita ÷ preço.
        </div>
      )}

      {/* 1 · Meta de receita do cenário */}
      <section className="rounded-xl border border-border-soft bg-surface p-4">
        <h3 className="text-[13px] font-semibold">1 · Meta de receita do cenário</h3>
        <p className="mb-3 text-[11px] text-text-muted">Crescimento do MRR total, dezembro contra dezembro</p>
        {metas.length === 0 ? (
          <p className="text-[12px] text-text-muted">A meta aparece a partir do primeiro dezembro com receita na projeção.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-3">
              <div>
                <div className="text-[10.5px] text-text-faint">dez/{String(metas[0].ano - 1).slice(2)}</div>
                <div className="py-0.5 font-mono text-[12px]">{brl(totalDez(metas[0].ano - 1))}</div>
              </div>
              {metas.map((m) => (
                <div key={m.ano}>
                  <button
                    type="button"
                    onClick={() => setAnoAberto(m.ano)}
                    className={`block text-[10.5px] ${m.ano === anoAberto ? "font-semibold text-primary-deep" : "text-text-faint"}`}
                  >
                    {m.ano}
                  </button>
                  <CampoPct
                    key={`meta-${m.ano}-${versao}`}
                    valor={m.crescimento}
                    onMudar={(v) => mudarMeta(m.ano, v)}
                    casas={0}
                    largura="w-[70px]"
                    titulo={`Plano hoje: ${sinalPct(crescTotalHoje(m.ano))}`}
                  />
                </div>
              ))}
            </div>

            {dados.outrosCenarios.length > 0 && (
              <div className="mb-3 rounded-lg border border-dashed border-border-soft bg-bg px-3 py-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-text-faint">A partir de {anoAberto}, quero</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={indice}
                      onChange={(e) => setIndice(e.target.value)}
                      placeholder="1"
                      title="0,5 = metade do resultado do cenário escolhido; 1,2 = 20% a mais; 1 = igual"
                      className="w-[56px] rounded border border-border-soft bg-transparent px-1 py-0.5 text-right font-mono text-[11px] outline-none focus:border-primary-fill"
                    />
                  </div>
                  <span className="pb-1 text-[11px] text-text-faint">× do que</span>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-text-faint">entrega</span>
                    <select
                      value={refId}
                      onChange={(e) => setRefId(e.target.value)}
                      className="rounded border border-border-soft bg-transparent px-1.5 py-0.5 text-[11px] outline-none focus:border-primary-fill"
                    >
                      {dados.outrosCenarios.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={metaDoIndice == null || pendente}
                    onClick={aplicarIndice}
                    className="rounded-lg border border-primary-fill px-2.5 py-1 text-[11px] font-medium text-primary-deep disabled:opacity-40"
                  >
                    {pendente ? "calculando…" : `aplicar a partir de ${anoAberto}`}
                  </button>
                  <span className="pb-1 text-[11px] text-text-faint">
                    Sozinho, sem mexer em mais nada — {anoAberto} recebe o corte/aumento e os anos seguintes seguem o mesmo ritmo do
                    cenário escolhido, o que já preserva a proporção sem precisar repetir ano a ano.
                  </span>
                </div>

                {trajetoriaEstimada.length > 0 && (
                  <div className="mt-2.5 border-t border-border-soft pt-2">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] text-text-faint">
                        Estimativa, antes de aplicar — o índice vale pro <strong>consolidado</strong> (soma dos produtos) e é
                        distribuído entre eles pelo peso e pela fase de cada um. Aproximação: usa o ticket médio de hoje pra
                        estimar clientes; o número exato sai depois de aplicar, na prévia real abaixo.
                      </p>
                      <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
                        <input type="checkbox" checked={detalheProduto} onChange={(e) => setDetalheProduto(e.target.checked)} />
                        detalhe por produto
                      </label>
                    </div>
                    {/* Rolagem horizontal já prevista: com mais produtos, as colunas continuam do mesmo
                        tamanho e a tabela rola pro lado em vez de espremer. */}
                    <div className="overflow-x-auto">
                      <table className="text-[11px]" style={{ minWidth: detalheProduto ? 180 + dados.produtos.length * 220 : undefined }}>
                        <thead>
                          <tr className="text-left text-text-faint">
                            <th className="pr-3 font-medium" rowSpan={2}>Dez de</th>
                            <th className="border-b border-border-soft px-2 text-center font-semibold text-text" colSpan={3}>Consolidado</th>
                            {detalheProduto &&
                              dados.produtos.map((p) => (
                                <th key={p.id} className="border-b border-l border-border-soft px-2 text-center font-medium" colSpan={2}>
                                  {p.nome.replace(/^Fashion /, "")}
                                </th>
                              ))}
                          </tr>
                          <tr className="text-left text-text-faint">
                            <th className="w-[110px] px-2 text-right font-medium">MRR</th>
                            <th className="w-[100px] px-2 text-right font-medium">Clientes</th>
                            <th className="w-[120px] px-2 text-right font-normal text-text-faint" title="Clientes que o cenário de referência tem nesse ano, pra comparar">
                              clientes no {cenarioRef?.nome ?? "ref."}
                            </th>
                            {detalheProduto &&
                              dados.produtos.map((p) => (
                                <Fragment key={p.id}>
                                  <th className="w-[110px] border-l border-border-soft px-2 text-right font-medium">MRR</th>
                                  <th className="w-[100px] px-2 text-right font-medium">Clientes</th>
                                </Fragment>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {trajetoriaEstimada.map((l) => (
                            <tr key={l.ano} className="border-t border-border-soft/60">
                              <td className="py-0.5 pr-3">{l.ano}</td>
                              <td className="px-2 py-0.5 text-right font-mono font-semibold">{l.mrr != null ? brl(l.mrr) : "—"}</td>
                              <td className="px-2 py-0.5 text-right font-mono font-semibold" title={l.clientesEstimados == null ? "sem dado do cenário de referência neste ano" : undefined}>
                                {l.clientesEstimados != null ? Math.round(l.clientesEstimados).toLocaleString("pt-BR") : "sem dado"}
                              </td>
                              <td className="px-2 py-0.5 text-right font-mono text-text-faint">
                                {cenarioRef?.clientesDezPorAno[l.ano] != null ? Math.round(cenarioRef.clientesDezPorAno[l.ano]).toLocaleString("pt-BR") : "—"}
                              </td>
                              {detalheProduto &&
                                dados.produtos.map((p) => {
                                  const d = l.porProduto[p.id];
                                  return (
                                    <Fragment key={p.id}>
                                      <td className="border-l border-border-soft px-2 py-0.5 text-right font-mono text-text-muted">
                                        {d?.mrr != null ? brl(d.mrr) : "—"}
                                      </td>
                                      <td className="px-2 py-0.5 text-right font-mono text-text-muted">
                                        {d?.clientes != null ? Math.round(d.clientes).toLocaleString("pt-BR") : "—"}
                                      </td>
                                    </Fragment>
                                  );
                                })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(() => {
                      const ult = [...trajetoriaEstimada].reverse().find((l) => l.mrr != null && l.clientesEstimados != null);
                      if (!ult || !cenarioRef) return null;
                      const ticketAqui = ult.mrr! / ult.clientesEstimados!;
                      const mrrRef = cenarioRef.mrrDezPorAno[ult.ano];
                      const cliRef = cenarioRef.clientesDezPorAno[ult.ano];
                      const ticketLa = mrrRef != null && cliRef ? mrrRef / cliRef : null;
                      if (ticketLa == null || Math.abs(ticketAqui / ticketLa - 1) < 0.02) return null;
                      return (
                        <p className="mt-1.5 text-[10.5px] text-text-muted">
                          O índice reproduz a <strong>receita</strong>; clientes = receita ÷ preço médio <em>deste</em> cenário. Em {ult.ano}
                          o ticket aqui é {brl(ticketAqui)} e no {cenarioRef.nome} é {brl(ticketLa)} (mix de produto diferente) — por isso a
                          mesma receita dá {ticketAqui > ticketLa ? "menos" : "mais"} clientes. Pra igualar clientes também, o mix/peso dos produtos
                          precisaria ser o mesmo.
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ── Churn: o mesmo modelo, com a fórmula direta (índice × churn) ───────────── */}
            {dados.outrosCenarios.length > 0 && (
              <div className="mb-3 rounded-lg border border-dashed border-border-soft bg-bg px-3 py-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-text-faint">Churn a partir de {anoAberto}: quero</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={indiceChurn}
                      onChange={(e) => setIndiceChurn(e.target.value)}
                      placeholder="1"
                      title="1,5 = churn 50% maior que o do cenário escolhido; 0,8 = 20% menor; 1 = igual"
                      className="w-[56px] rounded border border-border-soft bg-transparent px-1 py-0.5 text-right font-mono text-[11px] outline-none focus:border-primary-fill"
                    />
                  </div>
                  <span className="pb-1 text-[11px] text-text-faint">
                    × do churn de <strong className="text-text">{cenarioRef?.nome ?? "—"}</strong>
                    {churnRefNoAno != null
                      ? ` (${pct(churnRefNoAno, 1)} a.a. ≈ ${pct(churnAnualParaMensal(churnRefNoAno), 2)} a.m. lá`
                      : " (sem dado lá"}
                    {churnAlvoDoIndice != null
                      ? ` → ${pct(churnAlvoDoIndice, 1)} a.a. ≈ ${pct(churnAnualParaMensal(churnAlvoDoIndice), 2)} a.m. aqui)`
                      : ")"}
                  </span>
                  <button
                    type="button"
                    disabled={churnAlvoDoIndice == null || pendente}
                    onClick={aplicarIndiceChurn}
                    className="rounded-lg border border-primary-fill px-2.5 py-1 text-[11px] font-medium text-primary-deep disabled:opacity-40"
                  >
                    {pendente ? "calculando…" : `aplicar churn a partir de ${anoAberto}`}
                  </button>
                  <span className="pb-1 text-[11px] text-text-faint">
                    Usa o mesmo cenário de referência escolhido acima. Lembre: churn não reduz a receita direto — aumenta quanta
                    venda nova é preciso pra sustentar a mesma curva.
                  </span>
                </div>

                {trajetoriaChurnEstimada.length > 0 && (
                  <div className="mt-2.5 border-t border-border-soft pt-2">
                    <p className="mb-1 text-[10px] text-text-faint">
                      Churn médio do ano, ponderado pelos clientes ativos, mostrado <strong>ao ano</strong> (com o equivalente
                      mensal entre parênteses). O card &quot;Churn médio&quot; em Indicadores é a mesma conta, só que{" "}
                      <strong>mensal</strong> e sobre o período inteiro do cenário, não por ano — 2% a.m. ≈ 22% a.a. Com
                      &quot;detalhe por produto&quot; ligado acima, aparece por produto (cada um tem sua própria régua).
                    </p>
                    <div className="overflow-x-auto">
                      <table className="text-[11px]" style={{ minWidth: detalheProduto ? 120 + dados.produtos.length * 110 : undefined }}>
                        <thead>
                          <tr className="text-left text-text-faint">
                            <th className="pr-3 font-medium">Ano</th>
                            <th className="w-[110px] px-2 text-right font-semibold text-text">Consolidado</th>
                            {detalheProduto &&
                              dados.produtos.map((p) => (
                                <th key={p.id} className="w-[110px] border-l border-border-soft px-2 text-right font-medium">
                                  {p.nome.replace(/^Fashion /, "")}
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {trajetoriaChurnEstimada.map((l) => (
                            <tr key={l.ano} className="border-t border-border-soft/60">
                              <td className="py-0.5 pr-3">{l.ano}</td>
                              <td className="px-2 py-0.5 text-right font-mono font-semibold">
                                {l.churn != null ? (
                                  <>
                                    {pct(l.churn, 1)} a.a.{" "}
                                    <span className="font-normal text-text-faint">({pct(churnAnualParaMensal(l.churn), 2)} a.m.)</span>
                                  </>
                                ) : (
                                  "sem dado"
                                )}
                              </td>
                              {detalheProduto &&
                                dados.produtos.map((p) => (
                                  <td key={p.id} className="border-l border-border-soft px-2 py-0.5 text-right font-mono text-text-muted">
                                    {l.porProduto[p.id] != null ? `${pct(l.porProduto[p.id]!, 1)} a.a.` : "—"}
                                  </td>
                                ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {metaAberta && (
              <>
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="text-left text-[10.5px] text-text-faint">
                      <th className="py-1 pr-2 font-medium">{anoAberto} por produto</th>
                      <th className="px-2 py-1 font-medium">Peso na receita</th>
                      <th className="px-2 py-1 font-medium">Fase no ano</th>
                      <th className="px-2 py-1 text-right font-medium">Sugerido</th>
                      <th className="px-2 py-1 text-right font-medium">Meta usada</th>
                      <th className="px-2 py-1 text-right font-medium">Plano hoje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.produtos.map((p) => (
                      <tr key={p.id} className="border-t border-border-soft">
                        <td className="py-1.5 pr-2">{p.nome}</td>
                        <td className="px-2 py-1.5">
                          <CampoPct
                            key={`peso-${p.id}-${versao}`}
                            valor={pesos[p.id]}
                            onMudar={(v) => {
                              setPesos((ps) => ({ ...ps, [p.id]: v }));
                              setSujo(true);
                            }}
                            placeholder={(dados.pesosCalculados[p.id] * 100).toFixed(0)}
                            casas={0}
                            titulo="Em branco = participação no MRR de dezembro anterior ao primeiro ano"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-text-muted">{rotuloFasesDoAno(p.id, anoAberto)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-text-muted">{sinalPct(sugeridas[p.id])}</td>
                        <td className="px-2 py-1.5 text-right">
                          <CampoPct
                            key={`mp-${anoAberto}-${p.id}-${versao}`}
                            valor={metaAberta.metasProduto[p.id] ?? null}
                            onMudar={(v) => mudarMetaProduto(anoAberto, p.id, v)}
                            casas={0}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-text-muted">{sinalPct(crescHoje(p.id, anoAberto))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className={bate ? "text-success" : "text-text-muted"}>
                    Soma ponderada das metas usadas: {sinalPct(somaMetas)} · meta {sinalPct(metaAberta.crescimento)}
                    {bate ? " ✓ bate com a meta" : ""}
                  </span>
                  <span className="flex gap-3">
                    <button type="button" onClick={usarSugerido} className="font-medium text-primary-deep">
                      Usar sugerido em {anoAberto}
                    </button>
                    <button
                      type="button"
                      onClick={levarMetasAsFases}
                      className="font-medium text-primary-deep"
                      title="Ajusta o crescimento das fases de cada produto pra perseguir a meta usada; confira na prévia"
                    >
                      Levar metas às fases
                    </button>
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* 2 · Por fase de vida do produto */}
      <section className="rounded-xl border border-border-soft bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSecao2Aberta((v) => !v)}
            className="flex items-center gap-1.5 text-[13px] font-semibold"
            title={secao2Aberta ? "Recolher" : "Abrir o detalhe por fase (edição fina das curvas)"}
          >
            <span className={`inline-block text-[10px] text-text-faint transition-transform ${secao2Aberta ? "rotate-90" : ""}`}>▶</span>
            2 · Por fase de vida do produto
            {!secao2Aberta && <span className="text-[10.5px] font-normal text-text-faint">— recolhido; clique pra editar as curvas fase a fase</span>}
          </button>
          {secao2Aberta && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setProdutoAberto("__consolidado__")}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                produtoAberto === "__consolidado__" ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border-soft text-text-muted"
              }`}
              title="Soma dos produtos — só leitura. As curvas em si são sempre por produto, porque cada um tem fases e datas diferentes."
            >
              Consolidado
            </button>
            {dados.produtos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProdutoAberto(p.id)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                  p.id === prodAberto.id ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border-soft text-text-muted"
                }`}
              >
                {p.nome.replace(/^Fashion /, "")}
              </button>
            ))}
          </div>
          )}
        </div>
        {secao2Aberta && (produtoAberto === "__consolidado__" ? (
          <ConsolidadoTabela dados={dados} totalDez={totalDez} crescTotalHoje={crescTotalHoje} />
        ) : (
        <>
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[10.5px] text-text-faint">
              <th className="py-1 pr-2 font-medium">Fase</th>
              <th className="px-2 py-1 font-medium">Período</th>
              <th className="px-2 py-1 text-right font-medium">Receita: começa</th>
              <th className="px-2 py-1 text-right font-medium">no fim da fase</th>
              <th className="px-2 py-1 text-right font-medium">Churn: começa</th>
              <th className="px-2 py-1 text-right font-medium">alvo no fim</th>
              <th className="px-2 py-1 text-right font-medium">Queda</th>
            </tr>
          </thead>
          <tbody>
            {fasesAbertas.map((f, i) => {
              const anterior = fasesAbertas[i - 1];
              const mat = f.fase === "maturidade";
              const churnIni = f.churn_inicio ?? anterior?.churn_alvo ?? f.churn_alvo;
              const queda = !mat && churnIni != null && f.churn_alvo != null ? churnIni - f.churn_alvo : null;
              const k = `${prodAberto.id}-${f.fase}-${versao}`;
              return (
                <tr key={f.fase} className="border-t border-border-soft">
                  <td className="py-1.5 pr-2">{LABEL_CURTO[f.fase]}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-text-muted">
                    {prodAberto.datasTravadas && <span title="Produto iniciado: datas travadas">🔒 </span>}
                    {mesAno(f.data_inicio)}
                    {f.data_fim ? `–${mesAno(f.data_fim)}` : " em diante"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {mat ? (
                      <span className="text-text-faint">—</span>
                    ) : (
                      <CampoPct
                        key={`ci-${k}`}
                        valor={f.cresc_inicio}
                        onMudar={(v) => mudarFase(prodAberto.id, f.fase, "cresc_inicio", v)}
                        placeholder={anterior?.cresc_alvo != null ? (anterior.cresc_alvo * 100).toFixed(2) : ""}
                        titulo="Em branco = continua de onde a fase anterior terminou"
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <CampoPct
                      key={`ca-${k}`}
                      valor={f.cresc_alvo}
                      onMudar={(v) => mudarFase(prodAberto.id, f.fase, "cresc_alvo", v)}
                    />
                    <span className="ml-1 text-[10px] text-text-faint">{mat ? "a.a." : "a.m."}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {mat ? (
                      <span className="text-text-faint">—</span>
                    ) : (
                      <CampoPct
                        key={`chi-${k}`}
                        valor={f.churn_inicio}
                        onMudar={(v) => mudarFase(prodAberto.id, f.fase, "churn_inicio", v)}
                        placeholder={anterior?.churn_alvo != null ? (anterior.churn_alvo * 100).toFixed(2) : ""}
                        titulo="Em branco = continua de onde a fase anterior terminou"
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <CampoPct
                      key={`cha-${k}`}
                      valor={f.churn_alvo}
                      onMudar={(v) => mudarFase(prodAberto.id, f.fase, "churn_alvo", v)}
                    />
                    <span className="ml-1 text-[10px] text-text-faint">{mat ? "a.a." : "a.m."}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[11px] text-text-muted">
                    {mat
                      ? f.churn_alvo != null
                        ? `≈${pct(churnAnualParaMensal(f.churn_alvo))} a.m.`
                        : "—"
                      : queda != null
                        ? `${queda >= 0 ? "−" : "+"}${Math.abs(queda * 100).toFixed(2).replace(".", ",")}`
                        : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[10.5px] text-text-faint">
          A curva começa onde a fase anterior terminou e cai até o alvo no último mês da fase — mais rápido no começo. Na
          maturidade, taxas anuais; o churn oscila ±5% ao longo do ano. Datas das fases vêm do produto.
        </p>
        <FimDasFases produto={prodAberto} fases={fasesAbertas} fim={dados.fim} sujo={sujo} onVerPrevia={verPrevia} />
        </>
        ))}
      </section>

      {/* 3 · Sazonalidade */}
      <section className="rounded-xl border border-border-soft bg-surface p-4">
        <h3 className="text-[13px] font-semibold">3 · Sazonalidade das vendas</h3>
        <p className="mb-3 text-[11px] text-text-muted">
          1,00 = mês médio. O total do ano não muda, só a distribuição entre os meses. É estimativa: ajuste à medida que as
          vendas reais mostrarem a curva de cada produto. É do produto — ao salvar, os outros cenários planejados pela
          receita são recalculados junto; mês já fechado não muda.
        </p>
        <div className="flex flex-col gap-3">
          {dados.produtos.map((p) => {
            const saz = produtos[p.id].sazonalidade ?? Array(12).fill(1);
            const media = saz.reduce((s, v) => s + v, 0) / 12;
            return (
              <div key={p.id} className="grid grid-cols-[110px_minmax(0,1fr)] items-end gap-2">
                <div className="pb-1 text-[12px]">
                  {p.nome}
                  {Math.abs(media - 1) > 0.005 && (
                    <span className="block text-[10px] text-text-faint">
                      média {media.toFixed(2).replace(".", ",")} → ajustada pra 1
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-12 gap-1">
                  {saz.map((v, i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <div
                        className="w-full rounded-t bg-primary-fill"
                        style={{ height: `${Math.round(Math.max(0, v) * 30)}px`, opacity: v >= 1.2 ? 1 : v >= 1 ? 0.75 : 0.45 }}
                      />
                      <input
                        key={`saz-${p.id}-${i}-${versao}`}
                        type="number"
                        step="0.01"
                        defaultValue={v.toFixed(2)}
                        onChange={(e) => mudarSazonalidade(p.id, i, e.target.value === "" ? null : Number(e.target.value))}
                        className="w-full rounded border border-border-soft bg-transparent px-0.5 py-0.5 text-center font-mono text-[10.5px] outline-none focus:border-primary-fill"
                        aria-label={`${p.nome} ${MESES[i]}`}
                      />
                      <span className="text-[10px] text-text-faint">{LETRAS[i]}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4 · Combo */}
      <section className="rounded-xl border border-border-soft bg-surface p-4">
        <h3 className="mb-2 text-[13px] font-semibold">4 · Combo{dados.combo ? ` ${dados.combo.nome}` : ""}</h3>
        {dados.combo ? (
          <div className="flex flex-wrap items-end gap-5">
            <div>
              <div className="text-[10.5px] text-text-faint">Desconto (cadastro de combos)</div>
              <div className="font-mono text-[13px]">{pct(dados.combo.desconto, 0)}</div>
            </div>
            <div>
              <div className="text-[10.5px] text-text-faint">Vendas em combo neste cenário</div>
              <CampoPct
                key={`combo-${versao}`}
                valor={pctCombo}
                onMudar={(v) => {
                  setPctCombo(v);
                  setSujo(true);
                }}
                casas={0}
              />
            </div>
            <p className="max-w-[340px] text-[10.5px] text-text-faint">
              Entra no preço de {dados.combo.produtos.join(" e ")}: parte dos clientes paga com o desconto, e a receita vira
              cliente por esse preço.
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-text-muted">Nenhum combo com produtos deste cenário.</p>
        )}
      </section>

      {previa && <Previa linhas={previa} produtos={dados.produtos} />}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {erro && <span className="text-[11px] text-danger">{erro}</span>}
        {ok && !sujo && (
          <span className="text-[11px] text-success">
            Salvo e recalculado.
            {outrosRecalculados.length > 0 && ` A sazonalidade nova também recalculou: ${outrosRecalculados.join(", ")}.`}
          </span>
        )}
        <button
          type="button"
          onClick={verPrevia}
          disabled={pendente}
          className="rounded-lg border border-border px-3.5 py-1.5 text-[12px] font-medium text-primary-deep disabled:opacity-50"
        >
          {pendente && !previa ? "Calculando…" : "Ver prévia"}
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={pendente || (importado && !previa) || (!importado && !sujo)}
          title={importado && !previa ? "Veja a prévia antes — é ela que mostra o que muda neste cenário" : undefined}
          className="rounded-lg bg-wine-deep px-3.5 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
        >
          {pendente ? "Salvando…" : importado ? "Confirmar e passar para o modelo novo" : "Salvar e recalcular"}
        </button>
      </div>
    </div>
  );
}

/** Soma dos produtos, mês de dezembro de cada ano — visão da empresa inteira, só leitura. As
 *  curvas continuam por produto (cada um tem fases e datas diferentes), isto é um resumo. */
function ConsolidadoTabela({
  dados,
  totalDez,
  crescTotalHoje,
}: {
  dados: DadosPlanoReceita;
  totalDez: (ano: number) => number;
  crescTotalHoje: (ano: number) => number | null;
}) {
  const clientesDez = (ano: number) =>
    dados.produtos.reduce((s, p) => s + (p.clientesPorMes[`${ano}-12-01`] ?? 0), 0);
  const anos = [Number(dados.inicio.slice(0, 4)), ...dados.anos.map((a) => a.ano)];
  const unicos = [...new Set(anos)].sort();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="text-left text-[10.5px] text-text-faint">
            <th className="py-1 pr-2 font-medium">Dezembro de</th>
            <th className="px-2 py-1 text-right font-medium">MRR consolidado</th>
            <th className="px-2 py-1 text-right font-medium">Crescimento dez/dez</th>
            <th className="px-2 py-1 text-right font-medium">Clientes (soma dos produtos)</th>
          </tr>
        </thead>
        <tbody>
          {unicos.map((ano) => {
            const mrr = totalDez(ano);
            if (mrr <= 0) return null;
            const cresc = crescTotalHoje(ano);
            return (
              <tr key={ano} className="border-t border-border-soft">
                <td className="py-1.5 pr-2 font-medium">{ano}</td>
                <td className="px-2 py-1.5 text-right font-mono">{brl(mrr)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-text-muted">{cresc != null ? sinalPct(cresc) : "—"}</td>
                <td className="px-2 py-1.5 text-right font-mono">{Math.round(clientesDez(ano)).toLocaleString("pt-BR")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-text-faint">
        Projeção salva (a soma dos produtos, não editável aqui) — pra mudar, edite a meta na seção 1 ou as fases por produto abaixo.
      </p>
    </div>
  );
}

/** Clientes e receita no último mês de cada fase, na projeção atual. */
function FimDasFases({
  produto,
  fases,
  fim,
  sujo,
  onVerPrevia,
}: {
  produto: DadosPlanoReceita["produtos"][number];
  fases: FaseTela[];
  fim: string;
  sujo: boolean;
  onVerPrevia: () => void;
}) {
  const itens = fases
    .map((f) => {
      const meses = Object.keys(produto.fasePorMes)
        .filter((m) => produto.fasePorMes[m] === f.fase)
        .sort();
      const ultimo = meses.at(-1);
      if (!ultimo) return null;
      return { f, mes: ultimo, parcial: ultimo === fim && f.fase !== "maturidade" };
    })
    .filter((x): x is { f: FaseTela; mes: string; parcial: boolean } => x != null);
  if (itens.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
      {itens.map(({ f, mes, parcial }) => (
        <div key={f.fase} className="rounded-lg bg-bg px-2.5 py-2">
          <div className="text-[10px] text-text-faint">
            {LABEL_CURTO[f.fase]} · {mesAno(mes)}
            {parcial ? " (fim do cenário)" : ""}
          </div>
          <div className="font-mono text-[13px] font-semibold">{Math.round(produto.clientesPorMes[mes] ?? 0)} clientes</div>
          <div className="font-mono text-[11px] text-text-muted">{brl(produto.mrrPorMes[mes] ?? 0)} MRR</div>
        </div>
      ))}
      {sujo ? (
        <p className="col-span-full rounded-lg bg-warning-soft px-2.5 py-1.5 text-[11px] font-medium text-warning">
          ⚠ Estes números ainda são os salvos — não mudam sozinhos quando você edita a meta ou as fases.{" "}
          <button type="button" onClick={onVerPrevia} className="underline">
            Ver prévia
          </button>{" "}
          mostra o efeito das suas mudanças; só "Salvar e recalcular" aplica de vez.
        </p>
      ) : (
        <p className="col-span-full text-[10px] text-text-faint">Projeção salva — clique em "Ver prévia" acima pra testar mudanças antes de salvar.</p>
      )}
    </div>
  );
}

function Previa({ linhas, produtos }: { linhas: LinhaPrevia[]; produtos: DadosPlanoReceita["produtos"] }) {
  const anos = [...new Set(linhas.map((l) => l.ano))].sort();
  const delta = (novo: number, hoje: number) =>
    hoje > 0 ? `${novo >= hoje ? "+" : "−"}${Math.abs((novo / hoje - 1) * 100).toFixed(1).replace(".", ",")}%` : "—";
  return (
    <section className="rounded-xl border border-primary-fill bg-surface p-4">
      <h3 className="mb-1 text-[13px] font-semibold">Prévia — dezembro de cada ano</h3>
      <p className="mb-2 text-[11px] text-text-muted">Nada foi gravado ainda. Hoje → com as premissas desta tela.</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="text-left text-[10.5px] text-text-faint">
              <th className="py-1 pr-2 font-medium">Ano</th>
              {produtos.map((p) => (
                <th key={p.id} className="px-2 py-1 text-right font-medium">
                  {p.nome.replace(/^Fashion /, "")}
                </th>
              ))}
              <th className="px-2 py-1 text-right font-medium">Total MRR</th>
            </tr>
          </thead>
          <tbody>
            {anos.map((ano) => {
              const doAno = linhas.filter((l) => l.ano === ano);
              const hoje = doAno.reduce((s, l) => s + l.mrrHoje, 0);
              const novo = doAno.reduce((s, l) => s + l.mrrNovo, 0);
              return (
                <tr key={ano} className="border-t border-border-soft align-top">
                  <td className="py-1.5 pr-2 font-mono">{ano}</td>
                  {produtos.map((p) => {
                    const l = doAno.find((x) => x.produtoId === p.id);
                    return (
                      <td key={p.id} className="px-2 py-1.5 text-right font-mono">
                        {l ? (
                          <Fragment>
                            <div>
                              {brl(l.mrrHoje)} → {brl(l.mrrNovo)}
                            </div>
                            <div className="text-[10px] text-text-faint">
                              {Math.round(l.clientesHoje)} → {Math.round(l.clientesNovo)} clientes
                            </div>
                          </Fragment>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right font-mono">
                    <div>
                      {brl(hoje)} → {brl(novo)}
                    </div>
                    <div className="text-[10px] text-text-faint">{delta(novo, hoje)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
