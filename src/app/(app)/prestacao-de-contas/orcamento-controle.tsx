"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirNegociado } from "./entregas-actions";
import { atribuirRubrica } from "./planilha-actions";
import { DossieCelula } from "./dossie-celula";
import type { OrcamentoTempo, LinhaOrc, EstadoMes } from "@/lib/orcamento-tempo";
import type { Prestacao, DespesaCel } from "@/lib/prestacao";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const sgn = (v: number) => (v > 0 ? "+ " : v < 0 ? "− " : "") + fmt(Math.abs(v)).replace("R$ ", "R$ ");
const r2 = (v: number) => Math.round(v * 100) / 100;
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ym: string) => `${MES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const dataBR = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const ESTADO: Record<EstadoMes, string> = { previsto: "Previsto", negociado: "Negociado", realizado: "Realizado" };

const CELL: Record<EstadoMes, string> = {
  previsto: "bg-bg text-text-muted",
  negociado: "bg-primary-soft text-primary-deep",
  realizado: "bg-success-soft text-success",
};
const COL1 = "sticky left-0 z-10 bg-surface min-w-[210px] max-w-[260px]";

/**
 * Tabela única de orçamento: uma linha por rúbrica × mês, com UM valor por célula que muda de estado
 * (previsto → negociado → realizado), consolidado, controle de estouro vs. o teto do fomento, e a
 * contrapartida marcada à parte (não conta no teto). Clicar numa célula abre o dossiê de comprovação
 * daquele mês (cotações, NF, comprovante); clicar na rúbrica define o valor negociado. Abaixo: bolsa,
 * total geral e despesas a classificar.
 */
export function OrcamentoControle({
  orcamento,
  prestacao,
  rubricasOpcoes,
  podeEditar,
}: {
  orcamento: OrcamentoTempo;
  prestacao: Prestacao;
  rubricasOpcoes: { id: string; nome: string }[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editar, setEditar] = useState<LinhaOrc | null>(null);
  const [dossie, setDossie] = useState<{ rubricaId: string; rubrica: string; mes: string } | null>(null);
  const { meses, linhas, previstoMes, projecaoMes, estouroMes, previstoTotal, projecaoTotal, estouroTotal } = orcamento;

  // Comprovação por célula: rubricaId|mes -> despesas daquele mês.
  const despMap = new Map<string, DespesaCel[]>();
  for (const r of [...prestacao.rubricas, ...prestacao.contrapartida, ...prestacao.bolsa])
    for (const [mes, cel] of Object.entries(r.porMes)) despMap.set(`${r.id}|${mes}`, cel.despesas);

  const fomento = linhas.filter((l) => !l.contrapartida);
  const contrap = linhas.filter((l) => l.contrapartida);
  const totalFomento = r2(fomento.reduce((s, l) => s + l.aprovado, 0));
  const totalContrap = r2(contrap.reduce((s, l) => s + l.aprovado, 0));
  const bolsaTotal = r2(prestacao.bolsa.reduce((s, r) => s + r.totalPrevisto, 0));
  const totalGeral = r2(totalFomento + totalContrap + bolsaTotal);
  const contrapMes = meses.map((_, i) => r2(contrap.reduce((s, l) => s + l.meses[i].val, 0)));
  const contrapCons = r2(contrap.reduce((s, l) => s + l.consolidado, 0));
  const naoAtribuidas = prestacao.naoAtribuidas;

  if (linhas.length === 0 && prestacao.bolsa.length === 0) return null;

  const classificar = (despesaId: string, rubricaId: string) => start(async () => { await atribuirRubrica(despesaId, rubricaId || null); router.refresh(); });

  const linhaRow = (l: LinhaOrc) => {
    const temDelta = l.meses.some((c) => c.delta !== 0);
    return (
      <Fragment key={l.id}>
        <tr className="border-t border-border-soft">
          <td className={`${COL1} px-3 py-2 ${l.contrapartida ? "border-l-[3px] border-l-wine" : ""}`}>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!podeEditar}
                onClick={() => podeEditar && setEditar(l)}
                className={`text-left font-medium leading-tight ${podeEditar ? "hover:text-primary-deep" : "cursor-default"}`}
                title={podeEditar ? "Definir o valor negociado" : l.atividade}
              >
                {l.rubrica}
              </button>
              {l.contrapartida && <span className="shrink-0 rounded-full bg-wine-soft px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-wine">contrapartida</span>}
            </div>
            {l.contrapartida && l.atividade && <div className="mt-0.5 text-[10px] font-normal leading-snug text-text-faint">{l.atividade}</div>}
          </td>
          <td className="px-2 py-2"><span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${CELL[l.estado]}`}>{ESTADO[l.estado]}</span></td>
          {l.meses.map((c, i) => (
            <td key={i} className="px-2 py-2 text-right">
              <button
                type="button"
                onClick={() => setDossie({ rubricaId: l.rubricaId, rubrica: l.rubrica, mes: meses[i] })}
                title="Ver / anexar comprovação deste mês"
                className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold hover:ring-1 hover:ring-wine ${CELL[c.estado]}`}
              >
                {fmt(c.val)}
              </button>
            </td>
          ))}
          <td className="border-l border-border px-3 py-2 text-right">
            <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${CELL[l.estado]}`}>{fmt(l.consolidado)}</span>
          </td>
        </tr>
        {temDelta && (
          <tr className="text-[10px]">
            <td className={`${COL1} px-3 pb-2 pt-0 text-[10px] font-normal text-text-faint`}>↳ Δ previsto × executado (aprovado {fmt(l.aprovado)})</td>
            <td className={`px-2 pb-2 pt-0 ${l.deltaConsolidado > 0 ? "text-danger" : "text-success"}`}>{l.deltaConsolidado > 0 ? "estouro" : "economia"}</td>
            {l.meses.map((c, i) => (
              <td key={i} className={`px-2 pb-2 pt-0 text-right font-mono ${c.delta > 0 ? "text-danger" : c.delta < 0 ? "text-success" : "text-text-faint"}`}>
                {c.delta !== 0 ? sgn(c.delta) : "—"}
              </td>
            ))}
            <td className={`border-l border-border px-3 pb-2 pt-0 text-right font-mono ${l.deltaConsolidado > 0 ? "text-danger" : "text-success"}`}>{sgn(l.deltaConsolidado)}</td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className={`${COL1} px-3 py-2 text-left font-medium`}>Rubrica</th>
              <th className="px-2 py-2 text-left font-medium">Estado</th>
              {meses.map((m) => (<th key={m} className="whitespace-nowrap px-2 py-2 text-right font-medium">{rotuloMes(m)}</th>))}
              <th className="whitespace-nowrap border-l border-border px-3 py-2 text-right font-semibold">Consolidado</th>
            </tr>
          </thead>
          <tbody>
            {fomento.map(linhaRow)}

            <tr className="border-t-2 border-border bg-bg font-semibold">
              <td className={`${COL1} bg-bg px-3 py-2`}>Previsto fomento</td><td></td>
              {previstoMes.map((v, i) => (<td key={i} className="px-2 py-2 text-right font-mono">{fmt(v)}</td>))}
              <td className="border-l border-border px-3 py-2 text-right font-mono">{fmt(previstoTotal)}</td>
            </tr>
            <tr className="border-t border-border bg-primary-soft/40 font-semibold">
              <td className={`${COL1} bg-primary-soft/40 px-3 py-2`}>Projeção</td><td></td>
              {projecaoMes.map((v, i) => (<td key={i} className="px-2 py-2 text-right font-mono">{fmt(v)}</td>))}
              <td className="border-l border-border px-3 py-2 text-right font-mono">{fmt(projecaoTotal)}</td>
            </tr>
            <tr className="border-t border-border bg-danger-soft font-semibold text-danger">
              <td className={`${COL1} bg-danger-soft px-3 py-2 text-danger`}>Estouro</td><td></td>
              {estouroMes.map((v, i) => (<td key={i} className="px-2 py-2 text-right font-mono">{v !== 0 ? sgn(v) : "—"}</td>))}
              <td className="border-l border-border px-3 py-2 text-right font-mono">{estouroTotal !== 0 ? sgn(estouroTotal) : fmt(0)}</td>
            </tr>

            {contrap.length > 0 && contrap.map(linhaRow)}
            {contrap.length > 0 && (
              <tr className="border-t-2 border-border bg-wine-soft/40 font-semibold text-wine-deep">
                <td className={`${COL1} bg-wine-soft/40 px-3 py-2`}>Subtotal contrapartida</td><td></td>
                {contrapMes.map((v, i) => (<td key={i} className="px-2 py-2 text-right font-mono">{fmt(v)}</td>))}
                <td className="border-l border-border px-3 py-2 text-right font-mono">{fmt(contrapCons)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-bg ring-1 ring-border" /> previsto (aprovado)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-primary-soft ring-1 ring-primary-fill" /> negociado (orçamento fechado)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-success-soft ring-1 ring-success" /> realizado (pago)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-wine-soft ring-1 ring-wine" /> <span className="font-semibold text-wine-deep">contrapartida</span> (recurso da TFO, fora do teto)</span>
        <span className="text-text-faint">· clique numa célula pra ver/anexar a comprovação do mês.</span>
      </div>

      {prestacao.bolsa.length > 0 && (
        <div className="rounded-xl border border-border bg-bg/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[12.5px] font-semibold">Bolsa</h3>
            <span className="font-mono text-[12.5px] font-semibold">{fmt(bolsaTotal)}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-text-muted">Aguardando data de início e parcelas — ainda sem orientação da FAPES. Não entra no teto do fomento nem na distribuição mensal acima.</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-wine/30 bg-wine-soft/40 px-4 py-3">
        <span className="font-heading text-[13px] font-semibold text-wine-deep">Total geral</span>
        <span className="text-right">
          <span className="font-mono text-[15px] font-bold">{fmt(totalGeral)}</span>
          <span className="ml-2 text-[10.5px] text-text-muted">fomento {fmt(totalFomento)}{totalContrap > 0 ? ` + contrapartida ${fmt(totalContrap)}` : ""}{bolsaTotal > 0 ? ` + bolsa ${fmt(bolsaTotal)}` : ""}</span>
        </span>
      </div>

      {naoAtribuidas.length > 0 && (
        <div className="rounded-xl border border-wine/30 bg-wine-soft/40 p-4">
          <h3 className="mb-1 text-[12.5px] font-semibold text-wine-deep">Despesas a classificar ({naoAtribuidas.length})</h3>
          <p className="mb-2 text-[11px] text-text-muted">Despesas que comprovam o programa mas ainda não têm rubrica — escolha a rubrica pra elas entrarem na tabela.</p>
          <div className="flex flex-col gap-1.5">
            {naoAtribuidas.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-[12px]">
                <span className="min-w-0"><span className="font-medium">{d.descricao}</span> <span className="text-text-faint">· {dataBR(d.data_gasto)} · {fmt(d.valor)}</span></span>
                <select disabled={pending} defaultValue="" onChange={(e) => classificar(d.id, e.target.value)} className="input input-compacto w-[200px]">
                  <option value="">Escolher rubrica…</option>
                  {rubricasOpcoes.map((r) => (<option key={r.id} value={r.id}>{r.nome}</option>))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {editar && (
        <ModalNegociado
          linha={editar}
          pending={pending}
          onClose={() => setEditar(null)}
          onSalvar={(valor) => start(async () => { await definirNegociado(editar.id, valor); setEditar(null); router.refresh(); })}
        />
      )}

      {dossie && (
        <DossieCelula
          titulo={dossie.rubrica}
          subtitulo={`${rotuloMes(dossie.mes)} · comprovação do mês`}
          despesas={despMap.get(`${dossie.rubricaId}|${dossie.mes}`) ?? []}
          podeEditar={podeEditar}
          onClose={() => setDossie(null)}
        />
      )}
    </div>
  );
}

function ModalNegociado({ linha, pending, onClose, onSalvar }: { linha: LinhaOrc; pending: boolean; onClose: () => void; onSalvar: (v: number | null) => void }) {
  const [valor, setValor] = useState(linha.negociado != null ? String(linha.negociado) : "");
  const num = valor.trim() === "" ? null : Number(valor.replace(/\./g, "").replace(",", "."));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="mt-10 w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="font-heading text-sm font-semibold">{linha.rubrica}</h3>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[16px] leading-none text-text-muted hover:bg-bg">✕</button>
        </div>
        <p className="mb-3 text-[11.5px] text-text-muted">Aprovado (previsto): <b>{fmt(linha.aprovado)}</b>. Informe o valor do <b>orçamento fechado</b> — vira o valor oficial da linha.</p>
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
          Valor negociado
          <input autoFocus inputMode="decimal" className="input" placeholder="ex.: 23.000,00" value={valor} onChange={(e) => setValor(e.target.value)} />
        </label>
        {num != null && Number.isFinite(num) && (
          <p className={`mt-2 text-[11.5px] font-medium ${num - linha.aprovado > 0 ? "text-danger" : num - linha.aprovado < 0 ? "text-success" : "text-text-muted"}`}>
            {num - linha.aprovado > 0 ? "Estouro" : num - linha.aprovado < 0 ? "Economia" : "Igual ao aprovado"}: {sgn(Math.round((num - linha.aprovado) * 100) / 100)}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" disabled={pending} onClick={() => onSalvar(null)} className="text-[11.5px] text-text-muted underline">limpar (volta ao previsto)</button>
          <button
            type="button" disabled={pending || num == null || !Number.isFinite(num)}
            onClick={() => onSalvar(Math.round((num as number) * 100) / 100)}
            className="rounded-lg bg-primary-fill px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-primary disabled:opacity-50"
          >Salvar negociado</button>
        </div>
        {pending && <p className="mt-2 text-[11px] text-text-faint">salvando…</p>}
      </div>
    </div>
  );
}
