"use client";

import { useRef, useState, useTransition } from "react";
import { anexarNaTarefa, excluirAnexoTarefa, urlAnexoTarefa } from "./actions";
import { LIMITE_ANEXO_MB } from "./limites";
import type { AnexoTarefa } from "./tipos";

function tamanho(bytes: number | null) {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** Arquivos que a tarefa produziu — documento, planilha, print. Vídeo fica no Drive: o limite por
 * arquivo (LIMITE_ANEXO_MB) existe pra não estourar o 1 GB do plano grátis. */
export function AnexosTarefa({ tarefaId, anexos }: { tarefaId: string; anexos: AnexoTarefa[] }) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {anexos.map((a) => (
        <span key={a.id} className="inline-flex items-center gap-1 rounded border border-border-soft bg-bg px-1.5 py-0.5">
          <button
            type="button"
            disabled={abrindo === a.id}
            onClick={async () => {
              setAbrindo(a.id);
              const url = await urlAnexoTarefa(a.caminho_arquivo);
              setAbrindo(null);
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            }}
            className="text-[10.5px] font-medium text-primary-deep hover:text-wine disabled:opacity-50"
            title={`Abrir ${a.nome_arquivo}${a.tamanho_bytes ? ` · ${tamanho(a.tamanho_bytes)}` : ""}`}
          >
            {abrindo === a.id ? "…" : `📎 ${a.nome_arquivo.length > 28 ? a.nome_arquivo.slice(0, 26) + "…" : a.nome_arquivo}`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Excluir "${a.nome_arquivo}"?`)) return;
              startTransition(async () => {
                const r = await excluirAnexoTarefa(a.id, a.caminho_arquivo);
                if (r.error) setErro(r.error);
              });
            }}
            className="text-[10px] text-text-faint hover:text-danger disabled:opacity-50"
            title="Excluir arquivo"
          >
            ×
          </button>
        </span>
      ))}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        disabled={pending}
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (!arquivo) return;
          setErro(null);
          startTransition(async () => {
            const r = await anexarNaTarefa(tarefaId, arquivo);
            if (r.error) setErro(r.error);
            if (inputRef.current) inputRef.current.value = "";
          });
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="text-[10.5px] text-text-muted hover:text-primary-deep disabled:opacity-50"
        title={`Documento, planilha ou print (até ${LIMITE_ANEXO_MB} MB). Vídeo: guarde no Drive e cole o link na descrição.`}
      >
        {pending ? "enviando…" : "+ arquivo"}
      </button>
      {erro && <span className="text-[10px] text-danger">{erro}</span>}
    </div>
  );
}
