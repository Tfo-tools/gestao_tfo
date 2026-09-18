"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import type { FaseValue } from "@/lib/fases";
import {
  churnAnualParaMensal,
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
  const usarSugerido = () => {
    setMetas((ms) => ms.map((m) => (m.ano === anoAberto ? { ...m, metasProduto: { ...m.metasProduto, ...sugeridas } } : m)));
    setVersao((v) => v + 1);
    setSujo(true);
  };

  /**
   * Leva as metas por produto para as fases: desloca o crescimento mensal de cada fase pela
   * diferença entre a meta e o que a projeção atual entrega no ano (média dos anos que a fase
   * atravessa). É um ajuste — a prévia mostra onde ficou.
   */
  const levarMetasAsFases = () => {
    setProdutos((atual) => {
      const novo = { ...atual };
      for (const p of dados.produtos) {
        const deslocPorAno = new Map<number, number>();
        for (const m of metas) {
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
    });
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

  const payload = (): PayloadPlanoReceita => ({
    pctVendasCombo: pctCombo,
    pesos: Object.fromEntries(dados.produtos.map((p) => [p.id, pesoDe(p.id)])),
    metas: metas.map((m) => ({ ano: m.ano, crescimento: m.crescimento, metasProduto: m.metasProduto })),
    produtos: dados.produtos.map((p) => ({
      id: p.id,
      fases: produtos[p.id].fases.map(({ fase, cresc_inicio, cresc_alvo, churn_inicio, churn_alvo }) => ({
        fase,
        cresc_inicio,
        cresc_alvo,
        churn_inicio,
        churn_alvo,
      })),
      sazonalidade: produtos[p.id].sazonalidade,
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
  const salvar = () =>
    startTransition(async () => {
      setErro(null);
      const r = await salvarPlanoReceita(cenarioId, payload());
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
          <h3 className="text-[13px] font-semibold">2 · Por fase de vida do produto</h3>
          <div className="flex gap-1">
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
        </div>
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
        <FimDasFases produto={prodAberto} fases={fasesAbertas} fim={dados.fim} />
      </section>

      {/* 3 · Sazonalidade */}
      <section className="rounded-xl border border-border-soft bg-surface p-4">
        <h3 className="text-[13px] font-semibold">3 · Sazonalidade das vendas</h3>
        <p className="mb-3 text-[11px] text-text-muted">
          1,00 = mês médio. O total do ano não muda, só a distribuição entre os meses. É a curva de venda do produto: vale
          para todos os cenários planejados pela receita.
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
        {ok && !sujo && <span className="text-[11px] text-success">Salvo e recalculado.</span>}
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

/** Clientes e receita no último mês de cada fase, na projeção atual. */
function FimDasFases({
  produto,
  fases,
  fim,
}: {
  produto: DadosPlanoReceita["produtos"][number];
  fases: FaseTela[];
  fim: string;
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
      <p className="col-span-full text-[10px] text-text-faint">Projeção atual — muda depois de salvar e recalcular.</p>
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
