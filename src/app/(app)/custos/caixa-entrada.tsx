"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  urlDocumentoEntrada,
  buscarDespesasPorDescricao,
  associarDocumento,
  lerDocumentoEntrada,
  lancarDoDocumento,
  descartarDocumento,
} from "./entrada-actions";

export type DocumentoEntrada = {
  id: string;
  remetente_nome: string | null;
  nome_arquivo: string | null;
  caminho_arquivo: string;
  tipo_mime: string | null;
  observacao: string | null;
  created_at: string;
};
type PlanoContas = { id: string; codigo: string; conta: string };
type TipoDoc = "fatura" | "comprovante_pagamento";
type DespesaAchada = { id: string; data_gasto: string; descricao: string | null; valor_total: number; comprovado: boolean; conta: string | null };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
const LABEL_TIPO: Record<TipoDoc, string> = { fatura: "Fatura / Nota Fiscal", comprovante_pagamento: "Comprovante de pagamento" };

export function CaixaEntrada({
  documentos,
  planoContas,
  pagadores,
}: {
  documentos: DocumentoEntrada[];
  planoContas: PlanoContas[];
  pagadores: string[];
}) {
  if (documentos.length === 0) return null;
  return (
    <div className="rounded-xl border border-wine/30 bg-wine-soft/40 p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-sm font-semibold text-wine-deep">
          Caixa de entrada — documentos recebidos ({documentos.length})
        </h2>
      </div>
      <p className="mb-4 text-[11.5px] text-text-muted">
        Chegaram por compartilhamento. Diga de cada um se é fatura/NF ou comprovante, e se é de uma despesa que já existe ou nova.
      </p>
      <div className="flex flex-col gap-3">
        {documentos.map((d) => (
          <DocumentoCard key={d.id} doc={d} planoContas={planoContas} pagadores={pagadores} />
        ))}
      </div>
    </div>
  );
}

function DocumentoCard({ doc, planoContas, pagadores }: { doc: DocumentoEntrada; planoContas: PlanoContas[]; pagadores: string[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoDoc | null>(null);
  const [destino, setDestino] = useState<"existente" | "nova" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const acao = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      setErro(null);
      const r = await fn();
      if (r.error) setErro(r.error);
      else router.refresh();
    });

  async function abrir() {
    const url = await urlDocumentoEntrada(doc.caminho_arquivo);
    if (url) window.open(url, "_blank");
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-[12.5px]">
          <button type="button" onClick={abrir} className="font-medium text-primary-deep underline underline-offset-2">
            {doc.nome_arquivo || "documento"}
          </button>
          <span className="ml-2 text-[11px] text-text-faint">
            {doc.remetente_nome ? `de ${doc.remetente_nome} · ` : ""}
            {quando(doc.created_at)}
          </span>
          {doc.observacao && <div className="mt-0.5 text-[11px] text-text-muted">{doc.observacao}</div>}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm("Descartar esse documento?")) acao(() => descartarDocumento(doc.id));
          }}
          className="text-[11px] text-danger disabled:opacity-50"
        >
          Descartar
        </button>
      </div>

      {/* Passo 1: tipo */}
      <div className="mt-3">
        <div className="mb-1 text-[10.5px] text-text-faint">O que é?</div>
        <div className="flex flex-wrap gap-2">
          {(["fatura", "comprovante_pagamento"] as TipoDoc[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTipo(t);
                setDestino(null);
              }}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium ${
                tipo === t ? "border-wine bg-wine text-white" : "border-border text-text-muted"
              }`}
            >
              {LABEL_TIPO[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Passo 2: destino */}
      {tipo && (
        <div className="mt-3">
          <div className="mb-1 text-[10.5px] text-text-faint">De qual despesa?</div>
          <div className="flex flex-wrap gap-2">
            {(["existente", "nova"] as const).map((dst) => (
              <button
                key={dst}
                type="button"
                onClick={() => setDestino(dst)}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium ${
                  destino === dst ? "border-primary bg-primary-soft text-primary-deep" : "border-border text-text-muted"
                }`}
              >
                {dst === "existente" ? "Despesa que já existe" : "Nova despesa"}
              </button>
            ))}
          </div>
        </div>
      )}

      {tipo && destino === "existente" && (
        <AssociarExistente docId={doc.id} tipo={tipo} pending={pending} onAssociar={(despesaId, marcar) => acao(() => associarDocumento({ docId: doc.id, despesaId, tipo, marcarComprovada: marcar }))} />
      )}

      {tipo && destino === "nova" && (
        <LancarNova docId={doc.id} tipo={tipo} planoContas={planoContas} pagadores={pagadores} pending={pending} onLancar={(campos) => acao(() => lancarDoDocumento({ docId: doc.id, tipo, ...campos }))} />
      )}

      {erro && <p className="mt-2 text-[11px] text-danger">{erro}</p>}
    </div>
  );
}

function AssociarExistente({
  tipo,
  pending,
  onAssociar,
}: {
  docId: string;
  tipo: TipoDoc;
  pending: boolean;
  onAssociar: (despesaId: string, marcarComprovada: boolean) => void;
}) {
  const [termo, setTermo] = useState("");
  const [lista, setLista] = useState<DespesaAchada[]>([]);
  const [escolhida, setEscolhida] = useState<DespesaAchada | null>(null);
  const [marcar, setMarcar] = useState(true);
  const [buscando, startBusca] = useTransition();

  function buscar() {
    startBusca(async () => setLista(await buscarDespesasPorDescricao(termo)));
  }

  return (
    <div className="mt-3 rounded-lg border border-border-soft bg-bg p-3">
      <div className="flex gap-2">
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), buscar())}
          placeholder="Descrição / fornecedor"
          className="input flex-1"
        />
        <button type="button" onClick={buscar} disabled={buscando} className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-primary-deep disabled:opacity-50">
          {buscando ? "…" : "Buscar"}
        </button>
      </div>

      {lista.length > 0 && (
        <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
          {lista.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setEscolhida(d)}
              className={`rounded-md border px-3 py-2 text-left text-[12px] ${escolhida?.id === d.id ? "border-primary bg-primary-soft" : "border-border-soft bg-surface"}`}
            >
              <div className="font-medium">{d.descricao || d.conta || "despesa"}</div>
              <div className="text-[10.5px] text-text-faint">
                {new Date(d.data_gasto + "T00:00:00").toLocaleDateString("pt-BR")} · {formatBRL(d.valor_total)}
                {d.conta ? ` · ${d.conta}` : ""} · {d.comprovado ? "comprovada" : "pendente"}
              </div>
            </button>
          ))}
        </div>
      )}
      {!buscando && termo && lista.length === 0 && <p className="mt-2 text-[11px] text-text-faint">Nada encontrado — ajuste a descrição.</p>}

      {escolhida && (
        <div className="mt-3 border-t border-border-soft pt-3">
          {tipo === "comprovante_pagamento" && (
            <label className="mb-2 flex items-center gap-1.5 text-[11.5px]">
              <input type="checkbox" checked={marcar} onChange={(e) => setMarcar(e.target.checked)} className="h-3.5 w-3.5 rounded border-border" />
              Marcar a despesa como comprovada
            </label>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => onAssociar(escolhida.id, marcar)}
            className="rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60"
          >
            {pending ? "…" : `Anexar ${tipo === "fatura" ? "fatura/NF" : "comprovante"} a essa despesa`}
          </button>
        </div>
      )}
    </div>
  );
}

function LancarNova({
  docId,
  tipo,
  planoContas,
  pagadores,
  pending,
  onLancar,
}: {
  docId: string;
  tipo: TipoDoc;
  planoContas: PlanoContas[];
  pagadores: string[];
  pending: boolean;
  onLancar: (campos: { data_gasto: string; plano_contas_id: string; valor_total: number; descricao: string | null; pagador: string | null }) => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [data, setData] = useState(hoje);
  const [contaId, setContaId] = useState("");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [pagador, setPagador] = useState("");

  async function lerIA() {
    setLendo(true);
    setAviso(null);
    const r = await lerDocumentoEntrada(docId);
    setLendo(false);
    if (r.error || !r.nota) {
      setAviso(r.error ?? "Não consegui ler — preencha à mão.");
      return;
    }
    const n = r.nota;
    if (n.data) setData(n.data);
    if (n.valor != null) setValor(String(n.valor));
    if (n.descricao || n.fornecedor) setDescricao(n.descricao || n.fornecedor || "");
    if (n.conta_codigo) {
      const c = planoContas.find((p) => p.codigo === n.conta_codigo);
      if (c) setContaId(c.id);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border-soft bg-bg p-3">
      <button type="button" onClick={lerIA} disabled={lendo} className="mb-2 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-primary-deep disabled:opacity-50">
        {lendo ? "Lendo com IA…" : "Ler com IA e preencher"}
      </button>
      {aviso && <p className="mb-2 text-[11px] text-danger">{aviso}</p>}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Data</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="input w-full" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Valor</label>
          <input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} className="input w-full" />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-[10.5px] text-text-faint">Categoria</label>
          <select value={contaId} onChange={(e) => setContaId(e.target.value)} className="input w-full">
            <option value="">Escolha a conta</option>
            {planoContas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.conta}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-[10.5px] text-text-faint">Descrição</label>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="input w-full" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-text-faint">Pagador</label>
          <select value={pagador} onChange={(e) => setPagador(e.target.value)} className="input w-full">
            <option value="">—</option>
            {pagadores.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="Empresa">Empresa</option>
          </select>
        </div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => onLancar({ data_gasto: data, plano_contas_id: contaId, valor_total: Number(valor) || 0, descricao: descricao.trim() || null, pagador: pagador || null })}
        className="mt-3 rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60"
      >
        {pending ? "…" : `Lançar como nova despesa (${tipo === "fatura" ? "fatura/NF" : "comprovante"})`}
      </button>
    </div>
  );
}
