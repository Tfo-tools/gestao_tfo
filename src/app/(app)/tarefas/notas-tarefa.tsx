"use client";

import { useRef, useState, useTransition } from "react";
import { adicionarNota, excluirNota } from "./notas-actions";
import type { NotaTarefa, Pessoa } from "./tipos";

const primeiro = (nome: string) => {
  const n = nome.trim().split(/\s+/)[0] ?? "";
  return n.charAt(0).toUpperCase() + n.slice(1);
};

function quando(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Texto com as menções @nome em destaque. */
function Texto({ texto }: { texto: string }) {
  const partes = texto.split(/(@[\p{L}\p{N}_.-]+)/gu);
  return (
    <span className="whitespace-pre-line">
      {partes.map((p, i) => (p.startsWith("@") ? <span key={i} className="rounded bg-wine-soft px-1 font-medium text-wine">{p}</span> : <span key={i}>{p}</span>))}
    </span>
  );
}

/**
 * Observações da tarefa: lista com data e autora + campo pra escrever. "@nome" avisa a pessoa por
 * push com o link da tarefa — os chips abaixo do campo inserem o @ certo sem digitar.
 */
export function NotasTarefa({ tarefaId, notas, pessoas, usuarioId }: { tarefaId: string; notas: NotaTarefa[]; pessoas: Pessoa[]; usuarioId: string | null }) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, start] = useTransition();
  const campo = useRef<HTMLTextAreaElement>(null);
  const nomeDe = (id: string | null) => (id ? primeiro(pessoas.find((p) => p.id === id)?.nome ?? "") : "");

  const inserirMencao = (nome: string) => {
    const el = campo.current;
    const marca = `@${primeiro(nome)} `;
    if (!el) return setTexto((t) => t + marca);
    const ini = el.selectionStart ?? texto.length;
    const fim = el.selectionEnd ?? texto.length;
    const novo = `${texto.slice(0, ini)}${ini > 0 && !/\s$/.test(texto.slice(0, ini)) ? " " : ""}${marca}${texto.slice(fim)}`;
    setTexto(novo);
    setTimeout(() => {
      el.focus();
      const pos = novo.length - texto.slice(fim).length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const enviar = () => {
    setErro(null);
    setAviso(null);
    start(async () => {
      const r = await adicionarNota(tarefaId, texto);
      if (r.error) return setErro(r.error);
      setTexto("");
      if (r.avisadas && r.avisadas > 0) setAviso("Observação salva · aviso enviado");
    });
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border-soft bg-bg/60 px-2 py-1.5">
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-text-faint">Observações{notas.length > 0 ? ` · ${notas.length}` : ""}</p>
      {notas.length > 0 && (
        <ul className="flex flex-col gap-1">
          {notas.map((n) => (
            <li key={n.id} className="group flex items-start gap-2 text-[11.5px]">
              <span className="min-w-0 flex-1">
                <span className="mr-1.5 text-[10.5px] text-text-faint">
                  {quando(n.criado_em)} · <span className="font-medium text-text-muted">{nomeDe(n.autor_id) || "—"}</span>
                </span>
                <Texto texto={n.texto} />
              </span>
              {n.autor_id === usuarioId && (
                <button
                  type="button"
                  disabled={pendente}
                  title="Excluir observação"
                  aria-label="Excluir observação"
                  onClick={() => {
                    if (!confirm("Excluir esta observação?")) return;
                    start(async () => {
                      const r = await excluirNota(n.id);
                      if (r.error) setErro(r.error);
                    });
                  }}
                  className="shrink-0 text-[11px] text-text-faint opacity-0 hover:text-danger group-hover:opacity-100"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={campo}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar();
        }}
        rows={2}
        placeholder="Escreva uma observação… use @nome para avisar alguém"
        className="input w-full text-[11.5px]"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10.5px] text-text-faint">Avisar:</span>
        {pessoas
          .filter((p) => p.id !== usuarioId)
          .map((p) => (
            <button key={p.id} type="button" onClick={() => inserirMencao(p.nome)} className="rounded-full border border-border px-2 py-0.5 text-[10.5px] text-text-muted hover:border-wine hover:text-wine">
              @{primeiro(p.nome)}
            </button>
          ))}
        <button type="button" disabled={pendente || !texto.trim()} onClick={enviar} className="ml-auto rounded-lg bg-wine-deep px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50">
          {pendente ? "Salvando…" : "+ observação"}
        </button>
      </div>
      {erro && <p className="text-[10.5px] text-danger">{erro}</p>}
      {aviso && <p className="text-[10.5px] text-success">{aviso}</p>}
    </div>
  );
}
