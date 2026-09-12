"use client";

import { useSearchParams } from "next/navigation";
import { InfoTooltip } from "@/components/info-tooltip";
import { simularRetornoInvestidor, type BaseSaida } from "@/lib/retorno-investidor";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function formatMes(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

/**
 * Simulação da rodada: quanto o investidor recebe de volta e em quanto tempo.
 *
 * A TIR do projeto (fluxo da empresa) não é o retorno do investidor — ela credita 100% do caixa da
 * empresa a quem comprou uma fatia. Aqui o retorno é o que a participação vale na saída: valor da
 * empresa (múltiplo de ARR ou de EBITDA no fim do período) × a fatia dele, contra o capital
 * aportado. Todos os campos são editáveis e nada aqui altera o programa cadastrado em Fomento.
 */
export function SimuladorRetorno({
  capitalPadrao,
  equityPadrao,
  mesAportePadrao,
  mesSaida,
  arrNaSaida,
  ebitdaNaSaida,
  paybackMes,
  paybackMeses,
  capitalRecuperadoPct,
  tirProjetoPct,
  nomeRodada,
}: {
  capitalPadrao: number;
  equityPadrao: number;
  mesAportePadrao: string;
  mesSaida: string;
  arrNaSaida: number;
  ebitdaNaSaida: number;
  paybackMes: string | null;
  paybackMeses: number | null;
  capitalRecuperadoPct: number | null;
  tirProjetoPct: number | null;
  nomeRodada: string | null;
}) {
  const params = useSearchParams();
  const num = (chave: string, padrao: number) => {
    const v = params.get(chave);
    const n = v != null && v !== "" ? Number(v.replace(",", ".")) : NaN;
    return Number.isFinite(n) ? n : padrao;
  };
  const capital = num("capital", capitalPadrao);
  const equity = num("equity", equityPadrao);
  const multiplo = num("multiplo", 5);
  const base = (params.get("base") === "ebitda" ? "ebitda" : "arr") as BaseSaida;
  const mesAporte = params.get("aporte") || mesAportePadrao;

  const r = simularRetornoInvestidor({
    valorInvestido: capital,
    mesAporte,
    equityPct: equity,
    multiploSaida: multiplo,
    baseSaida: base,
    arrNaSaida,
    ebitdaNaSaida,
    mesSaida,
  });

  const escondidos = ["aba", "cenario", "inicio", "fim"].filter((k) => params.get(k));

  return (
    <div className="mb-5 rounded-xl border border-primary-fill/60 bg-primary-soft/20 p-6">
      <h2 className="mb-1 flex items-center font-heading text-sm font-semibold">
        Simulação de retorno da rodada{nomeRodada ? ` — ${nomeRodada}` : ""}
        <InfoTooltip texto="O que o investidor recebe de volta: valor da empresa na saída (múltiplo de ARR ou de EBITDA do fim do período) × a fatia dele, comparado com o capital aportado. Editar aqui não altera o programa cadastrado em Fomento — serve pra testar valores de rodada e de saída." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Os valores vêm da rodada cadastrada e podem ser trocados aqui. Saída projetada em {formatMes(mesSaida)} — fim do período
        selecionado.
      </p>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2.5">
        {escondidos.map((k) => (
          <input key={k} type="hidden" name={k} value={params.get(k) ?? ""} />
        ))}
        <div className="form-campo">
          <label className="flex items-center">
            Capital da rodada (R$)
            <InfoTooltip texto="Quanto entra de investimento novo. Trocar aqui só muda esta simulação." />
          </label>
          <input name="capital" type="number" step="1000" min="0" defaultValue={Math.round(capital)} className="input campo-dinheiro" />
        </div>
        <div className="form-campo">
          <label className="flex items-center">
            Fatia do investidor (%)
            <InfoTooltip texto="Participação depois da rodada: capital ÷ valuation pós-money. Ex: R$ 500 mil por um pós-money de R$ 5 mi = 10%." />
          </label>
          <input name="equity" type="number" step="0.1" min="0" max="100" defaultValue={Number(equity.toFixed(2))} className="input campo-pct" />
        </div>
        <div className="form-campo">
          <label>Mês do aporte</label>
          <input name="aporte" type="month" defaultValue={mesAporte.slice(0, 7)} className="input" />
        </div>
        <div className="form-campo">
          <label className="flex items-center">
            Múltiplo de saída
            <InfoTooltip texto="Quantas vezes a base a empresa vale na saída. SaaS B2B costuma ser avaliado entre 3x e 8x ARR (ou 8x a 15x EBITDA), conforme crescimento e retenção." />
          </label>
          <input name="multiplo" type="number" step="0.5" min="0" defaultValue={multiplo} className="input campo-num" />
        </div>
        <div className="form-campo">
          <label>Base da saída</label>
          <select name="base" defaultValue={base} className="input">
            <option value="arr">ARR (MRR × 12)</option>
            <option value="ebitda">EBITDA (12 meses)</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12.5px] font-medium text-white">
          Simular
        </button>
      </form>

      <div className="grid grid-cols-4 gap-4">
        <Item
          label="Valor da empresa na saída"
          valor={formatBRL(r.valorEmpresaNaSaida)}
          detalhe={`${multiplo.toLocaleString("pt-BR")}× ${base === "arr" ? "ARR" : "EBITDA"} de ${formatBRL(r.baseValor)}`}
        />
        <Item
          label="Participação do investidor"
          valor={formatBRL(r.valorParticipacao)}
          detalhe={`${equity.toFixed(1).replace(".", ",")}% na saída, sobre ${formatBRL(capital)} aportados`}
        />
        <Item
          label="MOIC · ROI"
          valor={r.moic != null ? `${r.moic.toFixed(1).replace(".", ",")}x` : "—"}
          detalhe={r.roiPct != null ? `ROI de ${r.roiPct.toFixed(0)}% em ${r.anos?.toFixed(1).replace(".", ",")} anos` : "informe o capital"}
        />
        <Item
          label="TIR do investidor"
          valor={r.tirAnualPct != null ? `${r.tirAnualPct.toFixed(1).replace(".", ",")}% a.a.` : "—"}
          detalhe="capital sai no aporte, volta na saída"
          destaque
        />
        <Item
          label="Payback do capital"
          valor={paybackMeses != null ? `${paybackMeses} meses` : "não paga no período"}
          detalhe={paybackMes ? `caixa da empresa cobre o aporte em ${formatMes(paybackMes)}` : "o caixa do período não cobre o aporte"}
        />
        <Item
          label="Capital coberto por caixa"
          valor={capitalRecuperadoPct != null ? `${capitalRecuperadoPct.toFixed(0)}%` : "—"}
          detalhe="caixa gerado no período ÷ capital novo"
        />
        <Item
          label="TIR do projeto"
          valor={tirProjetoPct != null ? `${tirProjetoPct.toFixed(1).replace(".", ",")}% a.a.` : "—"}
          detalhe="fluxo da empresa inteira — não é o retorno do investidor"
        />
        <Item
          label="Conferir as premissas"
          valor={arrNaSaida > 0 ? formatBRL(arrNaSaida) : "—"}
          detalhe={`ARR em ${formatMes(mesSaida)} · EBITDA 12m ${formatBRL(ebitdaNaSaida)}`}
        />
      </div>
      {r.valorEmpresaNaSaida === 0 && (
        <p className="mt-3 text-[11px] text-warning">
          A base escolhida está zerada ou negativa no fim do período — troque a base da saída ou reveja a projeção.
        </p>
      )}
    </div>
  );
}

function Item({ label, valor, detalhe, destaque }: { label: string; valor: string; detalhe: string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${destaque ? "bg-wine-soft" : "bg-surface"}`}>
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-text-faint">{label}</div>
      <div className="mt-1 text-[16px] font-semibold text-text">{valor}</div>
      <div className="mt-0.5 text-[10.5px] text-text-muted">{detalhe}</div>
    </div>
  );
}
