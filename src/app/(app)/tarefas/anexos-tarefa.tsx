"use client";

import { useRef, useState, useTransition } from "react";
import { anexarNaTarefa, concluirAnexo, excluirAnexoTarefa, iniciarAnexo, urlAnexoTarefa } from "./actions";
import { LIMITE_ANEXO_MB } from "./limites";
import type { AnexoTarefa } from "./tipos";
import { iconeDoTipo } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/client";

function tamanho(bytes: number | null) {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** Até onde a Vercel aceita corpo numa server action — acima disso só o envio direto funciona. */
const LIMITE_VIA_SERVIDOR_BYTES = 4 * 1024 * 1024;

/**
 * Manda o arquivo direto do navegador pro Drive (ou pro Storage, na reserva), sem passar pela
 * Vercel: o servidor abre a sessão, o navegador faz o PUT dos bytes e o servidor registra depois.
 * Se o envio direto falhar e o arquivo for pequeno, cai no caminho antigo pelo servidor.
 * Devolve a mensagem de erro, ou null quando deu certo.
 */
async function enviarArquivo(tarefaId: string, arquivo: File): Promise<string | null> {
  const meta = { nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size };
  const inicio = await iniciarAnexo(tarefaId, meta);
  if (inicio.error !== null) return inicio.error;

  try {
    if (inicio.destino === "drive") {
      const resp = await fetch(inicio.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": arquivo.type || "application/octet-stream" },
        body: arquivo,
      });
      if (!resp.ok) throw new Error(`Drive respondeu ${resp.status}`);
      const { id } = (await resp.json()) as { id: string };
      return (await concluirAnexo(tarefaId, { ...meta, destino: "drive", driveFileId: id })).error;
    }
    const { error } = await createClient().storage.from("comprovantes").uploadToSignedUrl(inicio.caminho, inicio.token, arquivo, { contentType: arquivo.type || undefined });
    if (error) throw error;
    return (await concluirAnexo(tarefaId, { ...meta, destino: "storage", caminho: inicio.caminho })).error;
  } catch (e) {
    console.error("Anexo: envio direto falhou, tentando pelo servidor:", e);
    if (arquivo.size > LIMITE_VIA_SERVIDOR_BYTES) return "O envio direto falhou. Guarde o arquivo no Drive e cole o link na descrição.";
    return (await anexarNaTarefa(tarefaId, arquivo)).error;
  }
}

/** Arquivos que a tarefa produziu — documento, planilha, print. Desde 05/10/2026 vão pro Drive
 * compartilhado (pasta Arquivos_tarefas) e abrem editáveis no Google Docs/Sheets; os antigos
 * seguem na Storage do Supabase (só baixar). Desde 15/10/2026 o arquivo vai direto do navegador,
 * então vale o LIMITE_ANEXO_MB de verdade (antes a Vercel barrava em ~4,5 MB). Vídeo: guarde no
 * Drive à mão. */
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
        multiple
        className="hidden"
        disabled={pending}
        onChange={(e) => {
          const arquivos = Array.from(e.target.files ?? []);
          if (inputRef.current) inputRef.current.value = "";
          if (arquivos.length === 0) return;
          setErro(null);
          startTransition(async () => {
            const falhas: string[] = [];
            for (const arquivo of arquivos) {
              try {
                const erro = await enviarArquivo(tarefaId, arquivo);
                if (erro) falhas.push(`${arquivo.name}: ${erro}`);
              } catch {
                falhas.push(`${arquivo.name}: falhou o envio.`);
              }
            }
            if (falhas.length > 0) setErro(falhas.length === arquivos.length ? falhas[0] : `${falhas.length} de ${arquivos.length} não anexaram: ${falhas[0]}`);
          });
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="text-[10.5px] text-text-muted hover:text-primary-deep disabled:opacity-50"
        title={`Um ou vários documentos, planilhas ou prints (até ${LIMITE_ANEXO_MB} MB cada) — vão pro Drive compartilhado e abrem editáveis. Vídeo: guarde no Drive à mão e cole o link na descrição.`}
      >
        {pending ? "enviando…" : "+ arquivos"}
      </button>
      {erro && <span className="text-[10px] text-danger">{erro}</span>}
    </div>
  );
}
