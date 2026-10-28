"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { salvarItem, excluirItem, iniciarUploadEticket, lerEticket, registrarAnexo, excluirAnexo, urlAnexo, lancarDespesaDoItem } from "../actions";
import type { TipoItemViagem } from "@/lib/viagens-ia";

export type ItemViagem = {
  id: string;
  viagem_id: string;
  tipo: TipoItemViagem;
  titulo: string;
  fornecedor: string | null;
  inicio: string | null;
  fim: string | null;
  origem: string | null;
  destino: string | null;
  local: string | null;
  localizador: string | null;
  endereco: string | null;
  detalhes: { observacoes?: string | null; valor?: number | null; despesa_id?: string | null } | null;
};
export type AnexoViagem = { id: string; item_id: string | null; nome_arquivo: string; caminho_arquivo: string; tipo_mime: string | null };

const TIPOS: { v: TipoItemViagem; l: string }[] = [
  { v: "voo", l: "Voo / Passagem" },
  { v: "hospedagem", l: "Hospedagem" },
  { v: "carro", l: "Aluguel de carro" },
  { v: "transporte", l: "Transporte" },
  { v: "evento", l: "Evento" },
  { v: "seguro", l: "Seguro viagem" },
  { v: "outro", l: "Outro" },
];
const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.v, t.l])) as Record<TipoItemViagem, string>;

type Rascunho = {
  id?: string;
  viagemId: string;
  tipo?: string;
  titulo?: string;
  fornecedor?: string | null;
  inicio?: string | null;
  fim?: string | null;
  origem?: string | null;
  destino?: string | null;
  local?: string | null;
  localizador?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
  valor?: number | null;
  participantes?: string[];
  anexo?: { caminho: string; nome: string; mime: string; tamanho: number };
};
type CampoTexto = "tipo" | "titulo" | "fornecedor" | "inicio" | "fim" | "origem" | "destino" | "local" | "localizador" | "endereco" | "observacoes";

const paraInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmtHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
const diaKey = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA") : "sem");
const diaLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) : "Sem data definida";

export function Itinerario({ viagemId, itens, anexos, participantesViagem, participantesPorItem }: {
  viagemId: string;
  itens: ItemViagem[];
  anexos: AnexoViagem[];
  participantesViagem: { id: string; nome: string }[];
  participantesPorItem: Record<string, string[]>;
}) {
  const todosIds = participantesViagem.map((p) => p.id);
  const cap = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);
  const nomeDe = (id: string) => cap(participantesViagem.find((p) => p.id === id)?.nome ?? "");
  const router = useRouter();
  const [form, setForm] = useState<Rascunho | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const anexosDoItem = (itemId: string) => anexos.filter((a) => a.item_id === itemId);
  const anexosSoltos = anexos.filter((a) => !a.item_id);

  async function anexarEticket(file: File) {
    setErro(null);
    setStatus("Enviando e-ticket…");
    const ini = await iniciarUploadEticket(viagemId, file.name);
    if (ini.error || !ini.caminho || !ini.token) { setStatus(null); setErro(ini.error ?? "Falha ao enviar."); return; }
    const { error: upErr } = await createClient().storage.from("comprovantes").uploadToSignedUrl(ini.caminho, ini.token, file, { contentType: file.type || undefined });
    if (upErr) { setStatus(null); setErro("Não consegui enviar o e-ticket."); return; }
    setStatus("Lendo com IA… (pode levar até 1 min)");
    const r = await lerEticket(ini.caminho, file.type || "");
    setStatus(null);
    const anexo = { caminho: ini.caminho, nome: file.name, mime: file.type || "application/pdf", tamanho: file.size };
    if (r.error || !r.item) {
      setErro((r.error ?? "A IA não leu o documento") + " — preencha à mão (o e-ticket já foi anexado).");
      setForm({ viagemId, tipo: "outro", titulo: "", participantes: todosIds, anexo });
      return;
    }
    const it = r.item;
    setForm({ viagemId, tipo: it.tipo, titulo: it.titulo, fornecedor: it.fornecedor, inicio: it.inicio, fim: it.fim, origem: it.origem, destino: it.destino, local: it.local, localizador: it.localizador, endereco: it.endereco, observacoes: it.observacoes, valor: it.valor, participantes: todosIds, anexo });
  }

  function salvar() {
    if (!form) return;
    setErro(null);
    startSalvar(async () => {
      const r = await salvarItem({
        id: form.id,
        viagemId,
        tipo: (form.tipo ?? "outro") as TipoItemViagem,
        titulo: form.titulo ?? "",
        fornecedor: form.fornecedor, inicio: form.inicio, fim: form.fim, origem: form.origem,
        destino: form.destino, local: form.local, localizador: form.localizador, endereco: form.endereco,
        observacoes: form.observacoes, valor: form.valor,
        participantes: form.participantes ?? todosIds,
      });
      if (r.error || !r.id) { setErro(r.error ?? "Não consegui salvar."); return; }
      if (form.anexo) await registrarAnexo(viagemId, r.id, form.anexo.caminho, form.anexo.nome, form.anexo.mime, form.anexo.tamanho);
      setForm(null);
      router.refresh();
    });
  }

  function remover(item: ItemViagem) {
    if (!confirm(`Remover "${item.titulo}"?`)) return;
    startSalvar(async () => { await excluirItem(item.id, viagemId); router.refresh(); });
  }

  function lancar(item: ItemViagem) {
    setErro(null);
    startSalvar(async () => {
      const r = await lancarDespesaDoItem(item.id);
      if (r.error) setErro(r.error);
      else router.refresh();
    });
  }

  async function abrir(caminho: string) {
    const url = await urlAnexo(caminho);
    if (url) window.open(url, "_blank", "noopener");
    else setErro("Não consegui abrir o e-ticket.");
  }

  function removerAnexo(a: AnexoViagem) {
    if (!confirm(`Remover o e-ticket "${a.nome_arquivo}"?`)) return;
    startSalvar(async () => { await excluirAnexo(a.id, a.caminho_arquivo, viagemId); router.refresh(); });
  }

  // Agrupa por dia
  const grupos = new Map<string, ItemViagem[]>();
  for (const it of itens) {
    const k = diaKey(it.inicio);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(it);
  }
  const dias = [...grupos.entries()].sort((a, b) => (a[0] === "sem" ? 1 : b[0] === "sem" ? -1 : a[0].localeCompare(b[0])));

  const campo = (k: CampoTexto, v: string) => setForm((f) => ({ ...(f ?? { viagemId }), [k]: v }));

  return (
    <div className="flex flex-col gap-4">
      {!form && (
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="cursor-pointer rounded-lg bg-wine-deep px-3.5 py-2 text-[12.5px] font-medium text-white">
            {status ?? "Anexar e-ticket (IA preenche)"}
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" disabled={!!status}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) anexarEticket(f); }} />
          </label>
          <button type="button" onClick={() => setForm({ viagemId, tipo: "voo", titulo: "", participantes: todosIds })} className="rounded-lg border border-primary-fill px-3.5 py-2 text-[12.5px] font-medium text-primary-deep">
            Adicionar manual
          </button>
          {status && <span className="text-[11.5px] text-text-muted">{status}</span>}
        </div>
      )}
      {erro && <p className="text-[12px] text-danger">{erro}</p>}

      {form && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <h2 className="font-heading text-sm font-semibold">{form.id ? "Editar item" : "Novo item"}{form.anexo ? " · e-ticket anexado" : ""}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px]">Tipo
              <select value={form.tipo ?? "voo"} onChange={(e) => campo("tipo", e.target.value)} className="input">
                {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Título <span className="text-text-faint">(obrigatório)</span>
              <input value={form.titulo ?? ""} onChange={(e) => campo("titulo", e.target.value)} className="input" placeholder="Ex.: Voo GRU → REC" />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Fornecedor
              <input value={form.fornecedor ?? ""} onChange={(e) => campo("fornecedor", e.target.value)} className="input" placeholder="Companhia / hotel / locadora" />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Localizador / código
              <input value={form.localizador ?? ""} onChange={(e) => campo("localizador", e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Início
              <input type="datetime-local" value={paraInput(form.inicio)} onChange={(e) => campo("inicio", e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Fim
              <input type="datetime-local" value={paraInput(form.fim)} onChange={(e) => campo("fim", e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Origem
              <input value={form.origem ?? ""} onChange={(e) => campo("origem", e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Destino
              <input value={form.destino ?? ""} onChange={(e) => campo("destino", e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-[12px] sm:col-span-2">Endereço
              <input value={form.endereco ?? ""} onChange={(e) => campo("endereco", e.target.value)} className="input" placeholder="Endereço do hotel / local do evento" />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Valor (R$) <span className="text-text-faint">(pra lançar no Custos)</span>
              <input type="number" step="0.01" min="0" value={form.valor ?? ""} onChange={(e) => setForm((f) => ({ ...(f ?? { viagemId }), valor: e.target.value === "" ? null : Number(e.target.value) }))} className="input" placeholder="0,00" />
            </label>
            <label className="flex flex-col gap-1 text-[12px] sm:col-span-2">Observações
              <input value={form.observacoes ?? ""} onChange={(e) => campo("observacoes", e.target.value)} className="input" placeholder="Assento, portão, check-in, telefone…" />
            </label>
            {participantesViagem.length > 0 && (
              <div className="sm:col-span-2">
                <p className="mb-1 text-[12px]">Quem está neste trecho</p>
                <div className="flex flex-wrap gap-3">
                  {participantesViagem.map((p) => {
                    const marcado = (form.participantes ?? todosIds).includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-1.5 text-[12px]">
                        <input type="checkbox" checked={marcado} onChange={(e) => setForm((f) => {
                          const atual = new Set(f?.participantes ?? todosIds);
                          if (e.target.checked) atual.add(p.id); else atual.delete(p.id);
                          return { ...(f ?? { viagemId }), participantes: [...atual] };
                        })} className="h-3.5 w-3.5 rounded border-border" />
                        {cap(p.nome)}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={salvar} disabled={salvando} className="rounded-lg bg-wine-deep px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60">
              {salvando ? "Salvando…" : "Salvar item"}
            </button>
            <button type="button" onClick={() => { setForm(null); setErro(null); }} className="rounded-lg border border-border px-4 py-2 text-[13px] text-text-muted">Cancelar</button>
          </div>
        </div>
      )}

      {itens.length === 0 && !form ? (
        <p className="text-[13px] text-text-muted">Nenhum item ainda. Anexe um e-ticket (a IA preenche) ou adicione manual.</p>
      ) : (
        dias.map(([k, lista]) => (
          <div key={k}>
            <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-text-faint">{diaLabel(lista[0].inicio)}</p>
            <div className="flex flex-col gap-2">
              {lista.map((it) => {
                const obs = it.detalhes?.observacoes;
                const soDessas = participantesPorItem[it.id] ?? [];
                const mapa = it.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.endereco)}` : null;
                const waze = it.endereco ? `https://waze.com/ul?q=${encodeURIComponent(it.endereco)}` : null;
                return (
                  <div key={it.id} className="rounded-xl border border-border bg-surface p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="inline-block rounded bg-primary-soft px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-primary-deep">{TIPO_LABEL[it.tipo]}</span>
                        <p className="mt-1 text-[13px] font-semibold">{it.titulo}</p>
                        <p className="text-[11.5px] text-text-muted">
                          {[fmtHora(it.inicio), it.fim ? `até ${fmtHora(it.fim)}` : null].filter(Boolean).join(" ")}
                          {it.fornecedor ? ` · ${it.fornecedor}` : ""}
                          {(it.origem || it.destino) ? ` · ${[it.origem, it.destino].filter(Boolean).join(" → ")}` : ""}
                        </p>
                        {it.localizador && (
                          <p className="mt-0.5 text-[11.5px] text-text-muted">Localizador: <span className="font-mono text-text">{it.localizador}</span>{" "}
                            <button type="button" onClick={() => navigator.clipboard?.writeText(it.localizador!)} className="text-primary-deep">copiar</button>
                          </p>
                        )}
                        {it.endereco && (
                          <p className="mt-0.5 text-[11.5px] text-text-muted">
                            📍 {it.endereco}{" "}
                            {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer" className="text-primary-deep">Maps</a>}{" · "}
                            {waze && <a href={waze} target="_blank" rel="noopener noreferrer" className="text-primary-deep">Waze</a>}
                          </p>
                        )}
                        {obs && <p className="mt-0.5 text-[11px] text-text-faint">{obs}</p>}
                        {soDessas.length > 0 && soDessas.length < todosIds.length && (
                          <p className="mt-0.5 text-[11px] text-text-faint">Só: {soDessas.map(nomeDe).join(", ")}</p>
                        )}
                        {anexosDoItem(it.id).map((a) => (
                          <p key={a.id} className="mt-1 text-[11.5px]">
                            <button type="button" onClick={() => abrir(a.caminho_arquivo)} className="font-medium text-primary-deep">📎 {a.nome_arquivo}</button>{" "}
                            <button type="button" onClick={() => removerAnexo(a)} className="text-danger">remover</button>
                          </p>
                        ))}
                        {it.detalhes?.valor != null && (
                          <p className="mt-1 text-[11.5px]">
                            <span className="text-text-muted">Valor: </span>
                            <span className="font-medium">{it.detalhes.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>{" "}
                            {it.detalhes.despesa_id ? (
                              <span className="text-success">· ✓ no Custos</span>
                            ) : (
                              <button type="button" onClick={() => lancar(it)} className="font-medium text-primary-deep">· Lançar no Custos</button>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <button type="button" onClick={() => setForm({ id: it.id, viagemId, tipo: it.tipo, titulo: it.titulo, fornecedor: it.fornecedor, inicio: it.inicio, fim: it.fim, origem: it.origem, destino: it.destino, local: it.local, localizador: it.localizador, endereco: it.endereco, observacoes: obs, valor: it.detalhes?.valor ?? null, participantes: participantesPorItem[it.id]?.length ? participantesPorItem[it.id] : todosIds })} className="text-[11.5px] font-medium text-primary-deep">Editar</button>
                        <button type="button" onClick={() => remover(it)} className="text-[11.5px] font-medium text-danger">Remover</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {anexosSoltos.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-text-faint">Documentos da viagem</p>
          <div className="flex flex-col gap-1.5">
            {anexosSoltos.map((a) => (
              <p key={a.id} className="text-[12px]">
                <button type="button" onClick={() => abrir(a.caminho_arquivo)} className="font-medium text-primary-deep">📎 {a.nome_arquivo}</button>{" "}
                <button type="button" onClick={() => removerAnexo(a)} className="text-danger">remover</button>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
