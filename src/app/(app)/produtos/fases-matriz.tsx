"use client";

import { useActionState, useRef } from "react";
import { salvarFasesDatas, type CurvaActionState } from "../plano/[cenarioId]/vendas/actions";
import { InfoTooltip } from "@/components/info-tooltip";

type FaseDados = {
  data_inicio: string | null;
  data_fim: string | null;
} | null;

export type ProdutoFases = {
  id: string;
  nome: string;
  fases: { fase: string; label: string; ordem: number; dados: FaseDados }[];
};

const initialState: CurvaActionState = { error: null };

/**
 * As datas são dado do PRODUTO: gravadas uma vez, valem em todos os cenários vinculados.
 * O `cenarioId` aqui não é chave de nada — serve só pra action saber qual tela revalidar.
 */
export function FasesMatriz({ cenarioId, produtos }: { cenarioId: string; produtos: ProdutoFases[] }) {
  if (produtos.length === 0) {
    return <p className="text-[13px] text-text-muted">Nenhum produto cadastrado ainda.</p>;
  }

  const fasesRef = produtos[0].fases;

  return (
    <div className="flex flex-col gap-3">
      {fasesRef.map((faseRef, i) => (
        <FaseSecao
          key={faseRef.fase}
          cenarioId={cenarioId}
          fase={faseRef.fase}
          label={faseRef.label}
          ordem={i + 1}
          produtos={produtos.map((p) => ({
            id: p.id,
            nome: p.nome,
            dados: p.fases[i]?.dados ?? null,
          }))}
        />
      ))}
    </div>
  );
}

function FaseSecao({
  cenarioId,
  fase,
  label,
  ordem,
  produtos,
}: {
  cenarioId: string;
  fase: string;
  label: string;
  ordem: number;
  produtos: { id: string; nome: string; dados: FaseDados }[];
}) {
  const [state, formAction, pending] = useActionState(salvarFasesDatas, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const semDataFimOk = fase === "maturidade";

  return (
    <div className="rounded-lg border border-border-soft overflow-hidden">
      <div className="flex items-center justify-between bg-primary-soft px-4 py-2.5">
        <span className="text-[12.5px] font-semibold">
          {ordem}. {label}
        </span>
        <span className="text-[10px] text-primary-deep/70">vale em todos os cenários</span>
      </div>

      <form
        ref={formRef}
        action={(formData) => {
          const linhas = produtos.map((p) => {
            const get = (name: string) => formData.get(`${p.id}__${name}`);
            const str = (name: string) => {
              const v = String(get(name) || "").trim();
              return v || null;
            };
            return {
              produto_id: p.id,
              data_inicio: str("data_inicio"),
              data_fim: str("data_fim"),
            };
          });
          const fd = new FormData();
          fd.set("cenario_id", cenarioId);
          fd.set("fase", fase);
          fd.set("linhas", JSON.stringify(linhas));
          formAction(fd);
        }}
        className="overflow-x-auto"
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-[160px]"></th>
              {produtos.map((p) => (
                <th
                  key={p.id}
                  className="border-l border-border-soft px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-text-faint"
                >
                  {p.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <LinhaMatriz label="Início da fase">
              {produtos.map((p) => (
                <TdInput key={p.id} name={`${p.id}__data_inicio`} type="date" defaultValue={p.dados?.data_inicio ?? ""} />
              ))}
            </LinhaMatriz>
            <LinhaMatriz label="Fim da fase" tooltip={semDataFimOk ? "Maturidade pode ficar sem data de fim." : undefined}>
              {produtos.map((p) => (
                <TdInput key={p.id} name={`${p.id}__data_fim`} type="date" defaultValue={p.dados?.data_fim ?? ""} />
              ))}
            </LinhaMatriz>
          </tbody>
        </table>

        <div className="flex items-center gap-3 p-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
          >
            {pending ? "Salvando…" : "Salvar fase"}
          </button>
          {state.error && <p className="text-[11.5px] text-danger">{state.error}</p>}
          {state.success && <p className="text-[11.5px] text-success">Fase salva.</p>}
        </div>
      </form>
    </div>
  );
}

function LinhaMatriz({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <tr>
      <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
        <span className="flex items-center">
          {label}
          {tooltip && <InfoTooltip texto={tooltip} />}
        </span>
      </th>
      {children}
    </tr>
  );
}

function TdInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <td className="border-l border-t border-border-soft px-2 py-1.5">
      <input {...props} className="w-full border-none bg-transparent font-mono text-[12px] outline-none" />
    </td>
  );
}
