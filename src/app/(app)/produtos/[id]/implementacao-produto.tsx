"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import {
  salvarConfigImplementacao,
  criarEtapaImplementacao,
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

const initialState: ActionState = { error: null };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const SENIORIDADE_LABEL: Record<string, string> = { junior: "Júnior", pleno: "Pleno", senior: "Sênior" };

export function ImplementacaoProduto({
  produtoId,
  cenarioId,
  temImplementacao,
  precoImplementacao,
  parcelas,
  etapas,
  tabelaCustoHora,
}: {
  produtoId: string;
  cenarioId: string;
  temImplementacao: boolean;
  precoImplementacao: number | null;
  parcelas: number;
  etapas: EtapaImplementacao[];
  tabelaCustoHora: CustoHora[];
}) {
  const [configState, configAction, configPending] = useActionState(salvarConfigImplementacao, initialState);
  const [ativo, setAtivo] = useState(temImplementacao);
  const [precoDigitado, setPrecoDigitado] = useState(precoImplementacao != null ? String(precoImplementacao) : "");

  const custoTotal = etapas.reduce((acc, e) => acc + Number(e.horas) * Number(e.valor_hora), 0);
  const horasTotal = etapas.reduce((acc, e) => acc + Number(e.horas), 0);
  const precoVenda = Number(precoDigitado) || 0;
  const margemValor = precoVenda - custoTotal;
  const margemPct = precoVenda > 0 ? (margemValor / precoVenda) * 100 : null;
  const markupPct = custoTotal > 0 ? (margemValor / custoTotal) * 100 : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 flex items-center font-heading text-[13px] font-semibold">
        Implementação
        <InfoTooltip texto="Cobrança única na primeira contratação do produto: se o cliente adicionar um módulo depois, não cobra de novo; se comprar tudo junto, é a mesma cobrança única. O custo das etapas entra em COGS no mês do onboarding (o trabalho acontece ali, mesmo que o cliente pague parcelado), e é o que permite medir margem bruta do produto." />
      </h2>
      <p className="mb-4 text-[11px] text-text-muted">
        Vale só pra este produto — cliente que assina outro produto junto não paga implementação dele.
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
            <div className="form-campo">
              <label>
                Parcelas
                <InfoTooltip texto="Em quantas parcelas mensais a cobrança é diluída. 1 = à vista. O custo continua lançado inteiro no mês do onboarding." />
              </label>
              <input
                name="implementacao_parcelas"
                type="number"
                min="1"
                step="1"
                defaultValue={parcelas}
                className="input campo-pct"
              />
            </div>
          </div>
        )}

        {configState.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[11px] text-danger">{configState.error}</p>}

        <button
          type="submit"
          disabled={configPending}
          className="self-start rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60"
        >
          {configPending ? "Salvando…" : "Salvar implementação"}
        </button>
      </form>

      {ativo && (
        <>
          <EtapasImplementacao
            produtoId={produtoId}
            cenarioId={cenarioId}
            etapas={etapas}
            tabelaCustoHora={tabelaCustoHora}
            custoTotal={custoTotal}
            horasTotal={horasTotal}
          />

          <div className="mt-4 rounded-lg bg-bg px-4 py-3.5">
            <p className="mb-2 flex items-center text-[11.5px] font-semibold text-text-muted">
              Margem e markup da implementação
              <InfoTooltip texto="Margem = quanto sobra sobre o preço de venda. Markup = quanto o preço está acima do custo. Os dois respondem perguntas diferentes: margem olha pro que entra, markup olha pro que você gastou." />
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
              <Indicador rotulo="Preço de venda" valor={formatBRL(precoVenda)} />
              <Indicador rotulo="Custo direto (COGS)" valor={formatBRL(custoTotal)} />
              <Indicador
                rotulo="Margem"
                valor={`${formatBRL(margemValor)}${margemPct != null ? ` · ${margemPct.toFixed(1)}%` : ""}`}
                destaque={margemValor >= 0 ? "ok" : "ruim"}
              />
              <Indicador rotulo="Markup" valor={markupPct != null ? `${markupPct.toFixed(1)}%` : "—"} />
            </div>
            {parcelas > 1 && precoVenda > 0 && (
              <p className="mt-2 text-[10.5px] text-text-faint">
                Parcelado em {parcelas}x de {formatBRL(precoVenda / parcelas)} — o custo de {formatBRL(custoTotal)} entra
                inteiro no mês do onboarding.
              </p>
            )}
          </div>
        </>
      )}
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

function EtapasImplementacao({
  produtoId,
  cenarioId,
  etapas,
  tabelaCustoHora,
  custoTotal,
  horasTotal,
}: {
  produtoId: string;
  cenarioId: string;
  etapas: EtapaImplementacao[];
  tabelaCustoHora: CustoHora[];
  custoTotal: number;
  horasTotal: number;
}) {
  const [state, formAction, pending] = useActionState(criarEtapaImplementacao, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [cargoExecutor, setCargoExecutor] = useState("");
  const [senioridade, setSenioridade] = useState("pleno");
  const [tipo, setTipo] = useState("pj");

  const cargos = useMemo(() => [...new Set(tabelaCustoHora.map((t) => t.cargo))].sort(), [tabelaCustoHora]);

  // O valor/hora vem do cargo que EXECUTA as horas (o cargo de apoio da sua planilha), não do dono
  // da etapa — é ele quem determina o custo real.
  const valorHoraSugerido = useMemo(() => {
    const achado = tabelaCustoHora.find(
      (t) => t.cargo === cargoExecutor && t.senioridade === senioridade && t.tipo_contratacao === tipo,
    );
    return achado ? Number(achado.valor_hora) : null;
  }, [tabelaCustoHora, cargoExecutor, senioridade, tipo]);

  return (
    <div className="mt-4">
      <p className="mb-2 flex items-center text-[11.5px] font-semibold text-text-muted">
        Etapas da implantação
        <InfoTooltip texto="O valor/hora é puxado automaticamente da tabela de custo/hora pelo cargo que executa as horas, a senioridade e o tipo de contratação." />
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
            {etapas.map((e) => (
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
                <td className="px-2 py-2 text-right font-mono text-[11.5px] font-semibold">
                  {formatBRL(Number(e.horas) * Number(e.valor_hora))}
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => startTransition(() => excluirEtapaImplementacao(e.id, produtoId))}
                    className="text-[10.5px] text-danger"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {etapas.length > 0 && (
              <tr>
                <td className="px-2 py-2 text-[11px] font-semibold">Custo direto total (COGS)</td>
                <td></td>
                <td className="px-2 py-2 text-right font-mono text-[11.5px] font-semibold">{horasTotal}h</td>
                <td></td>
                <td className="px-2 py-2 text-right font-mono text-[12.5px] font-bold text-primary-deep">
                  {formatBRL(custoTotal)}
                </td>
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
            <select
              name="senioridade"
              value={senioridade}
              onChange={(e) => setSenioridade(e.target.value)}
              className="input campo-num"
            >
              <option value="junior">Júnior</option>
              <option value="pleno">Pleno</option>
              <option value="senior">Sênior</option>
            </select>
          </div>
          <div className="form-campo">
            <label>Contratação</label>
            <select
              name="tipo_contratacao"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="input campo-pct"
            >
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
