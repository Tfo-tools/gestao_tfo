"use client";

import { useRef, useState, useTransition } from "react";
import { anexarNaTarefa, excluirAnexoTarefa, urlAnexoTarefa } from "./actions";
import { LIMITE_ANEXO_MB } from "./limites";
import type { AnexoTarefa } from "./tipos";
import { iconeDoTipo } from "@/lib/google-drive";

function tamanho(bytes: number | null) {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** Arquivos que a tarefa produziu — documento, planilha, print. Desde 05/10/2026 vão pro Drive
 * compartilhado (pasta TAREFAS/<tarefa>) e abrem editáveis no Google Docs/Sheets; os antigos
 * seguem na Storage do Supabase (só baixar). Vídeo: guarde no Drive à mão — o limite por arquivo
 * (LIMITE_ANEXO_MB) protege a reserva do Supabase. */
export function AnexosTarefa({ tarefaId, anexos }: { tarefaId: string; anexos: AnexoTarefa[] }) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {anexos.map((a) => (
        <span key={a.id} className="inline-flex items-center gap-1 rounded border border-border-soft bg-bg px-1.5 py-0.5">
          {a.url ? (
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10.5px] font-medium text-primary-deep hover:text-wine"
              title={`${a.nome_arquivo} · abre no Drive${a.drive_file_id && a.tipo_mime?.startsWith("application/vnd.google-apps") ? ", editável pelas duas" : ""}`}
            >
              {iconeDoTipo(a.tipo_mime)} {a.nome_arquivo.length > 28 ? a.nome_arquivo.slice(0, 26) + "…" : a.nome_arquivo}
            </a>
          ) : (
            <button
              type="button"
              disabled={abrindo === a.id}
              onClick={async () => {
                if (!a.caminho_arquivo) return;
                setAbrindo(a.id);
                const url = await urlAnexoTarefa(a.caminho_arquivo);
                setAbrindo(null);
                if (url) window.open(url, "_blank", "noopener,noreferrer");
              }}
              className="text-[10.5px] font-medium text-primary-deep hover:text-wine disabled:opacity-50"
              title={`Baixar ${a.nome_arquivo}${a.tamanho_bytes ? ` · ${tamanho(a.tamanho_bytes)}` : ""} (anexo antigo, fora do Drive)`}
            >
              {abrindo === a.id ? "…" : `📎 ${a.nome_arquivo.length > 28 ? a.nome_arquivo.slice(0, 26) + "…" : a.nome_arquivo}`}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Excluir "${a.nome_arquivo}"?`)) return;
              startTransition(async () => {
                const r = await excluirAnexoTarefa(a.id, a.caminho_arquivo, a.drive_file_id);
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
        title={`Documento, planilha ou print (até ${LIMITE_ANEXO_MB} MB) — vai pro Drive compartilhado e abre editável. Vídeo: guarde no Drive à mão e cole o link na descrição.`}
      >
        {pending ? "enviando…" : "+ arquivo"}
      </button>
      {erro && <span className="text-[10px] text-danger">{erro}</span>}
    </div>
  );
}
