"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { alternarProdutoNoCenario } from "./produtos-cenario-actions";
import {
  LABEL_STATUS,
  STATUS_NO_PLANO,
  type StatusProduto,
} from "@/lib/fases-produto";
import { SeloStatus } from "@/app/(app)/produtos/status-produto";
import { InfoTooltip } from "@/components/info-tooltip";

type Item = {
  id: string;
  nome: string;
  status: StatusProduto;
  selecionado: boolean;
};

/**
 * Quais produtos este cenário simula.
 *
 * No Base não há escolha: ele é o plano da empresa e absorve todo produto aprovado ou iniciado.
 * Nos demais — criados pra captar investimento ou desenhar produto novo — a escolha é explícita, e
 * pode incluir produto ainda planejado ou deixar de fora um já aprovado.
 */
export function ProdutosDoCenario({
  cenarioId,
  ehBase,
  produtos,
}: {
  cenarioId: string;
  ehBase: boolean;
  produtos: Item[];
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const noPlano = produtos.filter((p) => STATUS_NO_PLANO.includes(p.status));
  // O que aparece fechado: quais produtos entram na simulação. Aberto só quando se quer mudar.
  const ativos = (ehBase ? noPlano : produtos.filter((p) => p.selecionado)).map(
    (p) => p.nome,
  );
  const resumo =
    ativos.length === 0 ? "nenhum produto na simulação" : ativos.join(" · ");

  return (
    <details className="group rounded-xl border border-border bg-surface">
      <summary className="flex cursor-pointer items-center gap-2 px-5 py-3.5 font-heading text-[13px] font-semibold">
        <span className="text-[10px] text-text-faint transition-transform group-open:rotate-90">
          ▶
        </span>
        Produtos deste cenário
        <span className="ml-2 truncate text-[11px] font-normal text-text-muted">
          {resumo}
        </span>
        <InfoTooltip
          texto={
            ehBase
              ? "O Base é o plano da empresa: absorve automaticamente todo produto aprovado ou iniciado. Para tirar um produto daqui, mude o status dele em Produtos."
              : "Marque os produtos que este cenário simula. Como ele existe para captar investimento ou desenhar produto novo, pode incluir produto ainda planejado ou deixar de fora um já aprovado. O que não está marcado é ignorado no recálculo, sem erro."
          }
        />
      </summary>
      <div className="border-t border-border-soft p-5">
        {ehBase ? (
          <>
            <p className="mb-4 text-[11px] text-text-muted">
              Plano da empresa: entram automaticamente os produtos aprovados ou
              iniciados. A escolha se faz pelo status, em{" "}
              <Link href="/produtos" className="underline">
                Produtos
              </Link>
              .
            </p>
            <div className="flex flex-col gap-1.5">
              {noPlano.length === 0 && (
                <p className="text-[12px] text-text-faint">
                  Nenhum produto aprovado ainda — enquanto isso, o plano da
                  empresa fica vazio.
                </p>
              )}
              {noPlano.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-border-soft px-2.5 py-2"
                >
                  <span className="text-[12px] font-medium">{p.nome}</span>
                  <div className="flex items-center gap-2">
                    <SeloStatus status={p.status} />
                    <span className="text-[10px] text-text-faint">
                      entrou por status
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {produtos.length > noPlano.length && (
              <p className="mt-3 text-[10.5px] text-text-faint">
                Fora do plano:{" "}
                {produtos
                  .filter((p) => !STATUS_NO_PLANO.includes(p.status))
                  .map(
                    (p) =>
                      `${p.nome} (${LABEL_STATUS[p.status].toLowerCase()})`,
                  )
                  .join(", ")}
                .
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mb-4 text-[11px] text-text-muted">
              Marque o que este cenário simula. O que ficar desmarcado é
              ignorado no recálculo, sem erro.
            </p>
            <div className="flex flex-col gap-1.5">
              {produtos.length === 0 && (
                <p className="text-[12px] text-text-faint">
                  Nenhum produto cadastrado ainda.
                </p>
              )}
              {produtos.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center justify-between rounded-md border px-2.5 py-2 ${
                    p.selecionado
                      ? "border-primary-fill bg-primary-soft"
                      : "border-border-soft"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={p.selecionado}
                      disabled={pending}
                      onChange={() =>
                        startTransition(async () => {
                          const r = await alternarProdutoNoCenario(
                            cenarioId,
                            p.id,
                            !p.selecionado,
                          );
                          setErro(r.error);
                        })
                      }
                    />
                    <span className="text-[12px] font-medium">{p.nome}</span>
                  </span>
                  <SeloStatus status={p.status} />
                </label>
              ))}
            </div>
            {erro && <p className="mt-3 text-[11px] text-danger">{erro}</p>}
            <p className="mt-3 text-[10.5px] text-text-faint">
              Depois de mudar a seleção, recalcule a projeção deste cenário.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
