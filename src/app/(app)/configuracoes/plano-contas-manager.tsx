"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { useAcaoEdicao } from "@/lib/use-acao-edicao";
import { criarContaPlano, atualizarContaPlano, excluirContaPlano, type ActionState } from "./plano-contas-actions";

export type ContaPlano = {
  id: string;
  codigo: string;
  conta: string;
  tipo: string;
  classificacao: string | null;
  descricao: string | null;
  parent_codigo: string | null;
};

const TIPO_LABEL: Record<string, string> = {
  receita: "Receita",
  deducao: "Dedução",
  cogs: "Custo dos Serviços (COGS)",
  opex: "Despesa Operacional (OPEX)",
  financeiro: "Financeiro",
  capital: "Capital",
  ativo: "Ativo",
};
const TIPOS_ORDEM = ["receita", "deducao", "cogs", "opex", "financeiro", "capital", "ativo"];
const CLASSIFICACAO_LABEL: Record<string, string> = { fixa: "Fixa", variavel: "Variável" };

const initialState: ActionState = { error: null };

/** Ordena "2.3.10" depois de "2.3.9" (não antes, como aconteceria comparando como texto puro) —
 * compara segmento a segmento, numericamente. */
function compararCodigos(a: string, b: string) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function profundidade(codigo: string) {
  return codigo.split(".").length - 1;
}

/** Tela de autoatendimento pro Plano de Contas — pra sócias criarem/ajustarem contas conforme o
 * negócio pede, sem precisar pedir isso numa conversa. Fica em Configurações, recolhida por
 * padrão porque é uma lista grande e não é algo mexido todo dia. */
export function PlanoContasManager({ contas }: { contas: ContaPlano[] }) {
  const [aberto, setAberto] = useState(false);
  const [mostrandoForm, setMostrandoForm] = useState(false);

  const porTipo = useMemo(() => {
    const mapa = new Map<string, ContaPlano[]>();
    for (const c of contas) {
      const atual = mapa.get(c.tipo) ?? [];
      atual.push(c);
      mapa.set(c.tipo, atual);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => compararCodigos(a.codigo, b.codigo));
    return mapa;
  }, [contas]);

  const opcoesPai = useMemo(() => [...contas].sort((a, b) => compararCodigos(a.codigo, b.codigo)), [contas]);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="font-heading text-sm font-semibold">Plano de Contas</h2>
          <p className="mt-1 text-[11.5px] text-text-muted">
            Categorias usadas pra classificar despesas e orçamentos — crie uma nova sempre que surgir um tipo de
            gasto que ainda não existe.
          </p>
        </div>
        <span className="shrink-0 text-[12px] text-primary-deep">{aberto ? "Recolher ▲" : "Gerenciar ▾"}</span>
      </button>

      {aberto && (
        <div className="mt-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {!mostrandoForm && (
              <button
                type="button"
                onClick={() => setMostrandoForm(true)}
                className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white"
              >
                + Nova conta
              </button>
            )}
            <a
              href="/custos/extrato/export/plano-contas"
              className="rounded-lg border border-border px-3.5 py-2 text-[12px] font-medium text-primary-deep"
              title="Planilha .xlsx com código, conta, tipo (DRE), classificação e descrição — pra enviar ao contador ou usar em treinamento."
            >
              ⬇ Baixar plano de contas (.xlsx)
            </a>
          </div>
          {mostrandoForm && <NovaContaForm opcoesPai={opcoesPai} onDone={() => setMostrandoForm(false)} />}

          <div className="flex flex-col gap-3">
            {TIPOS_ORDEM.filter((t) => porTipo.has(t)).map((tipo) => (
              <div key={tipo} className="rounded-lg border border-border-soft">
                <div className="border-b border-border-soft bg-bg px-3.5 py-2 text-[12px] font-semibold">
                  {TIPO_LABEL[tipo] ?? tipo}
                </div>
                <div className="flex flex-col">
                  {(porTipo.get(tipo) ?? []).map((c) => (
                    <ContaRow key={c.id} conta={c} opcoesPai={opcoesPai} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NovaContaForm({ opcoesPai, onDone }: { opcoesPai: ContaPlano[]; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(criarContaPlano, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  if (state.success) onDone();

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2.5 rounded-lg border border-border-soft bg-bg p-4">
      <CamposConta opcoesPai={opcoesPai} />
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">
          {pending ? "…" : "Salvar conta"}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-border px-3.5 py-2 text-[12px] text-text-muted">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function CamposConta({ conta, opcoesPai }: { conta?: ContaPlano; opcoesPai: ContaPlano[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <div>
        <label className="mb-1 block text-[10.5px] text-text-faint">Código</label>
        <input name="codigo" type="text" defaultValue={conta?.codigo} placeholder="Ex: 2.3.5.2" required className="input w-full font-mono" />
      </div>
      <div>
        <label className="mb-1 block text-[10.5px] text-text-faint">Tipo (bloco do DRE)</label>
        <select name="tipo" defaultValue={conta?.tipo ?? "opex"} required className="input w-full">
          {TIPOS_ORDEM.map((t) => (
            <option key={t} value={t}>
              {TIPO_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <label className="mb-1 block text-[10.5px] text-text-faint">Nome da conta</label>
        <input name="conta" type="text" defaultValue={conta?.conta} placeholder="Ex: G&A — Associações e Filiações de Classe" required className="input w-full" />
      </div>
      <div>
        <label className="mb-1 block text-[10.5px] text-text-faint">Classificação (opcional)</label>
        <select name="classificacao" defaultValue={conta?.classificacao ?? ""} className="input w-full">
          <option value="">—</option>
          <option value="fixa">Fixa</option>
          <option value="variavel">Variável</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[10.5px] text-text-faint">Conta pai (opcional)</label>
        <select name="parent_codigo" defaultValue={conta?.parent_codigo ?? ""} className="input w-full">
          <option value="">— Nenhuma (conta de topo)</option>
          {opcoesPai
            .filter((o) => o.codigo !== conta?.codigo)
            .map((o) => (
              <option key={o.id} value={o.codigo}>
                {o.codigo} — {o.conta}
              </option>
            ))}
        </select>
      </div>
      <div className="col-span-2">
        <label className="mb-1 block text-[10.5px] text-text-faint">Descrição (opcional)</label>
        <input name="descricao" type="text" defaultValue={conta?.descricao ?? ""} placeholder="O que costuma entrar aqui" className="input w-full" />
      </div>
    </div>
  );
}

function ContaRow({ conta, opcoesPai }: { conta: ContaPlano; opcoesPai: ContaPlano[] }) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useAcaoEdicao(atualizarContaPlano, initialState, () => setEditando(false));
  const [excluindo, startExclusao] = useTransition();
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);


  if (editando) {
    return (
      <form action={formAction} className="border-t border-border-soft p-4 first:border-t-0">
        <input type="hidden" name="id" value={conta.id} />
        <CamposConta conta={conta} opcoesPai={opcoesPai} />
        {state.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
        <div className="mt-2.5 flex gap-2">
          <button type="submit" disabled={pending} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">
            {pending ? "…" : "Salvar"}
          </button>
          <button type="button" onClick={() => setEditando(false)} className="rounded-lg border border-border px-3.5 py-2 text-[12px] text-text-muted">
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="border-t border-border-soft py-2.5 pr-3.5 text-[12px] first:border-t-0" style={{ paddingLeft: `${14 + profundidade(conta.codigo) * 16}px` }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-text-faint">{conta.codigo}</span>
          <span className="ml-2 font-medium">{conta.conta}</span>
          {conta.classificacao && (
            <span className="ml-2 rounded bg-bg px-1.5 py-0.5 text-[9.5px] text-text-faint">{CLASSIFICACAO_LABEL[conta.classificacao]}</span>
          )}
          {conta.descricao && <p className="mt-0.5 truncate text-[10.5px] text-text-faint">{conta.descricao}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <button type="button" onClick={() => setEditando(true)} className="text-[11.5px] font-medium text-primary-deep">
            Editar
          </button>
          <button
            type="button"
            disabled={excluindo}
            onClick={() => {
              if (!confirm(`Excluir "${conta.codigo} — ${conta.conta}"?`)) return;
              setErroExclusao(null);
              startExclusao(async () => {
                const resultado = await excluirContaPlano(conta.id);
                if (resultado.error) setErroExclusao(resultado.error);
              });
            }}
            className="text-[11.5px] font-medium text-danger disabled:opacity-50"
          >
            {excluindo ? "…" : "Excluir"}
          </button>
        </div>
      </div>
      {erroExclusao && <p className="mt-1 text-[10.5px] text-danger">{erroExclusao}</p>}
    </div>
  );
}
