"use client";

import { Fragment, useActionState, useState } from "react";
import { salvarPlanejamentoGrade, type CurvaActionState } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";

export type TrimestreDados = {
  indice: number;
  taxa_crescimento_mensal: number | null;
  taxa_churn_mensal: number | null;
};

type FaseDados = {
  taxa_crescimento_mensal: number | null;
  taxa_churn_mensal: number | null;
  capacidade_vendedor_mes: number | null;
  reunioes_por_oportunidade: number | null;
  span_of_control: number | null;
  horas_suporte_por_cliente_mes: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  trimestres: TrimestreDados[];
} | null;

/** Fim efetivo da fase pra grade: o fim cadastrado, limitado ao fim do cenário. Fase aberta
 *  (sem fim) termina no fim do cenário — não faz sentido pedir taxa pra depois do plano. */
function fimEfetivo(d: FaseDados, fimCenario: string | null): Date | null {
  const fim = d?.data_fim ? new Date(d.data_fim + "T00:00:00") : null;
  const cen = fimCenario
    ? new Date(fimCenario.slice(0, 7) + "-01T00:00:00")
    : null;
  if (fim && cen) return fim < cen ? fim : cen;
  return fim ?? cen;
}

/** Quantos blocos de 3 meses a fase tem, até o fim do cenário. Sem nenhum fim conhecido, 4 —
 *  o último bloco cadastrado vale dali em diante. */
function quantidadeTrimestres(d: FaseDados, fimCenario: string | null): number {
  if (!d?.data_inicio) return 0;
  const f = fimEfetivo(d, fimCenario);
  if (!f) return 4;
  const i = new Date(d.data_inicio + "T00:00:00");
  const meses =
    (f.getFullYear() - i.getFullYear()) * 12 +
    (f.getMonth() - i.getMonth()) +
    1;
  if (meses <= 0) return 0;
  return Math.max(1, Math.ceil(meses / 3));
}

export type ProdutoCurva = {
  id: string;
  nome: string;
  fases: { fase: string; label: string; ordem: number; dados: FaseDados }[];
};

const initialState: CurvaActionState = { error: null };

/** Cor de fundo bem leve por fase — pra situar a coluna sem pesar a grade. */
const COR_FASE: Record<string, string> = {
  ideacao: "bg-[rgba(120,120,120,0.05)]",
  validacao: "bg-[rgba(214,133,0,0.06)]",
  pmf: "bg-[rgba(0,122,180,0.06)]",
  tracao: "bg-[rgba(0,150,90,0.06)]",
  escala: "bg-[rgba(110,60,200,0.06)]",
  maturidade: "bg-[rgba(190,40,90,0.05)]",
};

const LABEL_CURTO: Record<string, string> = {
  ideacao: "Ideação",
  validacao: "Validação",
  pmf: "PMF",
  tracao: "Tração",
  escala: "Escala",
  maturidade: "Maturidade",
};

function fmtData(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

const MES_CURTO = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
function mesAno(d: Date) {
  return `${MES_CURTO[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}
/** Meses que o bloco de 3 meses cobre: "mar/27 – mai/27", "dez/28" ou "mar/28 em diante"
 *  quando não há fim conhecido e o bloco é o último. */
function rotuloTrimestre(
  d: FaseDados,
  ti: number,
  fimCenario: string | null,
): string {
  if (!d?.data_inicio) return "";
  const inicio = new Date(d.data_inicio + "T00:00:00");
  const de = new Date(inicio.getFullYear(), inicio.getMonth() + ti * 3, 1);
  const ate = new Date(de.getFullYear(), de.getMonth() + 2, 1);
  const fim = fimEfetivo(d, fimCenario);
  const fimMes = fim ? new Date(fim.getFullYear(), fim.getMonth(), 1) : null;
  if (!fimMes && ti === quantidadeTrimestres(d, fimCenario) - 1)
    return `${mesAno(de)} em diante`;
  const ultimo = fimMes && fimMes < ate ? fimMes : ate;
  if (ultimo <= de) return mesAno(de);
  return `${mesAno(de)} – ${mesAno(ultimo)}`;
}

function pctStr(v: number | null | undefined) {
  return v != null ? (v * 100).toFixed(2) : "";
}

const CAMPO =
  "w-[58px] rounded border border-border-soft bg-transparent px-1 py-0.5 text-right font-mono text-[11px] outline-none focus:border-primary-fill disabled:border-transparent";

/**
 * Uma grade só: produto nas linhas (padrão da fase + um bloco por trimestre), fases nas colunas
 * (crescimento % / churn %). Tudo se edita na célula e salva de uma vez. Célula em branco num
 * trimestre usa o padrão da fase; preenchida vale dela em diante até o próximo bloco preenchido.
 */
export function CurvaMatriz({
  cenarioId,
  produtos,
  fimCenario = null,
}: {
  cenarioId: string;
  produtos: ProdutoCurva[];
  /** Fim do período do cenário (AAAA-MM-01): a grade não pede taxa pra depois dele. */
  fimCenario?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    salvarPlanejamentoGrade,
    initialState,
  );
  const [sujo, setSujo] = useState(false);
  // Produtos recolhidos: só a linha do nome fica visível. As linhas continuam no DOM (hidden), então
  // o Salvar continua gravando os três produtos mesmo com dois recolhidos.
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const alternar = (id: string) =>
    setRecolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  if (produtos.length === 0) {
    return (
      <p className="text-[13px] text-text-muted">
        Nenhum produto cadastrado ainda — cadastre em Produtos primeiro.
      </p>
    );
  }

  const fasesRef = produtos[0].fases;

  return (
    <form
      action={(fd) => {
        const pct = (name: string) => {
          const v = fd.get(name);
          return v !== null && v !== "" ? Number(v) / 100 : null;
        };
        const fases = fasesRef.map((f, fi) => ({
          fase: f.fase,
          linhas: produtos.map((p) => {
            const d = p.fases[fi]?.dados ?? null;
            const k = (campo: string) => `${p.id}__${f.fase}__${campo}`;
            return {
              produto_id: p.id,
              taxa_crescimento_mensal: pct(k("cresc")),
              taxa_churn_mensal: pct(k("churn")),
              capacidade_vendedor_mes: null,
              trimestres: Array.from(
                { length: quantidadeTrimestres(d, fimCenario) },
                (_, i) => ({
                  indice: i,
                  taxa_crescimento_mensal: pct(k(`t${i}_cresc`)),
                  taxa_churn_mensal: pct(k(`t${i}_churn`)),
                }),
              ),
            };
          }),
        }));
        const out = new FormData();
        out.set("cenario_id", cenarioId);
        out.set("fases", JSON.stringify(fases));
        formAction(out);
        setSujo(false);
      }}
      onChange={() => setSujo(true)}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <p className="flex items-center text-[11px] text-text-muted">
          Padrão da fase vale nos trimestres em branco; trimestre preenchido
          vale dele em diante. Taxas mensais, em %.
          <InfoTooltip texto="Crescimento: a cada mês, quantos % de clientes novos em relação à base atual (só o canal direto — parceiros e ações somam por fora). Churn: taxa mensal; em planos semestrais/anuais é aplicada composta só na renovação. Cada fase é dividida em blocos de 3 meses contados do início dela; numa fase aberta (maturidade) o último bloco segue até o fim do cenário. Início e fim das fases ficam em Produtos." />
        </p>
        <div className="flex items-center gap-3">
          {state.error && (
            <span className="text-[11px] text-danger">{state.error}</span>
          )}
          {state.success && !sujo && (
            <span className="text-[11px] text-success">Salvo.</span>
          )}
          <button
            type="submit"
            disabled={pending || !sujo}
            className="rounded-lg bg-wine-deep px-3.5 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
          >
            {pending ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border-t border-border-soft">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10px] font-medium uppercase tracking-wide text-text-faint">
              <th
                className="sticky left-0 z-[1] bg-surface px-4 py-1.5 text-left"
                rowSpan={2}
              >
                Produto
              </th>
              <th
                className="sticky left-[150px] z-[1] bg-surface px-2 py-1.5 text-left"
                rowSpan={2}
              >
                Período
              </th>
              {fasesRef.map((f) => (
                <th
                  key={f.fase}
                  colSpan={2}
                  className={`border-l border-border-soft px-2 py-1.5 text-center ${COR_FASE[f.fase] ?? ""}`}
                >
                  {LABEL_CURTO[f.fase] ?? f.label}
                </th>
              ))}
            </tr>
            <tr className="text-[9.5px] font-medium text-text-faint">
              {fasesRef.map((f) => (
                <FaseSub key={f.fase} cor={COR_FASE[f.fase] ?? ""} />
              ))}
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => (
              <LinhasProduto
                key={p.id}
                produto={p}
                fimCenario={fimCenario}
                recolhido={recolhidos.has(p.id)}
                onAlternar={() => alternar(p.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}

function FaseSub({ cor }: { cor: string }) {
  return (
    <>
      <th
        className={`border-l border-border-soft px-1 pb-1 text-right font-normal ${cor}`}
      >
        cresc.
      </th>
      <th className={`px-1 pb-1 text-right font-normal ${cor}`}>churn</th>
    </>
  );
}

function LinhasProduto({
  produto: p,
  fimCenario,
  recolhido,
  onAlternar,
}: {
  produto: ProdutoCurva;
  fimCenario: string | null;
  recolhido: boolean;
  onAlternar: () => void;
}) {
  // Uma linha por bloco de 3 meses, em ordem de calendário (as fases já vêm em ordem): o rótulo é
  // o intervalo real do bloco e só a coluna da fase dele tem campos — as outras ficam vazias.
  const blocos = p.fases.flatMap((f, fi) =>
    Array.from(
      { length: quantidadeTrimestres(f.dados, fimCenario) },
      (_, ti) => ({
        fi,
        ti,
        rotulo: rotuloTrimestre(f.dados, ti, fimCenario),
      }),
    ),
  );
  const linhas = 1 + blocos.length;
  const celula = (fi: number, campo: "cresc" | "churn", ti: number | null) => {
    const f = p.fases[fi];
    const d = f?.dados ?? null;
    const semFase = !d?.data_inicio;
    const n = quantidadeTrimestres(d, fimCenario);
    if (ti !== null && ti >= n) {
      return (
        <td
          key={`${fi}-${campo}`}
          className={`px-1 py-0.5 text-center text-[10px] text-text-faint ${campo === "cresc" ? "border-l border-border-soft" : ""} ${COR_FASE[f.fase] ?? ""} ${recolhido && ti === null ? "hidden" : ""}`}
        >
          {campo === "cresc" ? "—" : ""}
        </td>
      );
    }
    const t = ti !== null ? d?.trimestres.find((x) => x.indice === ti) : null;
    const valor =
      ti === null
        ? campo === "cresc"
          ? d?.taxa_crescimento_mensal
          : d?.taxa_churn_mensal
        : campo === "cresc"
          ? t?.taxa_crescimento_mensal
          : t?.taxa_churn_mensal;
    const padrao =
      campo === "cresc" ? d?.taxa_crescimento_mensal : d?.taxa_churn_mensal;
    const name = `${p.id}__${f.fase}__${ti === null ? campo : `t${ti}_${campo}`}`;
    // Tooltip situa o bloco no calendário: "PMF · T2: jun–ago/27 · fase 12/03/27 → 01/12/27".
    const faseTxt = `${LABEL_CURTO[f.fase] ?? f.label}`;
    const periodoFase = `fase ${d?.data_inicio ? fmtData(d.data_inicio) : "—"} → ${d?.data_fim ? fmtData(d.data_fim) : "aberta"} · ${n} tri`;
    const titulo = semFase
      ? "Sem início/fim desta fase em Produtos"
      : ti === null
        ? `${faseTxt} · padrão da fase · ${periodoFase}`
        : `${faseTxt} · ${rotuloTrimestre(d, ti, fimCenario)} (bloco ${ti + 1}) · ${periodoFase}`;
    return (
      <td
        key={`${fi}-${campo}`}
        className={`px-1 py-0.5 ${campo === "cresc" ? "border-l border-border-soft" : ""} ${COR_FASE[f.fase] ?? ""} ${recolhido && ti === null ? "hidden" : ""}`}
      >
        <input
          name={name}
          type="number"
          step="0.01"
          defaultValue={pctStr(valor)}
          placeholder={ti === null ? "" : pctStr(padrao) || ""}
          disabled={semFase}
          title={titulo}
          className={CAMPO}
        />
      </td>
    );
  };

  return (
    <>
      <tr className="border-t border-border align-middle">
        <td
          rowSpan={recolhido ? 1 : linhas}
          className="sticky left-0 z-[1] w-[150px] bg-surface px-3 py-1.5 align-top text-[11.5px] font-semibold shadow-[1px_0_0_var(--color-border-soft)]"
        >
          <button
            type="button"
            onClick={onAlternar}
            className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded border border-border text-[11px] font-normal leading-none text-text-muted"
            title={
              recolhido
                ? "Mostrar as taxas deste produto"
                : "Ocultar as taxas deste produto (os valores continuam salvos)"
            }
          >
            {recolhido ? "+" : "−"}
          </button>
          {p.nome}
        </td>
        <td
          className={`sticky left-[150px] z-[1] bg-surface px-2 py-0.5 text-[9.5px] font-medium text-text-muted ${recolhido ? "hidden" : ""}`}
        >
          Padrão
        </td>
        {p.fases.map((_, fi) => (
          <Fragment key={fi}>
            {celula(fi, "cresc", null)}
            {celula(fi, "churn", null)}
          </Fragment>
        ))}
        {recolhido && (
          <td
            colSpan={p.fases.length * 2 + 1}
            className="px-2 py-1 text-[9.5px] text-text-faint"
          >
            taxas ocultas — clique em + pra editar
          </td>
        )}
      </tr>
      {blocos.map((b, i) => {
        const primeiroDaFase = i === 0 || blocos[i - 1].fi !== b.fi;
        return (
          <tr
            key={`${b.fi}-${b.ti}`}
            className={`align-middle ${primeiroDaFase ? "border-t border-border-soft" : ""} ${recolhido ? "hidden" : ""}`}
          >
            <td
              className="sticky left-[150px] z-[1] whitespace-nowrap bg-surface px-2 py-0.5 font-mono text-[9.5px] text-text-muted"
              title={`${LABEL_CURTO[p.fases[b.fi].fase] ?? p.fases[b.fi].label} · T${b.ti + 1}`}
            >
              {b.rotulo}
            </td>
            {p.fases.map((_, fi) => (
              <Fragment key={fi}>
                {fi === b.fi ? (
                  <>
                    {celula(fi, "cresc", b.ti)}
                    {celula(fi, "churn", b.ti)}
                  </>
                ) : (
                  <>
                    <td
                      className={`border-l border-border-soft px-1 py-0.5 ${COR_FASE[p.fases[fi].fase] ?? ""}`}
                    />
                    <td
                      className={`px-1 py-0.5 ${COR_FASE[p.fases[fi].fase] ?? ""}`}
                    />
                  </>
                )}
              </Fragment>
            ))}
          </tr>
        );
      })}
    </>
  );
}
