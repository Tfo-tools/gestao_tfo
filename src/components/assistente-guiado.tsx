"use client";

/**
 * Assistente guiado reutilizável: conduz uma pergunta por vez, feito o "inserir manualmente"
 * conversacional do app de viagens da família. O mesmo motor serve Viagens, Lançamentos e
 * qualquer aba que precise inserir/importar dados.
 *
 * - Uma pergunta por card; as respostas já dadas ficam como "chips" no topo (toque pra corrigir).
 * - "Pular" nos opcionais; Voltar/Continuar; revisão no fim → salva.
 * - Integra com leitura por IA: passe `respostasIniciais` com o que a IA preencheu e
 *   `pularPreenchidos` — o assistente começa no primeiro campo que faltou.
 * - `onFormularioDireto` mostra o link "preencher no formulário" (mantém o form antigo acessível).
 *
 * Cada passo é declarativo (tipo + opções) ou traz um `render` próprio pros campos especiais
 * (busca de conta, forma de pagamento), sem o motor precisar conhecê-los.
 */

import { useMemo, useState } from "react";

export type RespostaValor = string | number | boolean | string[] | null;
export type Respostas = Record<string, RespostaValor>;
export type OpcaoPasso = { valor: string; rotulo: string; dica?: string };

export type PassoGuiado = {
  /** Chave da resposta (vira a propriedade em `respostas`). */
  id: string;
  /** A pergunta mostrada no card. */
  pergunta: string;
  /** Rótulo curto pro chip e pra revisão (cai na pergunta se faltar). */
  rotulo?: string;
  /** Texto de ajuda abaixo da pergunta. */
  ajuda?: string;
  obrigatorio?: boolean;
  tipo?: "texto" | "textarea" | "numero" | "dinheiro" | "data" | "datahora" | "opcoes" | "multi" | "sim-nao";
  opcoes?: OpcaoPasso[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Só aparece quando isto for verdadeiro (ex.: origem só pra voo). */
  quando?: (r: Respostas) => boolean;
  /** Valor inicial, se não vier de `respostasIniciais`. */
  padrao?: RespostaValor | ((r: Respostas) => RespostaValor);
  /** Como mostrar a resposta no chip/revisão. */
  resumo?: (valor: RespostaValor, r: Respostas) => string;
  /** Validação — devolve a mensagem de erro, ou null se ok. */
  validar?: (valor: RespostaValor, r: Respostas) => string | null;
  /** Campo customizado (busca de conta, forma de pagamento…). */
  render?: (args: {
    valor: RespostaValor;
    setValor: (v: RespostaValor) => void;
    avancar: () => void;
    respostas: Respostas;
  }) => React.ReactNode;
};

const vazio = (v: RespostaValor) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

function resumoDe(p: PassoGuiado, v: RespostaValor, r: Respostas): string {
  if (p.resumo) return p.resumo(v, r);
  if (vazio(v)) return "—";
  if (Array.isArray(v))
    return v.map((x) => p.opcoes?.find((o) => o.valor === x)?.rotulo ?? x).join(", ") || "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (p.opcoes) return p.opcoes.find((o) => o.valor === v)?.rotulo ?? String(v);
  if (p.tipo === "dinheiro") return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (p.tipo === "data" && typeof v === "string") return new Date(v + "T00:00").toLocaleDateString("pt-BR");
  if (p.tipo === "datahora" && typeof v === "string")
    return new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return String(v);
}

export function AssistenteGuiado({
  passos,
  respostasIniciais,
  pularPreenchidos = false,
  onSalvar,
  onFormularioDireto,
  onCancelar,
  titulo,
  rotuloSalvar = "Salvar",
}: {
  passos: PassoGuiado[];
  respostasIniciais?: Respostas;
  /** Começa no primeiro campo que faltou (útil depois da leitura por IA). */
  pularPreenchidos?: boolean;
  onSalvar: (r: Respostas) => Promise<{ error?: string | null } | void>;
  onFormularioDireto?: () => void;
  onCancelar?: () => void;
  titulo?: string;
  rotuloSalvar?: string;
}) {
  const [respostas, setRespostas] = useState<Respostas>(() => {
    const r: Respostas = {};
    for (const p of passos) {
      const inicial = respostasIniciais?.[p.id];
      if (inicial !== undefined) r[p.id] = inicial;
      else if (p.padrao !== undefined) r[p.id] = typeof p.padrao === "function" ? p.padrao(respostasIniciais ?? {}) : p.padrao;
      else r[p.id] = null;
    }
    return r;
  });

  const visiveis = useMemo(() => passos.filter((p) => !p.quando || p.quando(respostas)), [passos, respostas]);

  const [idx, setIdx] = useState(() => {
    if (!pularPreenchidos) return 0;
    const vis = passos.filter((p) => !p.quando || p.quando(respostasIniciais ?? {}));
    const i = vis.findIndex((p) => vazio(respostasIniciais?.[p.id] ?? null));
    return i === -1 ? vis.length : i;
  });

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const emRevisao = idx >= visiveis.length;
  const passo = emRevisao ? null : visiveis[Math.min(idx, visiveis.length - 1)];

  const set = (id: string, v: RespostaValor) => setRespostas((r) => ({ ...r, [id]: v }));

  function avancar() {
    if (!passo) return;
    const v = respostas[passo.id] ?? null;
    if (passo.obrigatorio && vazio(v)) {
      setErro("Esse campo é obrigatório.");
      return;
    }
    const msg = passo.validar?.(v, respostas);
    if (msg) {
      setErro(msg);
      return;
    }
    setErro(null);
    setIdx((i) => i + 1);
  }

  function pular() {
    if (!passo) return;
    set(passo.id, null);
    setErro(null);
    setIdx((i) => i + 1);
  }

  function voltar() {
    setErro(null);
    setIdx((i) => Math.max(0, i - 1));
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const r = await onSalvar(respostas);
    setSalvando(false);
    if (r && r.error) {
      setErro(r.error);
      setIdx(visiveis.length); // volta pra revisão
    }
  }

  const passoAbsoluto = passo ? passos.indexOf(passo) : passos.length;
  const progresso = visiveis.length > 0 ? Math.min(idx, visiveis.length) / visiveis.length : 1;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-semibold">{titulo ?? "Vamos preencher juntas"}</h2>
        <div className="flex items-center gap-3 text-[11.5px]">
          {onFormularioDireto && (
            <button type="button" onClick={onFormularioDireto} className="text-text-muted underline underline-offset-2">
              preencher no formulário
            </button>
          )}
          {onCancelar && (
            <button type="button" onClick={onCancelar} className="text-text-muted">
              cancelar
            </button>
          )}
        </div>
      </div>

      {/* Barrinha de progresso */}
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full bg-primary-fill transition-all" style={{ width: `${Math.round(progresso * 100)}%` }} />
      </div>

      {/* Respostas já dadas — toque pra corrigir */}
      {idx > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {visiveis.slice(0, idx).map((p, i) => {
            if (vazio(respostas[p.id] ?? null)) return null;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { setErro(null); setIdx(i); }}
                className="rounded-full border border-border bg-bg px-2.5 py-1 text-[11px] text-text-muted hover:border-primary-fill"
              >
                <span className="text-text-faint">{p.rotulo ?? p.pergunta}: </span>
                <span className="font-medium text-text">{resumoDe(p, respostas[p.id] ?? null, respostas)}</span>
              </button>
            );
          })}
        </div>
      )}

      {passo ? (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[15px] font-medium">{passo.pergunta}</p>
            {passo.ajuda && <p className="mt-1 text-[12px] text-text-muted">{passo.ajuda}</p>}
          </div>

          <CampoDoPasso passo={passo} valor={respostas[passo.id] ?? null} setValor={(v) => set(passo.id, v)} avancar={avancar} respostas={respostas} />

          {erro && <p className="text-[12px] text-danger">{erro}</p>}

          <div className="mt-1 flex items-center gap-2">
            {idx > 0 && (
              <button type="button" onClick={voltar} className="rounded-lg border border-border px-3.5 py-2 text-[13px] text-text-muted">
                Voltar
              </button>
            )}
            <button type="button" onClick={avancar} className="rounded-lg bg-wine-deep px-4 py-2 text-[13px] font-medium text-white">
              Continuar
            </button>
            {!passo.obrigatorio && (
              <button type="button" onClick={pular} className="px-2 py-2 text-[12.5px] text-text-muted">
                Pular
              </button>
            )}
            <span className="ml-auto text-[11px] text-text-faint">
              {Math.min(idx + 1, visiveis.length)} de {visiveis.length}
            </span>
          </div>
        </div>
      ) : (
        /* Revisão final */
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-text-muted">Confira antes de salvar — toque em qualquer item pra ajustar.</p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {visiveis.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setErro(null); setIdx(i); }}
                className="flex w-full items-start justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-bg"
              >
                <span className="text-[12px] text-text-muted">{p.rotulo ?? p.pergunta}</span>
                <span className="text-right text-[12.5px] font-medium">{resumoDe(p, respostas[p.id] ?? null, respostas)}</span>
              </button>
            ))}
          </div>

          {erro && <p className="text-[12px] text-danger">{erro}</p>}

          <div className="mt-1 flex items-center gap-2">
            <button type="button" onClick={voltar} className="rounded-lg border border-border px-3.5 py-2 text-[13px] text-text-muted">
              Voltar
            </button>
            <button type="button" onClick={salvar} disabled={salvando} className="rounded-lg bg-wine-deep px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60">
              {salvando ? "Salvando…" : rotuloSalvar}
            </button>
          </div>
          {/* passoAbsoluto só existe pra deixar claro que a revisão cobre todos os passos */}
          <span className="sr-only">{passoAbsoluto} passos no total</span>
        </div>
      )}
    </div>
  );
}

function CampoDoPasso({
  passo,
  valor,
  setValor,
  avancar,
  respostas,
}: {
  passo: PassoGuiado;
  valor: RespostaValor;
  setValor: (v: RespostaValor) => void;
  avancar: () => void;
  respostas: Respostas;
}) {
  if (passo.render) return <>{passo.render({ valor, setValor, avancar, respostas })}</>;

  const tipo = passo.tipo ?? "texto";

  if (tipo === "sim-nao") {
    return (
      <div className="flex gap-2">
        {[
          { v: true, l: "Sim" },
          { v: false, l: "Não" },
        ].map((o) => (
          <button
            key={o.l}
            type="button"
            onClick={() => { setValor(o.v); setTimeout(avancar, 0); }}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-[13px] font-medium ${
              valor === o.v ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border text-text-muted"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
    );
  }

  if (tipo === "opcoes") {
    return (
      <div className="flex flex-col gap-1.5">
        {(passo.opcoes ?? []).map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => { setValor(o.valor); setTimeout(avancar, 0); }}
            className={`rounded-lg border px-3.5 py-2.5 text-left text-[13px] ${
              valor === o.valor ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border"
            }`}
          >
            <span className="font-medium">{o.rotulo}</span>
            {o.dica && <span className="block text-[11px] text-text-faint">{o.dica}</span>}
          </button>
        ))}
      </div>
    );
  }

  if (tipo === "multi") {
    const atuais = Array.isArray(valor) ? valor : [];
    return (
      <div className="flex flex-wrap gap-2">
        {(passo.opcoes ?? []).map((o) => {
          const marcado = atuais.includes(o.valor);
          return (
            <button
              key={o.valor}
              type="button"
              onClick={() => setValor(marcado ? atuais.filter((x) => x !== o.valor) : [...atuais, o.valor])}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] ${
                marcado ? "border-primary-fill bg-primary-soft text-primary-deep" : "border-border text-text-muted"
              }`}
            >
              {o.rotulo}
            </button>
          );
        })}
      </div>
    );
  }

  if (tipo === "textarea") {
    return (
      <textarea
        value={(valor as string) ?? ""}
        onChange={(e) => setValor(e.target.value)}
        rows={3}
        className="input"
        placeholder={passo.placeholder}
        autoFocus
      />
    );
  }

  const htmlType =
    tipo === "numero" || tipo === "dinheiro" ? "number" : tipo === "data" ? "date" : tipo === "datahora" ? "datetime-local" : "text";

  return (
    <input
      type={htmlType}
      value={valor == null ? "" : String(valor)}
      onChange={(e) =>
        setValor(
          e.target.value === "" ? null : tipo === "numero" || tipo === "dinheiro" ? Number(e.target.value) : e.target.value,
        )
      }
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          avancar();
        }
      }}
      className="input"
      placeholder={passo.placeholder}
      min={passo.min}
      max={passo.max}
      step={passo.step ?? (tipo === "dinheiro" ? 0.01 : undefined)}
      autoFocus
    />
  );
}
