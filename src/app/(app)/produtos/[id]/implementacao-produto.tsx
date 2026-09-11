"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import {
  salvarConfigImplementacao,
  criarEtapaImplementacao,
  atualizarEtapaImplementacao,
  excluirEtapaImplementacao,
  type ActionState,
} from "../actions";
import { InfoTooltip } from "@/components/info-tooltip";

export type CustoHora = {
  area: string;
  cargo: string;
  tipo_contratacao: "clt" | "pj";
  senioridade: "junior" | "pleno" | "senior";
  valor_hora: number;
};

export type EtapaImplementacao = {
  id: string;
  nome_etapa: string;
  cargo_dono: string | null;
  cargo_executor: string;
  senioridade: string;
  tipo_contratacao: string;
  horas: number;
  valor_hora: number;
  ordem: number | null;
};

/** Canal que vende o produto no cenário, com o desconto que dá na implementação (1 = isento). */
export type CanalImplementacao = { nome: string; percentualMix: number; desconto: number };

/** Horas e R$/hora de uma etapa em edição — a simulação de margem acompanha antes de salvar. */
type RascunhoCusto = { id: string; horas: number; valor_hora: number } | null;

/** Forma de pagamento salva (pct e desconto em 0–1). */
export type FormaPagamento = { parcelas: number; pct: number; desconto?: number | null };
/** Linha do editor (texto, como digitado; pct e desconto em %). */
type LinhaForma = { parcelas: string; pct: string; desconto: string };
/** Forma normalizada pra simulação. */
type FormaSimulada = { parcelas: number; fracao: number; desconto: number };

const SUGESTAO_FORMAS: LinhaForma[] = [
  { parcelas: "1", pct: "25", desconto: "" },
  { parcelas: "3", pct: "25", desconto: "" },
  { parcelas: "5", pct: "25", desconto: "" },
  { parcelas: "10", pct: "25", desconto: "" },
];

function nomeForma(parcelas: number) {
  return parcelas <= 1 ? "À vista" : `${parcelas}×`;
}

/** Linhas válidas do editor → frações que somam 1 (sem nenhuma, todos à vista). */
function normalizarFormas(linhas: LinhaForma[]): FormaSimulada[] {
  const validas = linhas
    .map((l) => ({ parcelas: Math.max(1, Math.round(Number(l.parcelas) || 1)), pct: Number(l.pct) || 0, desconto: Math.min(100, Math.max(0, Number(l.desconto) || 0)) / 100 }))
    .filter((l) => l.pct > 0);
  const soma = validas.reduce((acc, l) => acc + l.pct, 0);
  if (validas.length === 0 || soma <= 0) return [{ parcelas: 1, fracao: 1, desconto: 0 }];
  return validas.map((l) => ({ parcelas: l.parcelas, fracao: l.pct / soma, desconto: l.desconto }));
}

const initialState: ActionState = { error: null };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatPct(v: number) {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

const SENIORIDADE_LABEL: Record<string, string> = { junior: "Júnior", pleno: "Pleno", senior: "Sênior" };
const MARGENS_ALVO = [40, 50, 60, 70];

export function ImplementacaoProduto({
  produtoId,
  cenarioId,
  temImplementacao,
  precoImplementacao,
  parcelas,
  formasPagamento = null,
  etapas,
  tabelaCustoHora,
  canais = [],
}: {
  produtoId: string;
  cenarioId: string;
  temImplementacao: boolean;
  precoImplementacao: number | null;
  parcelas: number;
  formasPagamento?: FormaPagamento[] | null;
  etapas: EtapaImplementacao[];
  tabelaCustoHora: CustoHora[];
  canais?: CanalImplementacao[];
}) {
  const [configState, configAction, configPending] = useActionState(salvarConfigImplementacao, initialState);
  const [ativo, setAtivo] = useState(temImplementacao);
  const [precoDigitado, setPrecoDigitado] = useState(precoImplementacao != null ? String(precoImplementacao) : "");
  const formasIniciais: LinhaForma[] =
    formasPagamento && formasPagamento.length > 0
      ? formasPagamento.map((f) => ({
          parcelas: String(f.parcelas),
          pct: String(Math.round(Number(f.pct) * 1000) / 10),
          desconto: f.desconto ? String(Math.round(Number(f.desconto) * 1000) / 10) : "",
        }))
      : [{ parcelas: String(parcelas), pct: "100", desconto: "" }];
  const [formas, setFormas] = useState<LinhaForma[]>(formasIniciais);
  const [rascunho, setRascunho] = useState<RascunhoCusto>(null);

  // Custo das etapas — com a etapa em edição já refletida, pra simulação responder antes de salvar.
  const custoEtapa = (e: EtapaImplementacao) =>
    rascunho && rascunho.id === e.id ? rascunho.horas * rascunho.valor_hora : Number(e.horas) * Number(e.valor_hora);
  const custoTotal = etapas.reduce((acc, e) => acc + custoEtapa(e), 0);
  const horasTotal = etapas.reduce((acc, e) => acc + (rascunho && rascunho.id === e.id ? rascunho.horas : Number(e.horas)), 0);
  const precoVenda = Number(precoDigitado) || 0;
  const formasSimuladas = normalizarFormas(formas);
  const somaPct = formas.reduce((acc, f) => acc + (Number(f.pct) || 0), 0);
  // O que vai pro servidor: pct e desconto em 0–1; a forma mais usada vira o "parcelas" antigo.
  const formasParaSalvar = formas
    .filter((f) => (Number(f.pct) || 0) > 0)
    .map((f) => ({ parcelas: Math.max(1, Math.round(Number(f.parcelas) || 1)), pct: (Number(f.pct) || 0) / 100, desconto: (Number(f.desconto) || 0) / 100 }));
  const parcelasPrincipal = [...formasParaSalvar].sort((a, b) => b.pct - a.pct)[0]?.parcelas ?? 1;
  const naoSalvo =
    precoVenda !== Number(precoImplementacao ?? 0) ||
    JSON.stringify(formas) !== JSON.stringify(formasIniciais) ||
    (rascunho != null && custoTotal !== etapas.reduce((a, e) => a + Number(e.horas) * Number(e.valor_hora), 0));

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 flex items-center font-heading text-[13px] font-semibold">
        Implementação
        <InfoTooltip texto="Cobrança única na primeira contratação do produto: se o cliente adicionar um módulo depois, não cobra de novo; se comprar tudo junto, é a mesma cobrança única. O custo das etapas entra em COGS no mês do onboarding (o trabalho acontece ali, mesmo que o cliente pague parcelado), e é o que permite medir margem bruta do produto." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Vale só pra este produto — cliente que assina outro produto junto não paga implementação dele. Preço e parcelas valem
        em todos os cenários; as etapas (o custo) são deste cenário.
      </p>

      <form action={configAction} className="flex flex-col gap-2.5 border-b border-border-soft pb-4">
        <input type="hidden" name="produto_id" value={produtoId} />
        <label className="flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            name="tem_implementacao"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Este produto cobra implementação
        </label>

        {ativo && (
          <div className="form-linha">
            <div className="form-campo">
              <label>Preço de venda (R$)</label>
              <input
                name="preco_implementacao"
                type="number"
                step="0.01"
                value={precoDigitado}
                onChange={(e) => setPrecoDigitado(e.target.value)}
                placeholder="5000"
                className="input campo-dinheiro"
              />
            </div>
          </div>
        )}

        {ativo && (
          <FormasPagamentoEditor formas={formas} onChange={setFormas} somaPct={somaPct} />
        )}
        <input type="hidden" name="implementacao_formas" value={JSON.stringify(formasParaSalvar)} />
        <input type="hidden" name="implementacao_parcelas" value={parcelasPrincipal} />

        {ativo && (
          <SimulacaoMargem
            preco={precoVenda}
            formas={formasSimuladas}
            custo={custoTotal}
            canais={canais}
            naoSalvo={naoSalvo}
            onUsarPreco={(v) => setPrecoDigitado(String(v))}
          />
        )}

        {configState.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[11px] text-danger">{configState.error}</p>}

        <button
          type="submit"
          disabled={configPending}
          className="self-start rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60"
        >
          {configPending ? "Salvando e recalculando…" : "Salvar implementação"}
        </button>
      </form>

      {ativo && (
        <EtapasImplementacao
          produtoId={produtoId}
          cenarioId={cenarioId}
          etapas={etapas}
          tabelaCustoHora={tabelaCustoHora}
          custoTotal={custoTotal}
          horasTotal={horasTotal}
          custoEtapa={custoEtapa}
          onRascunho={setRascunho}
        />
      )}
    </div>
  );
}

/**
 * Simulação de margem da implementação, recalculada a cada tecla: margem e markup sobre o preço
 * digitado, quando o caixa volta (o custo sai todo no onboarding, a receita vem parcelada), preço
 * pra atingir uma margem-alvo e a margem real por canal — associação/representante podem dar
 * desconto ou isenção na implementação, e aí o mesmo preço rende margens bem diferentes.
 */
function SimulacaoMargem({
  preco,
  formas,
  custo,
  canais,
  naoSalvo,
  onUsarPreco,
}: {
  preco: number;
  formas: FormaSimulada[];
  custo: number;
  canais: CanalImplementacao[];
  naoSalvo: boolean;
  onUsarPreco: (valor: number) => void;
}) {
  // Com mix de pagamento, o que entra por cliente é a média ponderada do preço de cada forma
  // (quem paga à vista com desconto recebe menos). Sem desconto nas formas, é o próprio preço.
  const descontoMedio = formas.reduce((s, f) => s + f.fracao * f.desconto, 0);
  const recebido = preco * (1 - descontoMedio);
  const margem = recebido - custo;
  const margemPct = recebido > 0 ? (margem / recebido) * 100 : null;
  const markupPct = custo > 0 ? (margem / custo) * 100 : null;
  const porForma = formas.map((f) => {
    const valor = preco * (1 - f.desconto);
    const parcela = valor / f.parcelas;
    return { ...f, valor, parcela, margem: valor - custo, retorno: parcela > 0 && custo > 0 ? Math.ceil(custo / parcela) : null };
  });
  // Caixa médio: mês em que o que já entrou (somando as formas pela fatia de clientes) cobre o custo.
  const maxParcelas = Math.max(...formas.map((f) => f.parcelas));
  let mesRetorno: number | null = null;
  if (custo > 0 && recebido > 0) {
    for (let k = 1; k <= maxParcelas; k++) {
      const entrou = porForma.reduce((s, f) => s + f.fracao * Math.min(k, f.parcelas) * f.parcela, 0);
      if (entrou >= custo - 1e-6) {
        mesRetorno = k;
        break;
      }
    }
  }
  const umaForma = formas.length === 1;
  const parcela = porForma[0]?.parcela ?? 0;
  const parcelas = formas[0]?.parcelas ?? 1;

  const pesoTotal = canais.reduce((s, c) => s + c.percentualMix, 0);
  const porCanal = canais.map((c) => {
    const efetivo = recebido * (1 - Math.min(1, c.desconto));
    return { ...c, efetivo, margem: efetivo - custo, margemPct: efetivo > 0 ? ((efetivo - custo) / efetivo) * 100 : null };
  });
  const precoMedio = pesoTotal > 0 ? porCanal.reduce((s, c) => s + c.efetivo * c.percentualMix, 0) / pesoTotal : null;
  const temDescontoCanal = canais.some((c) => c.desconto > 0);

  return (
    <div className="rounded-lg border border-primary-fill/50 bg-primary-soft/25 px-4 py-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center text-[11.5px] font-semibold text-text-muted">
          Simulação de margem
          <InfoTooltip texto="Recalcula enquanto você digita. Margem = quanto sobra sobre o preço de venda. Markup = quanto o preço está acima do custo. Valores antes de impostos (DAS)." />
        </p>
        {naoSalvo && <span className="rounded bg-cream px-2 py-0.5 text-[10.5px] font-medium text-cream-deep">simulação — ainda não salvo</span>}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
        <Indicador rotulo={descontoMedio > 0 ? "Recebido em média" : "Preço de venda"} valor={formatBRL(recebido)} />
        <Indicador rotulo="Custo direto (COGS)" valor={formatBRL(custo)} />
        <Indicador
          rotulo="Margem"
          valor={`${formatBRL(margem)}${margemPct != null ? ` · ${formatPct(margemPct)}` : ""}`}
          destaque={margem >= 0 ? "ok" : "ruim"}
        />
        <Indicador rotulo="Markup" valor={markupPct != null ? formatPct(markupPct) : "—"} />
      </div>

      {preco > 0 && umaForma && (
        <p className="mt-2 text-[10.5px] text-text-muted">
          {parcelas > 1 ? `${parcelas}× de ${formatBRL(parcela)}` : "À vista"} — o custo de {formatBRL(custo)} sai inteiro no mês do
          onboarding.{" "}
          {porForma[0]?.retorno != null &&
            (porForma[0].retorno <= parcelas
              ? porForma[0].retorno <= 1
                ? "A primeira parcela já cobre o custo."
                : `O caixa da implementação volta na ${porForma[0].retorno}ª parcela.`
              : "As parcelas não chegam a cobrir o custo.")}
        </p>
      )}

      {preco > 0 && !umaForma && (
        <div className="mt-3 border-t border-border-soft pt-2.5">
          <p className="mb-1 flex items-center text-[10.5px] font-semibold text-text-muted">
            Por forma de pagamento
            <InfoTooltip texto="Cada fatia de clientes paga no seu número de parcelas (com o desconto da forma, se houver). O custo sai inteiro no mês do onboarding em todas." />
          </p>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="text-left text-[9.5px] uppercase tracking-wide text-text-faint">
                <th className="py-1 font-medium">Forma</th>
                <th className="py-1 text-right font-medium">% dos clientes</th>
                <th className="py-1 text-right font-medium">Recebe</th>
                <th className="py-1 text-right font-medium">Parcela</th>
                <th className="py-1 text-right font-medium">Margem</th>
                <th className="py-1 text-right font-medium">Caixa volta</th>
              </tr>
            </thead>
            <tbody>
              {porForma.map((f, i) => (
                <tr key={i} className="border-t border-border-soft">
                  <td className="py-1">
                    {nomeForma(f.parcelas)}
                    {f.desconto > 0 && <span className="ml-1 text-text-faint">({formatPct(f.desconto * 100)} off)</span>}
                  </td>
                  <td className="py-1 text-right font-mono">{formatPct(f.fracao * 100)}</td>
                  <td className="py-1 text-right font-mono">{formatBRL(f.valor)}</td>
                  <td className="py-1 text-right font-mono">{f.parcelas > 1 ? `${f.parcelas}× ${formatBRL(f.parcela)}` : "—"}</td>
                  <td className={`py-1 text-right font-mono ${f.margem >= 0 ? "text-success" : "text-danger"}`}>{formatBRL(f.margem)}</td>
                  <td className="py-1 text-right font-mono">
                    {f.retorno == null ? "—" : f.retorno <= 1 ? "na 1ª" : f.retorno <= f.parcelas ? `na ${f.retorno}ª` : "não cobre"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[10.5px] text-text-muted">
            O custo de {formatBRL(custo)} sai inteiro no onboarding.{" "}
            {mesRetorno != null
              ? mesRetorno <= 1
                ? "No mix, o primeiro mês já cobre o custo."
                : `No mix, o caixa da implementação volta no ${mesRetorno}º mês.`
              : "No mix, o que entra não chega a cobrir o custo."}
          </p>
        </div>
      )}

      {custo > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
          <span className="text-text-faint">Preço pra margem de:</span>
          {MARGENS_ALVO.map((m) => {
            // Preço de tabela que, depois dos descontos do mix de pagamento, deixa essa margem.
            const alvo = Math.ceil(custo / (1 - m / 100) / (1 - descontoMedio || 1) / 10) * 10;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onUsarPreco(alvo)}
                className="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-text-muted hover:border-primary-fill hover:text-primary-deep"
                aria-label={`Simular preço de ${formatBRL(alvo)} (margem de ${m}%)`}
              >
                {m}% → {formatBRL(alvo)}
              </button>
            );
          })}
          <span className="text-text-faint">· empate: {formatBRL(custo)}</span>
        </div>
      )}

      {porCanal.length > 0 && preco > 0 && (
        <div className="mt-3 border-t border-border-soft pt-2.5">
          <p className="mb-1 flex items-center text-[10.5px] font-semibold text-text-muted">
            Por canal de venda
            <InfoTooltip texto="Desconto e isenção de implementação configurados em Vendas → Canais de aquisição, pra este produto. Isento: a implementação é feita (custo cheio) e não é cobrada. A média pondera pelo % das vendas de cada canal." />
          </p>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="text-left text-[9.5px] uppercase tracking-wide text-text-faint">
                <th className="py-1 font-medium">Canal</th>
                <th className="py-1 text-right font-medium">% das vendas</th>
                <th className="py-1 text-right font-medium">Desconto</th>
                <th className="py-1 text-right font-medium">Recebe</th>
                <th className="py-1 text-right font-medium">Margem</th>
              </tr>
            </thead>
            <tbody>
              {porCanal.map((c) => (
                <tr key={c.nome} className="border-t border-border-soft">
                  <td className="py-1">{c.nome}</td>
                  <td className="py-1 text-right font-mono">{pesoTotal > 0 ? formatPct((c.percentualMix / pesoTotal) * 100) : "—"}</td>
                  <td className="py-1 text-right font-mono">{c.desconto >= 1 ? "isento" : c.desconto > 0 ? formatPct(c.desconto * 100) : "—"}</td>
                  <td className="py-1 text-right font-mono">{formatBRL(c.efetivo)}</td>
                  <td className={`py-1 text-right font-mono font-semibold ${c.margem >= 0 ? "text-success" : "text-danger"}`}>
                    {formatBRL(c.margem)}
                    {c.margemPct != null ? ` · ${formatPct(c.margemPct)}` : ""}
                  </td>
                </tr>
              ))}
              {precoMedio != null && temDescontoCanal && (
                <tr className="border-t border-border font-semibold">
                  <td className="py-1">Média pelo mix de canais</td>
                  <td></td>
                  <td></td>
                  <td className="py-1 text-right font-mono">{formatBRL(precoMedio)}</td>
                  <td className={`py-1 text-right font-mono ${precoMedio - custo >= 0 ? "text-success" : "text-danger"}`}>
                    {formatBRL(precoMedio - custo)}
                    {precoMedio > 0 ? ` · ${formatPct(((precoMedio - custo) / precoMedio) * 100)}` : ""}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Mix de formas de pagamento da implementação: quantos % dos clientes pagam em quantas parcelas. */
function FormasPagamentoEditor({ formas, onChange, somaPct }: { formas: LinhaForma[]; onChange: (f: LinhaForma[]) => void; somaPct: number }) {
  const atualizar = (i: number, patch: Partial<LinhaForma>) => onChange(formas.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const somaOk = Math.abs(somaPct - 100) < 0.05;
  return (
    <div className="rounded-lg border border-border-soft px-3.5 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center text-[11.5px] font-semibold text-text-muted">
          Formas de pagamento
          <InfoTooltip texto="Quantos % dos clientes novos pagam à vista, em 3×, 5×, 10×... Cada forma pode ter um desconto (ex: à vista com 10% off). A projeção divide cada leva de clientes por este mix; o custo sai inteiro no mês do onboarding." />
        </p>
        <button type="button" onClick={() => onChange(SUGESTAO_FORMAS)} className="text-[11px] text-primary-deep underline decoration-dotted">
          usar à vista / 3× / 5× / 10×
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[90px_110px_110px_auto] gap-2 text-[10px] text-text-faint">
          <span>Parcelas</span>
          <span>% dos clientes</span>
          <span>Desconto (opcional)</span>
          <span></span>
        </div>
        {formas.map((f, i) => (
          <div key={i} className="grid grid-cols-[90px_110px_110px_auto] items-center gap-2">
            <input type="number" min="1" step="1" value={f.parcelas} onChange={(e) => atualizar(i, { parcelas: e.target.value })} className="input" aria-label="Parcelas" />
            <div className="flex items-center gap-1">
              <input type="number" min="0" max="100" step="1" value={f.pct} onChange={(e) => atualizar(i, { pct: e.target.value })} className="input w-full" aria-label="% dos clientes" />
              <span className="text-[11px] text-text-faint">%</span>
            </div>
            <div className="flex items-center gap-1">
              <input type="number" min="0" max="100" step="0.5" value={f.desconto} onChange={(e) => atualizar(i, { desconto: e.target.value })} placeholder="0" className="input w-full" aria-label="Desconto" />
              <span className="text-[11px] text-text-faint">%</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-text-faint">{nomeForma(Math.max(1, Math.round(Number(f.parcelas) || 1)))}</span>
              {formas.length > 1 && (
                <button type="button" onClick={() => onChange(formas.filter((_, j) => j !== i))} className="text-danger" aria-label="Remover forma">
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10.5px]">
        <button type="button" onClick={() => onChange([...formas, { parcelas: "", pct: "", desconto: "" }])} className="font-medium text-primary-deep">
          + forma de pagamento
        </button>
        <span className={somaOk ? "text-text-faint" : "font-medium text-danger"}>
          {somaOk ? "soma 100% dos clientes" : `soma ${somaPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% — ajuste pra 100% antes de salvar`}
        </span>
      </div>
    </div>
  );
}

function Indicador({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: "ok" | "ruim" }) {
  return (
    <div>
      <div className="text-[10px] text-text-faint">{rotulo}</div>
      <div
        className={`font-mono text-[13px] font-semibold ${
          destaque === "ok" ? "text-success" : destaque === "ruim" ? "text-danger" : ""
        }`}
      >
        {valor}
      </div>
    </div>
  );
}

function valorDaTabela(tabela: CustoHora[], cargo: string, senioridade: string, tipo: string): number | null {
  const achado = tabela.find((t) => t.cargo === cargo && t.senioridade === senioridade && t.tipo_contratacao === tipo);
  return achado ? Number(achado.valor_hora) : null;
}

function EtapasImplementacao({
  produtoId,
  cenarioId,
  etapas,
  tabelaCustoHora,
  custoTotal,
  horasTotal,
  custoEtapa,
  onRascunho,
}: {
  produtoId: string;
  cenarioId: string;
  etapas: EtapaImplementacao[];
  tabelaCustoHora: CustoHora[];
  custoTotal: number;
  horasTotal: number;
  custoEtapa: (e: EtapaImplementacao) => number;
  onRascunho: (r: RascunhoCusto) => void;
}) {
  const [state, formAction, pending] = useActionState(criarEtapaImplementacao, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [cargoExecutor, setCargoExecutor] = useState("");
  const [senioridade, setSenioridade] = useState("pleno");
  const [tipo, setTipo] = useState("pj");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const cargos = useMemo(() => [...new Set(tabelaCustoHora.map((t) => t.cargo))].sort(), [tabelaCustoHora]);

  // O valor/hora vem do cargo que EXECUTA as horas (o cargo de apoio da sua planilha), não do dono
  // da etapa — é ele quem determina o custo real.
  const valorHoraSugerido = useMemo(
    () => valorDaTabela(tabelaCustoHora, cargoExecutor, senioridade, tipo),
    [tabelaCustoHora, cargoExecutor, senioridade, tipo],
  );

  function fecharEdicao() {
    setEditandoId(null);
    onRascunho(null);
  }

  return (
    <div className="mt-4">
      <p className="mb-2 flex items-center text-[11.5px] font-semibold text-text-muted">
        Etapas da implantação
        <InfoTooltip texto="O valor/hora é puxado automaticamente da tabela de custo/hora pelo cargo que executa as horas, a senioridade e o tipo de contratação. Clique em Editar pra ajustar uma etapa já lançada — a simulação de margem acima acompanha enquanto você edita." />
      </p>

      <div className="mb-3 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-soft">
              <th className="px-2 py-1.5 text-left text-[9.5px] font-medium uppercase tracking-wide text-text-faint">Etapa</th>
              <th className="px-2 py-1.5 text-left text-[9.5px] font-medium uppercase tracking-wide text-text-faint">Executa</th>
              <th className="px-2 py-1.5 text-right text-[9.5px] font-medium uppercase tracking-wide text-text-faint">Horas</th>
              <th className="px-2 py-1.5 text-right text-[9.5px] font-medium uppercase tracking-wide text-text-faint">R$/h</th>
              <th className="px-2 py-1.5 text-right text-[9.5px] font-medium uppercase tracking-wide text-text-faint">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {etapas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-[11.5px] text-text-faint">
                  Nenhuma etapa cadastrada ainda.
                </td>
              </tr>
            )}
            {etapas.map((e) =>
              editandoId === e.id ? (
                <EdicaoEtapa
                  key={e.id}
                  etapa={e}
                  produtoId={produtoId}
                  cenarioId={cenarioId}
                  cargos={cargos}
                  tabelaCustoHora={tabelaCustoHora}
                  onRascunho={onRascunho}
                  onFechar={fecharEdicao}
                />
              ) : (
                <tr key={e.id} className="border-b border-border-soft">
                  <td className="px-2 py-2 text-[11.5px]">
                    <div className="font-medium">{e.nome_etapa}</div>
                    {e.cargo_dono && <div className="text-[9.5px] text-text-faint">dono: {e.cargo_dono}</div>}
                  </td>
                  <td className="px-2 py-2 text-[11px] text-text-muted">
                    {e.cargo_executor}
                    <span className="text-text-faint">
                      {" "}
                      · {SENIORIDADE_LABEL[e.senioridade] ?? e.senioridade} · {e.tipo_contratacao.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-[11.5px]">{Number(e.horas)}h</td>
                  <td className="px-2 py-2 text-right font-mono text-[11.5px]">{formatBRL(Number(e.valor_hora))}</td>
                  <td className="px-2 py-2 text-right font-mono text-[11.5px] font-semibold">{formatBRL(custoEtapa(e))}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <button
                      type="button"
                      disabled={isPending || editandoId != null}
                      onClick={() => setEditandoId(e.id)}
                      className="mr-2.5 text-[10.5px] text-primary-deep disabled:opacity-40"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={isPending || editandoId != null}
                      onClick={() => {
                        if (!confirm(`Excluir a etapa "${e.nome_etapa}"?`)) return;
                        startTransition(() => excluirEtapaImplementacao(e.id, produtoId, cenarioId));
                      }}
                      className="text-[10.5px] text-danger disabled:opacity-40"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ),
            )}
            {etapas.length > 0 && (
              <tr>
                <td className="px-2 py-2 text-[11px] font-semibold">Custo direto total (COGS)</td>
                <td></td>
                <td className="px-2 py-2 text-right font-mono text-[11.5px] font-semibold">{horasTotal}h</td>
                <td></td>
                <td className="px-2 py-2 text-right font-mono text-[12.5px] font-bold text-primary-deep">{formatBRL(custoTotal)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
          setCargoExecutor("");
        }}
        className="flex flex-col gap-2 border-t border-border-soft pt-3"
      >
        <input type="hidden" name="produto_id" value={produtoId} />
        <input type="hidden" name="cenario_id" value={cenarioId} />
        <input type="hidden" name="ordem" value={etapas.length + 1} />

        <div className="form-linha">
          <div className="form-campo campo-texto">
            <label>Etapa</label>
            <input name="nome_etapa" placeholder="Ex: Kick-off e Alinhamento Técnico" className="input" required />
          </div>
          <div className="form-campo">
            <label>
              Dono
              <InfoTooltip texto="Quem é responsável pela etapa. Informativo — não entra no custo." />
            </label>
            <select name="cargo_dono" className="input campo-select" defaultValue="">
              <option value="">—</option>
              {cargos.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-linha">
          <div className="form-campo">
            <label>Cargo que executa</label>
            <select
              name="cargo_executor"
              value={cargoExecutor}
              onChange={(e) => setCargoExecutor(e.target.value)}
              className="input campo-select"
              required
            >
              <option value="" disabled>
                Selecione…
              </option>
              {cargos.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="form-campo">
            <label>Senioridade</label>
            <select name="senioridade" value={senioridade} onChange={(e) => setSenioridade(e.target.value)} className="input campo-num">
              <option value="junior">Júnior</option>
              <option value="pleno">Pleno</option>
              <option value="senior">Sênior</option>
            </select>
          </div>
          <div className="form-campo">
            <label>Contratação</label>
            <select name="tipo_contratacao" value={tipo} onChange={(e) => setTipo(e.target.value)} className="input campo-pct">
              <option value="pj">PJ</option>
              <option value="clt">CLT</option>
            </select>
          </div>
          <div className="form-campo">
            <label>Horas</label>
            <input name="horas" type="number" step="0.5" min="0" placeholder="4" className="input campo-pct" required />
          </div>
          <div className="form-campo">
            <label>R$/hora</label>
            <input
              name="valor_hora"
              type="number"
              step="0.01"
              key={`${cargoExecutor}-${senioridade}-${tipo}`}
              defaultValue={valorHoraSugerido ?? ""}
              placeholder="—"
              className="input campo-dinheiro"
              required
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-border px-3 py-2 text-[11.5px] font-medium text-primary-deep disabled:opacity-60"
          >
            {pending ? "Salvando…" : "+ Adicionar etapa"}
          </button>
        </div>
        <p className="-mt-1 text-[10px] text-text-faint">
          {cargoExecutor
            ? valorHoraSugerido != null
              ? "R$/hora puxado da tabela de custo/hora — dá pra sobrescrever"
              : "esse cargo não tem essa combinação na tabela — digite o valor"
            : "escolha o cargo que executa pra puxar o valor/hora automaticamente"}
        </p>

        {state.error && <p className="text-[10.5px] text-danger">{state.error}</p>}
      </form>
    </div>
  );
}

/** Linha da tabela em modo edição: mesmos campos do cadastro, já preenchidos com o que foi lançado. */
function EdicaoEtapa({
  etapa,
  produtoId,
  cenarioId,
  cargos,
  tabelaCustoHora,
  onRascunho,
  onFechar,
}: {
  etapa: EtapaImplementacao;
  produtoId: string;
  cenarioId: string;
  cargos: string[];
  tabelaCustoHora: CustoHora[];
  onRascunho: (r: RascunhoCusto) => void;
  onFechar: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState(etapa.nome_etapa);
  const [dono, setDono] = useState(etapa.cargo_dono ?? "");
  const [executor, setExecutor] = useState(etapa.cargo_executor);
  const [senioridade, setSenioridade] = useState(etapa.senioridade);
  const [tipo, setTipo] = useState(etapa.tipo_contratacao);
  const [horas, setHoras] = useState(String(etapa.horas));
  const [valorHora, setValorHora] = useState(String(etapa.valor_hora));

  const sugerido = valorDaTabela(tabelaCustoHora, executor, senioridade, tipo);
  const cargosComAtual = cargos.includes(etapa.cargo_executor) ? cargos : [etapa.cargo_executor, ...cargos];

  function atualizarCusto(h: string, v: string) {
    onRascunho({ id: etapa.id, horas: Number(h) || 0, valor_hora: Number(v) || 0 });
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const r = await atualizarEtapaImplementacao(etapa.id, produtoId, cenarioId, {
        nome_etapa: nome,
        cargo_dono: dono || null,
        cargo_executor: executor,
        senioridade,
        tipo_contratacao: tipo,
        horas: Number(horas),
        valor_hora: Number(valorHora),
      });
      if (r.error) setErro(r.error);
      else onFechar();
    });
  }

  return (
    <tr className="border-b border-border-soft bg-primary-soft/20">
      <td colSpan={6} className="px-2 py-2.5">
        <div className="grid grid-cols-[1.4fr_1fr] gap-2">
          <div>
            <label className="mb-0.5 block text-[10px] text-text-faint">Etapa</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="input w-full" />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-text-faint">Dono</label>
            <select value={dono} onChange={(e) => setDono(e.target.value)} className="input w-full">
              <option value="">—</option>
              {[...new Set([...(etapa.cargo_dono ? [etapa.cargo_dono] : []), ...cargos])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-[1.4fr_0.8fr_0.6fr_0.6fr_0.8fr_auto] items-end gap-2">
          <div>
            <label className="mb-0.5 block text-[10px] text-text-faint">Cargo que executa</label>
            <select value={executor} onChange={(e) => setExecutor(e.target.value)} className="input w-full">
              {cargosComAtual.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-text-faint">Senioridade</label>
            <select value={senioridade} onChange={(e) => setSenioridade(e.target.value)} className="input w-full">
              <option value="junior">Júnior</option>
              <option value="pleno">Pleno</option>
              <option value="senior">Sênior</option>
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-text-faint">Contratação</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="input w-full">
              <option value="pj">PJ</option>
              <option value="clt">CLT</option>
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-text-faint">Horas</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={horas}
              onChange={(e) => {
                setHoras(e.target.value);
                atualizarCusto(e.target.value, valorHora);
              }}
              className="input w-full"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-text-faint">R$/hora</label>
            <input
              type="number"
              step="0.01"
              value={valorHora}
              onChange={(e) => {
                setValorHora(e.target.value);
                atualizarCusto(horas, e.target.value);
              }}
              className="input w-full"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={isPending}
              onClick={salvar}
              className="rounded-lg bg-wine-deep px-3 py-2 text-[11.5px] font-medium text-white disabled:opacity-60"
            >
              {isPending ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" disabled={isPending} onClick={onFechar} className="rounded-lg border border-border px-3 py-2 text-[11.5px] text-text-muted">
              Cancelar
            </button>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[10px] text-text-faint">
          <span>Total da etapa: {formatBRL((Number(horas) || 0) * (Number(valorHora) || 0))}</span>
          {sugerido != null && sugerido !== Number(valorHora) && (
            <button
              type="button"
              onClick={() => {
                setValorHora(String(sugerido));
                atualizarCusto(horas, String(sugerido));
              }}
              className="text-primary-deep underline"
            >
              usar R$/hora da tabela ({formatBRL(sugerido)})
            </button>
          )}
          {erro && <span className="text-danger">{erro}</span>}
        </div>
      </td>
    </tr>
  );
}
