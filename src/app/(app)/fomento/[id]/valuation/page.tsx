import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { QuestionarioBerkus } from "./questionario-berkus";
import { LABEL_GRAU, PILARES_BERKUS, type RespostaPilar } from "@/lib/valuation-berkus";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function ValuationEstimativaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: programa }, { data: estimativas }] = await Promise.all([
    supabase.from("programas_investimento").select("id, nome, valor_total, tipo, data_aporte").eq("id", id).single(),
    supabase.from("valuation_estimativas").select("*").eq("programa_id", id).order("created_at", { ascending: false }),
  ]);

  if (!programa) {
    return (
      <div>
        <p className="text-[13px] text-text-muted">Programa não encontrado.</p>
        <Link href="/fomento" className="text-[12.5px] text-primary-deep">
          ← Voltar pra Fomento
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2">
        <Link href="/fomento" className="text-[12.5px] text-text-muted">
          ← Fomento &amp; Investimento
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">Estimativa de pré-money — {programa.nome}</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Aporte de {formatBRL(Number(programa.valor_total))} · responda o questionário e o sistema sugere um pré-money justificável
        </p>
      </div>

      <QuestionarioBerkus programaId={programa.id} dataAporteAtual={programa.data_aporte} />

      {(estimativas ?? []).length > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-4 font-heading text-sm font-semibold">Histórico de estimativas</h2>
          <div className="flex flex-col gap-4">
            {(estimativas ?? []).map((e) => {
              const respostas = e.respostas as Record<string, RespostaPilar>;
              return (
                <div key={e.id} className="rounded-lg border border-border-soft p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] text-text-faint">{formatDate(e.created_at)}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10.5px] font-semibold ${
                        e.decisao === "acatado" ? "bg-success-soft text-success" : "bg-primary-soft text-primary-deep"
                      }`}
                    >
                      {e.decisao === "acatado" ? "Sugestão acatada" : "Valor ajustado"}
                    </span>
                  </div>
                  <div className="mb-2 flex items-center gap-4 text-[13px]">
                    <span>
                      Sugerido: <strong className="font-mono">{formatBRL(Number(e.valor_sugerido))}</strong>
                    </span>
                    {e.decisao === "alterado" && (
                      <span>
                        Final: <strong className="font-mono text-primary-deep">{formatBRL(Number(e.valor_final))}</strong>
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-text-muted">
                    {PILARES_BERKUS.map((p) => {
                      const r = respostas[p.chave];
                      if (!r) return null;
                      return (
                        <div key={p.chave}>
                          {p.label}: <strong>{LABEL_GRAU[r.grau]}</strong>
                          {r.observacao && <span className="text-text-faint"> — {r.observacao}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {e.observacoes && <p className="mt-2 text-[12px] text-text-faint">Obs: {e.observacoes}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
