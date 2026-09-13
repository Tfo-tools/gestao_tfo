"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { salvarGradeProdutos, type ActionState } from "./actions";
import { FASES } from "@/lib/fases";
import { SeloStatus } from "./status-produto";
import { datasTravadas, type StatusProduto } from "@/lib/fases-produto";
import { InfoTooltip } from "@/components/info-tooltip";

export type ProdutoGrade = {
  id: string;
  nome: string;
  descricao: string | null;
  status: StatusProduto;
  data_inicio_desenvolvimento: string | null;
  data_lancamento_estimada: string | null;
  fases: Record<
    string,
    { data_inicio: string | null; data_fim: string | null }
  >;
};

const initialState: ActionState = { error: null };

const LABEL_CURTO: Record<string, string> = {
  ideacao: "Ideação",
  validacao: "Validação",
  pmf: "PMF",
  tracao: "Tração",
  escala: "Escala",
  maturidade: "Maturidade",
};

/**
 * Um produto por linha (duas, com as fases abertas: Início / Fim). Tudo se edita direto na célula
 * e salva de uma vez — as fases ficam escondidas atrás do "+" porque no dia a dia o que se olha é
 * status e lançamento; o nome abre a precificação.
 */
export function GradeProdutos({
  produtos,
  cenarioId,
}: {
  produtos: ProdutoGrade[];
  cenarioId: string;
}) {
  const [state, formAction, pending] = useActionState(
    salvarGradeProdutos,
    initialState,
  );
  const [mostrarFases, setMostrarFases] = useState(false);
  const [sujo, setSujo] = useState(false);

  if (produtos.length === 0) {
    return (
      <p className="text-[13px] text-text-muted">
        Nenhum produto cadastrado ainda.
      </p>
    );
  }

  const hrefProduto = (id: string) =>
    cenarioId ? `/produtos/${id}?cenario=${cenarioId}` : `/produtos/${id}`;

  return (
    <form
      action={(fd) => {
        const linhas = produtos.map((p) => {
          const v = (name: string) =>
            String(fd.get(`${p.id}__${name}`) || "").trim() || null;
          return {
            produto_id: p.id,
            data_inicio_desenvolvimento: v("inicio_dev"),
            data_lancamento_estimada: v("lancamento"),
            fases: FASES.map((f) => ({
              fase: f.value,
              data_inicio: v(`${f.value}__inicio`),
              data_fim: v(`${f.value}__fim`),
            })),
          };
        });
        const out = new FormData();
        out.set("linhas", JSON.stringify(linhas));
        formAction(out);
        setSujo(false);
      }}
      onChange={() => setSujo(true)}
      className="rounded-xl border border-border bg-surface"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setMostrarFases((v) => !v)}
          className="flex items-center gap-1.5 text-[11.5px] font-medium text-primary-deep"
          aria-expanded={mostrarFases}
        >
          <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-primary-fill text-[12px] leading-none">
            {mostrarFases ? "−" : "+"}
          </span>
          {mostrarFases
            ? "Ocultar fases do ciclo de vida"
            : "Fases do ciclo de vida"}
          <InfoTooltip texto="Início e fim de cada fase são do PRODUTO: valem em todos os cenários e ficam congelados quando o produto passa a iniciado. Crescimento, churn e conversão são de cada cenário e ficam em Vendas. Maturidade pode ficar sem data de fim." />
        </button>
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
            <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-text-faint">
              <th className="px-4 py-2">Produto</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Início dev.</th>
              <th className="px-3 py-2">Lançamento previsto</th>
              {mostrarFases && (
                <th className="border-l border-border-soft px-2 py-2"></th>
              )}
              {mostrarFases &&
                FASES.map((f) => (
                  <th
                    key={f.value}
                    className="border-l border-border-soft px-2 py-2 text-center"
                  >
                    {LABEL_CURTO[f.value]}
                  </th>
                ))}
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => {
              const travado = datasTravadas(p.status);
              return (
                <LinhaProduto
                  key={p.id}
                  produto={p}
                  travado={travado}
                  mostrarFases={mostrarFases}
                  href={hrefProduto(p.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}

function LinhaProduto({
  produto: p,
  travado,
  mostrarFases,
  href,
}: {
  produto: ProdutoGrade;
  travado: boolean;
  mostrarFases: boolean;
  href: string;
}) {
  const celulaFase = (fase: string, campo: "inicio" | "fim") => {
    const d = p.fases[fase];
    const valor = campo === "inicio" ? d?.data_inicio : d?.data_fim;
    return (
      <td
        key={`${fase}-${campo}`}
        className="border-l border-border-soft px-1 py-0.5"
      >
        <input
          type="date"
          name={`${p.id}__${fase}__${campo}`}
          defaultValue={valor ?? ""}
          disabled={travado}
          className="w-full min-w-[128px] border-none bg-transparent font-mono text-[11.5px] outline-none disabled:text-text-faint"
        />
      </td>
    );
  };

  const linhasFase = mostrarFases ? 2 : 1;

  return (
    <>
      <tr className="border-t border-border-soft align-middle">
        <td rowSpan={linhasFase} className="px-4 py-2">
          <Link
            href={href}
            className="text-[12.5px] font-semibold text-primary-deep hover:underline"
            title="Abrir precificação"
          >
            {p.nome}
          </Link>
          {p.descricao && (
            <div className="max-w-[260px] truncate text-[10.5px] text-text-faint">
              {p.descricao}
            </div>
          )}
        </td>
        <td rowSpan={linhasFase} className="px-3 py-2">
          <SeloStatus status={p.status} />
        </td>
        <td rowSpan={linhasFase} className="px-2 py-1">
          <input
            type="date"
            name={`${p.id}__inicio_dev`}
            defaultValue={p.data_inicio_desenvolvimento ?? ""}
            className="w-full min-w-[128px] border-none bg-transparent font-mono text-[11.5px] outline-none"
          />
        </td>
        <td rowSpan={linhasFase} className="px-2 py-1">
          <input
            type="date"
            name={`${p.id}__lancamento`}
            defaultValue={p.data_lancamento_estimada ?? ""}
            className="w-full min-w-[128px] border-none bg-transparent font-mono text-[11.5px] outline-none"
          />
        </td>
        {mostrarFases && (
          <td className="border-l border-border-soft px-2 py-0.5 text-[10px] font-medium text-text-muted">
            Início
          </td>
        )}
        {mostrarFases && FASES.map((f) => celulaFase(f.value, "inicio"))}
        <td rowSpan={linhasFase} className="px-3 py-2 text-right">
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-muted hover:border-primary-fill hover:text-primary-deep"
            title="Planos, módulos e implantação"
          >
            <span aria-hidden>R$</span> Precificação
          </Link>
          {travado && (
            <div className="mt-1 text-[9.5px] text-text-faint">
              fases congeladas
            </div>
          )}
        </td>
      </tr>
      {mostrarFases && (
        <tr className="align-middle">
          <td className="border-l border-border-soft px-2 py-0.5 text-[10px] font-medium text-text-muted">
            Fim
          </td>
          {FASES.map((f) => celulaFase(f.value, "fim"))}
        </tr>
      )}
    </>
  );
}
