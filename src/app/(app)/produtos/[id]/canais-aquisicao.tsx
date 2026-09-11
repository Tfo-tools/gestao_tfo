"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  criarCanalAquisicao,
  atualizarCanalAquisicao,
  excluirCanalAquisicao,
  salvarParceirosCanal,
  salvarCanalProdutos,
  type ActionState,
} from "../actions";
import { InfoTooltip } from "@/components/info-tooltip";
import { FASES } from "@/lib/fases";

export type ModeloContratacaoOpcao = {
  id: string;
  cargo: string;
  nome: string;
  parametros: { capacidade_unidade_mes?: number } | null;
};

export type ProdutoOpcao = { id: string; nome: string };

type ParametrosCanal = {
  comissao_pct?: number;
  valor_fixo_fechamento?: number;
  credito_uso_valor?: number;
  credito_uso_destino?: "cliente" | "parceiro";
  custo_mensal_parceiro?: number;
  media_clientes_parceiro_inicial?: number;
  queda_intensidade_mensal_pct?: number;
  media_clientes_parceiro_minima?: number;
  custo_por_trial?: number;
  taxa_conversao_trial?: number;
};

export type ParceiroFase = { fase: string; quantidade_parceiros: number };

export type CanalProduto = {
  produto_id: string;
  percentual_mix: number;
  taxa_fechamento: number | null;
  desconto_cliente_pct: number | null;
  desconto_cliente_meses: number | null;
  isencao_implementacao: boolean;
  desconto_implementacao_pct?: number;
};

export type CanalAquisicao = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo_canal: "direto" | "self_service" | "representante" | "associacao";
  modelo_contratacao_id: string | null;
  parametros: ParametrosCanal | null;
  parceirosPorFase: ParceiroFase[];
  produtos: CanalProduto[];
};

const initialState: ActionState = { error: null };

const TIPO_LABEL: Record<string, string> = {
  direto: "Direto (SDR)",
  self_service: "Self-service",
  representante: "Representante",
  associacao: "Associação",
};

function formatPct(v: number | null | undefined) {
  return v != null ? `${(v * 100).toFixed(1)}%` : "—";
}
function formatBRL(v: number | null | undefined) {
  return v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}
const pctOuVazio = (v: number | null | undefined) => (v != null ? (v * 100).toFixed(2) : "");
const numOuVazio = (v: number | null | undefined) => (v != null ? String(v) : "");

function resumoParametros(c: CanalAquisicao): string | null {
  if (c.tipo_canal === "direto") return null;
  const p = c.parametros ?? {};
  const partes: string[] = [];
  if (p.custo_mensal_parceiro != null) partes.push(`${formatBRL(p.custo_mensal_parceiro)}/mês por parceiro`);
  if (p.comissao_pct != null) partes.push(`comissão ${formatPct(p.comissao_pct)}`);
  if (p.valor_fixo_fechamento != null) partes.push(`${formatBRL(p.valor_fixo_fechamento)} fixo no fechamento`);
  if (p.credito_uso_valor != null)
    partes.push(`crédito ${formatBRL(p.credito_uso_valor)} pro ${p.credito_uso_destino === "parceiro" ? "parceiro" : "cliente"}`);
  if (p.custo_por_trial != null)
    partes.push(`${formatBRL(p.custo_por_trial)}/teste, ${formatPct(p.taxa_conversao_trial)} viram cliente`);
  if (p.media_clientes_parceiro_inicial != null)
    partes.push(
      `~${p.media_clientes_parceiro_inicial} cliente(s)/parceiro/mês, caindo ${formatPct(p.queda_intensidade_mensal_pct)}/mês até ${p.media_clientes_parceiro_minima ?? 0}`,
    );
  return partes.length > 0 ? partes.join(" · ") : null;
}

export function CanaisAquisicao({
  cenarioId,
  canais,
  modelos,
  produtos,
}: {
  cenarioId: string;
  canais: CanalAquisicao[];
  modelos: ModeloContratacaoOpcao[];
  produtos: ProdutoOpcao[];
}) {
  const [state, formAction, pending] = useActionState(criarCanalAquisicao, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [tipoCanal, setTipoCanal] = useState<"direto" | "self_service" | "representante" | "associacao">("direto");
  const modeloById = new Map(modelos.map((m) => [m.id, m]));

  // O mix soma por PRODUTO (cada produto reparte 100% entre os canais), não por canal.
  const mixPorProduto = new Map<string, number>();
  for (const c of canais) {
    for (const cp of c.produtos) {
      mixPorProduto.set(cp.produto_id, (mixPorProduto.get(cp.produto_id) ?? 0) + Number(cp.percentual_mix));
    }
  }
  const produtosForaDe100 = produtos.filter((p) => {
    const soma = mixPorProduto.get(p.id) ?? 0;
    return soma > 0 && Math.abs(soma - 1) > 0.001;
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 flex items-center font-heading text-[13px] font-semibold">
        Canais de aquisição
        <InfoTooltip texto="O canal é da empresa, não do produto: você se associa uma vez e a associação serve o portfólio inteiro. O custo de manter o parceiro e a remuneração dele ficam no canal; a conversão, o mix e o benefício ao cliente variam por produto, na tabela dentro de cada canal." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Um canal atende todos os produtos — o que muda por produto é a conversão e o benefício que você decide dar.
      </p>

      {produtosForaDe100.length > 0 && (
        <div className="mb-3 rounded-lg border border-dashed border-danger bg-danger-soft px-3 py-2 text-[11px] text-danger">
          O mix não soma 100% em: {produtosForaDe100.map((p) => `${p.nome} (${((mixPorProduto.get(p.id) ?? 0) * 100).toFixed(0)}%)`).join(", ")}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3">
        {canais.length === 0 && <p className="text-[12px] text-text-faint">Nenhum canal cadastrado ainda.</p>}
        {canais.map((c) => (
          <CanalRow key={c.id} canal={c} cenarioId={cenarioId} modelos={modelos} modeloById={modeloById} produtos={produtos} />
        ))}
      </div>

      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
          setTipoCanal("direto");
        }}
        className="flex flex-col gap-2.5 border-t border-border-soft pt-4"
      >
        <input type="hidden" name="cenario_id" value={cenarioId} />

        <div className="flex gap-1 rounded-lg bg-bg p-1">
          {(["direto", "self_service", "representante", "associacao"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipoCanal(t)}
              className={`flex-1 rounded-md py-1.5 text-[11.5px] font-medium ${
                tipoCanal === t ? "bg-surface shadow-sm" : "text-text-muted"
              }`}
            >
              {TIPO_LABEL[t]}
            </button>
          ))}
        </div>
        <input type="hidden" name="tipo_canal" value={tipoCanal} />

        <CamposCanal tipoCanal={tipoCanal} modelos={modelos} />

        {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-lg bg-wine-deep px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar canal"}
        </button>
        <p className="text-[10px] text-text-faint">
          Depois de salvar, defina dentro do canal a conversão e o benefício de cada produto.
        </p>
      </form>
    </div>
  );
}

function CanalRow({
  canal,
  cenarioId,
  modelos,
  modeloById,
  produtos,
}: {
  canal: CanalAquisicao;
  cenarioId: string;
  modelos: ModeloContratacaoOpcao[];
  modeloById: Map<string, ModeloContratacaoOpcao>;
  produtos: ProdutoOpcao[];
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(atualizarCanalAquisicao, initialState);
  const [isPending, startTransition] = useTransition();
  const foiPending = useRef(false);

  useEffect(() => {
    if (foiPending.current && !pending && state.success) setEditando(false);
    foiPending.current = pending;
  }, [pending, state.success]);

  if (editando) {
    return (
      <div className="rounded-lg border border-primary-fill px-3 py-3">
        <form action={formAction} className="flex flex-col gap-2.5">
          <input type="hidden" name="id" value={canal.id} />
          <input type="hidden" name="cenario_id" value={cenarioId} />
          <input type="hidden" name="tipo_canal" value={canal.tipo_canal} />
          <div className="flex items-center gap-2">
            <span className="rounded bg-[#eef0f4] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#4a5064]">
              {TIPO_LABEL[canal.tipo_canal]}
            </span>
            <span className="text-[11.5px] text-text-muted">editando</span>
          </div>

          <CamposCanal tipoCanal={canal.tipo_canal} modelos={modelos} valores={canal} />

          {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[11px] text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60"
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    );
  }

  const modelo = canal.modelo_contratacao_id ? modeloById.get(canal.modelo_contratacao_id) : null;
  const resumo = resumoParametros(canal);

  return (
    <div className="rounded-lg border border-border-soft px-3 py-2.5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-[#eef0f4] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#4a5064]">
              {TIPO_LABEL[canal.tipo_canal]}
            </span>
            <span className="text-[12.5px] font-semibold">{canal.nome}</span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-text-faint">
            {canal.tipo_canal === "direto"
              ? modelo
                ? `${modelo.cargo} — ${modelo.nome}`
                : "sem modelo de contratação vinculado"
              : (resumo ?? "sem remuneração definida")}
            {canal.descricao ? ` · ${canal.descricao}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setEditando(true)} className="text-[11px] text-primary-deep">
            Editar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => excluirCanalAquisicao(canal.id, cenarioId))}
            className="text-[11px] text-danger"
          >
            Remover
          </button>
        </div>
      </div>

      <MatrizProdutos canal={canal} cenarioId={cenarioId} produtos={produtos} />

      {canal.tipo_canal === "self_service" ? (
        <p className="mt-1.5 border-t border-border-soft pt-1.5 text-[10px] text-text-faint">
          Sem SDR e sem vendedor — o custo deste canal é a verba de mídia acima, lançada em Marketing.
        </p>
      ) : canal.tipo_canal === "direto" ? (
        <p className="mt-1.5 border-t border-border-soft pt-1.5 text-[10px] text-text-faint">
          O custo deste canal é o da equipe que prospecta — defina o modelo e o período em{" "}
          <a href="/contratacoes/necessidade" className="text-primary-deep underline">
            Necessidade de Contratação
          </a>
          .
        </p>
      ) : (
        <ParceirosPorFase
          cenarioId={cenarioId}
          canalId={canal.id}
          parceirosPorFase={canal.parceirosPorFase}
          parametros={canal.parametros}
        />
      )}
    </div>
  );
}

/** A matriz do canal: uma linha por produto, com mix, conversão e o benefício daquele produto. */
function MatrizProdutos({
  canal,
  cenarioId,
  produtos,
}: {
  canal: CanalAquisicao;
  cenarioId: string;
  produtos: ProdutoOpcao[];
}) {
  const [state, formAction, pending] = useActionState(salvarCanalProdutos, initialState);
  const porProduto = new Map(canal.produtos.map((cp) => [cp.produto_id, cp]));

  return (
    <form
      action={(fd) => {
        const linhas = produtos.map((p) => {
          const get = (campo: string) => fd.get(`${p.id}__${campo}`);
          const pct = (campo: string) => {
            const v = get(campo);
            return v !== null && v !== "" ? Number(v) / 100 : null;
          };
          const num = (campo: string) => {
            const v = get(campo);
            return v !== null && v !== "" ? Number(v) : null;
          };
          return {
            produto_id: p.id,
            percentual_mix: pct("mix") ?? 0,
            taxa_fechamento: pct("fechamento"),
            desconto_cliente_pct: pct("desconto"),
            desconto_cliente_meses: num("desconto_meses"),
            isencao_implementacao: get("isencao") === "on",
            desconto_implementacao_pct: pct("desconto_impl"),
          };
        });
        const dados = new FormData();
        dados.set("canal_id", canal.id);
        dados.set("cenario_id", cenarioId);
        dados.set("linhas", JSON.stringify(linhas));
        formAction(dados);
      }}
      className="mt-2 border-t border-border-soft pt-2"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-full px-1.5 py-1 text-left text-[9px] font-medium uppercase tracking-wide text-text-faint">Produto</th>
              <th className="whitespace-nowrap px-1.5 py-1 text-left text-[9px] font-medium uppercase tracking-wide text-text-faint">
                <span className="flex items-center">
                  % das vendas
                  <InfoTooltip texto="Quanto este canal representa nas vendas deste produto. Somando todos os canais, cada produto tem que fechar 100%." />
                </span>
              </th>
              <th className="whitespace-nowrap px-1.5 py-1 text-left text-[9px] font-medium uppercase tracking-wide text-text-faint">
                <span className="flex items-center">
                  % que fecha
                  <InfoTooltip texto="A conversão deste canal neste produto: de cada 10 conversas, quantas viram cliente. Ex: 30% = fecha 3 a cada 10." />
                </span>
              </th>
              <th className="whitespace-nowrap px-1.5 py-1 text-left text-[9px] font-medium uppercase tracking-wide text-text-faint">
                <span className="flex items-center">
                  Desconto
                  <InfoTooltip texto="Benefício ao cliente que vier por este canal, neste produto. Você se associa uma vez e decide em qual produto dar o desconto." />
                </span>
              </th>
              <th className="whitespace-nowrap px-1.5 py-1 text-left text-[9px] font-medium uppercase tracking-wide text-text-faint">
                <span className="flex items-center">
                  Por (meses)
                  <InfoTooltip texto="Em branco = o desconto vale enquanto o cliente for cliente." />
                </span>
              </th>
              <th className="whitespace-nowrap px-1.5 py-1 text-left text-[9px] font-medium uppercase tracking-wide text-text-faint">
                <span className="flex items-center">
                  Desc. impl. (%)
                  <InfoTooltip texto="Desconto na implementação pra cliente vindo deste canal. Ele continua contando como uma cobrança no ticket médio, mas soma menos receita. Use a isenção ao lado só quando o desconto for total." />
                </span>
              </th>
              <th className="whitespace-nowrap px-1.5 py-1 text-center text-[9px] font-medium uppercase tracking-wide text-text-faint">
                <span className="flex items-center justify-center">
                  Isenta impl.
                  <InfoTooltip texto="Cliente vindo por este canal não paga a implementação daquele produto. O custo de entregar continua contando." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => {
              const cp = porProduto.get(p.id);
              return (
                <tr key={p.id} className="border-t border-border-soft">
                  <td className="px-1.5 py-1 text-[11px]">{p.nome}</td>
                  <td className="px-1.5 py-1">
                    <input
                      name={`${p.id}__mix`}
                      type="number"
                      step="0.01"
                      defaultValue={pctOuVazio(cp?.percentual_mix)}
                      placeholder="0"
                      className="input campo-pct text-right"
                    />
                  </td>
                  <td className="px-1.5 py-1">
                    <input
                      name={`${p.id}__fechamento`}
                      type="number"
                      step="0.01"
                      defaultValue={pctOuVazio(cp?.taxa_fechamento)}
                      placeholder="30"
                      className="input campo-pct text-right"
                    />
                  </td>
                  <td className="px-1.5 py-1">
                    <input
                      name={`${p.id}__desconto`}
                      type="number"
                      step="0.01"
                      defaultValue={pctOuVazio(cp?.desconto_cliente_pct)}
                      placeholder="—"
                      className="input campo-pct text-right"
                    />
                  </td>
                  <td className="px-1.5 py-1">
                    <input
                      name={`${p.id}__desconto_meses`}
                      type="number"
                      defaultValue={numOuVazio(cp?.desconto_cliente_meses)}
                      placeholder="sempre"
                      className="input campo-num text-right"
                    />
                  </td>
                  <td className="px-1.5 py-1">
                    <input
                      name={`${p.id}__desconto_impl`}
                      type="number"
                      step="0.01"
                      defaultValue={pctOuVazio(cp?.desconto_implementacao_pct)}
                      placeholder="0"
                      className="input campo-pct text-right"
                    />
                  </td>
                  <td className="px-1.5 py-1 text-center">
                    <input
                      type="checkbox"
                      name={`${p.id}__isencao`}
                      defaultChecked={cp?.isencao_implementacao === true}
                      className="h-4 w-4 rounded border-border"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-primary-deep disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar produtos"}
        </button>
        {state.error && <p className="text-[10.5px] text-danger">{state.error}</p>}
        {state.success && <p className="text-[10.5px] text-success">Salvo.</p>}
      </div>
    </form>
  );
}

function CamposCanal({
  tipoCanal,
  modelos,
  valores,
}: {
  tipoCanal: "direto" | "self_service" | "representante" | "associacao";
  modelos: ModeloContratacaoOpcao[];
  valores?: CanalAquisicao;
}) {
  const p = valores?.parametros ?? {};

  return (
    <>
      <div className="form-linha">
        <div className="form-campo">
          <label>{tipoCanal === "associacao" ? "Nome do canal" : tipoCanal === "representante" ? "Nome do canal" : "Canal"}</label>
          <input
            name="nome"
            defaultValue={valores?.nome ?? (tipoCanal === "direto" ? "Direto (SDR)" : "")}
            placeholder={tipoCanal === "associacao" ? "Ex: Associações Piloto" : "Ex: Representantes"}
            className="input campo-nome"
            required
          />
        </div>
        {tipoCanal === "self_service" && (
          <div className="rounded-lg bg-bg p-3">
            <p className="mb-2 flex items-center text-[10.5px] font-medium text-text-muted">
              Impulsionamento e teste grátis
              <InfoTooltip texto="Neste canal ninguém prospecta e ninguém faz reunião: a mídia paga leva a pessoa ao teste grátis e ela ativa sozinha. O custo entra em Marketing (não em Vendas) e é calculado como testes × custo por teste, onde testes = clientes novos ÷ conversão do teste." />
            </p>
            <div className="form-linha">
              <div className="form-campo">
                <label>Custo por teste iniciado (R$)</label>
                <input
                  name="custo_por_trial"
                  type="number"
                  step="0.01"
                  defaultValue={numOuVazio(p.custo_por_trial)}
                  placeholder="35"
                  className="input campo-dinheiro"
                />
              </div>
              <div className="form-campo">
                <label>
                  Testes que viram cliente (%)
                  <InfoTooltip texto="De cada 100 pessoas que iniciam o teste grátis, quantas viram cliente pagante. É o equivalente à taxa de fechamento neste canal." />
                </label>
                <input
                  name="taxa_conversao_trial"
                  type="number"
                  step="0.01"
                  defaultValue={pctOuVazio(p.taxa_conversao_trial)}
                  placeholder="15"
                  className="input campo-pct"
                />
              </div>
            </div>
          </div>
        )}

        {tipoCanal === "direto" && (
          <div className="form-campo">
            <label>
              Modelo que executa
              <InfoTooltip texto="Quem faz a prospecção — cadastrado em Contratações → Modelos de Contratação. A taxa de qualificação (lead → reunião) e a capacidade de leads vêm de lá. O custo entra pela alocação em Necessidade de Contratação." />
            </label>
            <select name="modelo_contratacao_id" className="input campo-select" defaultValue={valores?.modelo_contratacao_id ?? ""}>
              <option value="">Nenhum</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.cargo} — {m.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-campo campo-texto">
          <label>Descrição</label>
          <input name="descricao" defaultValue={valores?.descricao ?? ""} placeholder="Ex: sindicatos e associações do setor" className="input" />
        </div>
      </div>

      {tipoCanal !== "direto" && (
        <>
          <div className="form-linha">
            <div className="form-campo">
              <label>
                Custo mensal por parceiro (R$)
                <InfoTooltip texto="Quanto custa MANTER cada parceiro por mês — ex: mensalidade de associação. Entra na linha administrativa, multiplicado pelo número de parceiros ativos no mês." />
              </label>
              <input
                name="custo_mensal_parceiro"
                type="number"
                step="0.01"
                defaultValue={numOuVazio(p.custo_mensal_parceiro)}
                placeholder="110"
                className="input campo-dinheiro"
              />
            </div>
            <div className="form-campo">
              <label>
                Comissão (%)
                <InfoTooltip texto="% sobre a receita mensal dos clientes deste canal, paga ao parceiro enquanto o cliente existir. Entra como custo de vendas." />
              </label>
              <input
                name="comissao_pct"
                type="number"
                step="0.01"
                defaultValue={pctOuVazio(p.comissao_pct)}
                placeholder="15"
                className="input campo-pct"
              />
            </div>
            <div className="form-campo">
              <label>
                Fixo no fechamento (R$)
                <InfoTooltip texto="Valor pago uma única vez ao parceiro quando um contrato fecha por este canal." />
              </label>
              <input
                name="valor_fixo_fechamento"
                type="number"
                step="0.01"
                defaultValue={numOuVazio(p.valor_fixo_fechamento)}
                placeholder="200"
                className="input campo-dinheiro"
              />
            </div>
            <div className="form-campo">
              <label>
                Crédito de uso (R$)
                <InfoTooltip texto="Crédito único, no fechamento — pro cliente (reduz a receita do mês) ou pro parceiro (soma no custo)." />
              </label>
              <input
                name="credito_uso_valor"
                type="number"
                step="0.01"
                defaultValue={numOuVazio(p.credito_uso_valor)}
                placeholder="100"
                className="input campo-dinheiro"
              />
            </div>
            <div className="form-campo">
              <label>Crédito vai pra</label>
              <select name="credito_uso_destino" className="input campo-select" defaultValue={p.credito_uso_destino ?? "cliente"}>
                <option value="cliente">Cliente</option>
                <option value="parceiro">Parceiro</option>
              </select>
            </div>
          </div>
          <CamposCurvaParceiro valores={p} />
        </>
      )}
    </>
  );
}

function CamposCurvaParceiro({ valores }: { valores?: ParametrosCanal }) {
  return (
    <div className="rounded-lg bg-bg p-3">
      <p className="mb-2 flex items-center text-[10.5px] font-medium text-text-muted">
        Curva de intensidade do parceiro
        <InfoTooltip texto="No início da parceria um parceiro costuma trazer mais clientes e com mais frequência — depois esfria. Defina a média inicial, a queda mensal e o piso onde estabiliza." />
      </p>
      <div className="form-linha">
        <div className="form-campo">
          <label>Média inicial (cli./parceiro/mês)</label>
          <input
            name="media_clientes_parceiro_inicial"
            type="number"
            step="0.01"
            defaultValue={numOuVazio(valores?.media_clientes_parceiro_inicial)}
            placeholder="3"
            className="input campo-num"
          />
        </div>
        <div className="form-campo">
          <label>Queda mensal (%)</label>
          <input
            name="queda_intensidade_mensal_pct"
            type="number"
            step="0.01"
            defaultValue={pctOuVazio(valores?.queda_intensidade_mensal_pct)}
            placeholder="20"
            className="input campo-pct"
          />
        </div>
        <div className="form-campo">
          <label>Piso mínimo (cli./mês)</label>
          <input
            name="media_clientes_parceiro_minima"
            type="number"
            step="0.01"
            defaultValue={numOuVazio(valores?.media_clientes_parceiro_minima)}
            placeholder="0,5"
            className="input campo-num"
          />
        </div>
      </div>
    </div>
  );
}

function ParceirosPorFase({
  cenarioId,
  canalId,
  parceirosPorFase,
  parametros,
}: {
  cenarioId: string;
  canalId: string;
  parceirosPorFase: ParceiroFase[];
  parametros: ParametrosCanal | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(salvarParceirosCanal, initialState);
  const quantidadeByFase = new Map(parceirosPorFase.map((p) => [p.fase, p.quantidade_parceiros]));
  const total = parceirosPorFase.reduce((acc, p) => acc + p.quantidade_parceiros, 0);

  // As levas se somam: quem entrou na validação continua ativo na maturidade. E a curva tem piso,
  // então cada parceiro nunca para de trazer cliente. Mostrar o volume que isso gera evita
  // preencher "2 clientes/parceiro" achando que é o total da parceria, e não todo mês, pra sempre.
  const piso = parametros?.media_clientes_parceiro_minima ?? parametros?.media_clientes_parceiro_inicial ?? 0;
  const inicial = parametros?.media_clientes_parceiro_inicial ?? 0;
  let acumulado = 0;
  const projecao = FASES.map((f) => {
    acumulado += quantidadeByFase.get(f.value) ?? 0;
    return { label: f.label, parceiros: acumulado, novosMes: acumulado * piso };
  }).filter((l) => l.parceiros > 0);
  const ultima = projecao[projecao.length - 1];

  return (
    <div className="mt-2 border-t border-border-soft pt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center text-[10.5px] font-medium text-primary-deep">
        Novos parceiros por fase {total > 0 ? `(${total} no total)` : ""} {open ? "▲" : "▼"}
        <InfoTooltip texto="Quantos parceiros NOVOS entram em cada fase (não é acumulado). Cada leva começa sua própria curva de intensidade, e o custo mensal por parceiro passa a contar a partir da entrada dela." />
      </button>
      {open && (
        <form action={formAction} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="canal_id" value={canalId} />
          <input type="hidden" name="cenario_id" value={cenarioId} />
          <div className="form-linha">
            {FASES.map((f) => (
              <div key={f.value} className="form-campo">
                <label>{f.label}</label>
                <input
                  name={`fase__${f.value}`}
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={quantidadeByFase.get(f.value) ?? ""}
                  placeholder="0"
                  className="input campo-pct"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-primary-deep disabled:opacity-60"
            >
              {pending ? "Salvando…" : "Salvar parceiros"}
            </button>
            {state.error && <p className="text-[10.5px] text-danger">{state.error}</p>}
          </div>

          {projecao.length > 0 && (
            <div className="rounded-lg bg-bg p-2.5">
              <p className="mb-1.5 text-[10.5px] font-medium text-text-muted">
                O que essa configuração gera (parceiros ativos acumulados × piso da curva)
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {projecao.map((l) => (
                  <span key={l.label} className="text-[10.5px] text-text-muted">
                    {l.label}: <strong className="text-text">{l.parceiros}</strong> ativos ·{" "}
                    <strong className="text-text">{l.novosMes.toFixed(1)}</strong> novos/mês
                  </span>
                ))}
              </div>
              {ultima && (
                <p className="mt-1.5 text-[10px] text-text-faint">
                  Na última fase isso são ~{Math.round(ultima.novosMes * 12)} clientes por ano só deste canal, todo ano — cada
                  parceiro entrega {inicial} cliente(s)/mês no começo e nunca cai abaixo de {piso}/mês.
                </p>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
