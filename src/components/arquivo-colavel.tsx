"use client";

/**
 * Anexar arquivo com 3 caminhos (cada aparelho oferece um) — mesma ideia do comprovante do Custos,
 * mas entrega o arquivo por callback (pra processar na hora, ex.: ler e-ticket com IA):
 * 1. botão "Colar arquivo" (Clipboard API — no iPhone aparece o balão "Colar");
 * 2. toque no campo e "Colar" no menu (celular sem a API);
 * 3. escolher o arquivo (picker nativo).
 */

import { useState } from "react";

export function ArquivoColavel({
  onArquivo,
  rotulo,
  ocupado,
  aceita = "image/*,application/pdf",
}: {
  onArquivo: (file: File) => void;
  /** Texto do botão principal (ex.: "Anexar e-ticket"). */
  rotulo: string;
  /** Quando preenchido, mostra esse texto no botão e desabilita (processando). */
  ocupado?: string | null;
  aceita?: string;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [colando, setColando] = useState(false);
  const [mostrarColar, setMostrarColar] = useState(false);

  function entregar(file: File, tipo: string) {
    const nomeOk = file.name && file.name !== "colado";
    const ext = (tipo.split("/")[1] || "pdf").replace("jpeg", "jpg");
    const arquivo = nomeOk ? file : new File([file], `colado-${Date.now()}.${ext}`, { type: tipo || "application/pdf" });
    setAviso(null);
    onArquivo(arquivo);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLElement>) {
    const dados = e.clipboardData;
    if (!dados) return;
    const doFiles = Array.from(dados.files ?? []).find((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (doFiles) {
      entregar(doFiles, doFiles.type);
      e.preventDefault();
      return;
    }
    for (const item of Array.from(dados.items ?? [])) {
      if (item.type.startsWith("image/") || item.type === "application/pdf") {
        const file = item.getAsFile();
        if (file) entregar(file, item.type);
        e.preventDefault();
        return;
      }
    }
    setAviso("A área de transferência não tem um arquivo — copie o PDF/imagem de novo e cole aqui.");
    e.preventDefault();
  }

  async function colarPeloBotao() {
    setAviso(null);
    if (!("clipboard" in navigator) || typeof navigator.clipboard.read !== "function") {
      setAviso("Neste navegador o botão não funciona — toque no campo abaixo e use “Colar”, ou escolha o arquivo.");
      return;
    }
    setColando(true);
    try {
      const itens = await navigator.clipboard.read();
      for (const item of itens) {
        const tipo = item.types.find((t) => t.startsWith("image/") || t === "application/pdf");
        if (tipo) {
          const blob = await item.getType(tipo);
          entregar(new File([blob], "colado", { type: tipo }), tipo);
          return;
        }
      }
      setAviso("A área de transferência não tem um arquivo — copie o PDF/imagem de novo e cole aqui.");
    } catch {
      setAviso("O navegador não liberou a área de transferência — toque no campo abaixo e use “Colar”, ou escolha o arquivo.");
    } finally {
      setColando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-wine-deep px-4 py-3 text-[13px] font-medium text-white ${ocupado ? "opacity-70" : ""}`}>
        {ocupado ?? rotulo}
        <input
          type="file"
          accept={aceita}
          className="hidden"
          disabled={!!ocupado}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) entregar(f, f.type || "application/pdf");
          }}
        />
      </label>

      {!mostrarColar ? (
        <button type="button" disabled={!!ocupado} onClick={() => setMostrarColar(true)} className="self-start text-[11.5px] text-text-muted underline underline-offset-2 disabled:opacity-50">
          ou colar um arquivo copiado
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-bg p-2.5">
          <button type="button" disabled={!!ocupado || colando} onClick={colarPeloBotao} className="self-start rounded-lg border border-primary-fill px-3.5 py-2 text-[12.5px] font-medium text-primary-deep disabled:opacity-50">
            {colando ? "…" : "📋 Colar da área de transferência"}
          </button>
          <input
            type="text"
            inputMode="none"
            value=""
            onChange={() => {}}
            onPaste={handlePaste}
            disabled={!!ocupado}
            placeholder="ou toque aqui e use “Colar”"
            aria-label="Campo para colar o arquivo"
            className="block w-full rounded border border-border-soft bg-surface px-2.5 py-2 text-[12px] text-text-muted placeholder:text-text-faint"
          />
          <p className="text-[10.5px] leading-snug text-text-faint">
            No computador funciona bem. No iPhone, o Safari não deixa colar PDF — prefira, no e-mail, <b>Compartilhar → Salvar em Arquivos</b> e depois o botão acima.
          </p>
          {aviso && <p className="break-words text-[11px] leading-snug text-danger">{aviso}</p>}
        </div>
      )}
    </div>
  );
}
