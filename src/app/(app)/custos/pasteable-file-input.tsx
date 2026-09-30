"use client";

import { useRef, useState } from "react";

/**
 * Além de escolher o arquivo, aceita o comprovante colado da área de transferência — print copiado
 * pelo botão "Compartilhar/Copiar" do app do banco. Três caminhos, porque cada aparelho oferece um:
 * 1. botão "Colar da área de transferência" (Clipboard API — no iPhone aparece o balão "Colar");
 * 2. Ctrl/Cmd+V com a caixa em foco (computador);
 * 3. toque no campo de texto e "Colar" no menu (celular sem suporte à API — o campo editável é o
 *    único lugar em que o menu de colar aparece).
 */
export function PasteableFileInput({ name, label, hint }: { name: string; label: string; hint?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [colando, setColando] = useState(false);

  function usarArquivo(file: File, tipo: string) {
    if (!inputRef.current) return;
    const ext = (tipo.split("/")[1] || "png").replace("jpeg", "jpg");
    const named = new File([file], `colado-${Date.now()}.${ext}`, { type: tipo });
    const dt = new DataTransfer();
    dt.items.add(named);
    inputRef.current.files = dt.files;
    setFileName(named.name);
    setAviso(null);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLElement>) {
    const dados = e.clipboardData;
    if (!dados) return;
    // Alguns navegadores entregam a imagem em `files`, outros em `items`.
    const doFiles = Array.from(dados.files ?? []).find((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (doFiles) {
      usarArquivo(doFiles, doFiles.type);
      e.preventDefault();
      return;
    }
    for (const item of Array.from(dados.items ?? [])) {
      if (item.type.startsWith("image/") || item.type === "application/pdf") {
        const file = item.getAsFile();
        if (file) usarArquivo(file, item.type);
        e.preventDefault();
        return;
      }
    }
    setAviso("A área de transferência não tem imagem — copie o comprovante de novo (como imagem, não como texto).");
    e.preventDefault();
  }

  async function colarPeloBotao() {
    setAviso(null);
    if (!("clipboard" in navigator) || typeof navigator.clipboard.read !== "function") {
      setAviso("Neste navegador o botão não funciona — toque no campo abaixo e use “Colar”.");
      return;
    }
    setColando(true);
    try {
      const itens = await navigator.clipboard.read();
      for (const item of itens) {
        const tipo = item.types.find((t) => t.startsWith("image/") || t === "application/pdf");
        if (tipo) {
          const blob = await item.getType(tipo);
          usarArquivo(new File([blob], "colado", { type: tipo }), tipo);
          return;
        }
      }
      setAviso("A área de transferência não tem imagem — copie o comprovante de novo (como imagem, não como texto).");
    } catch {
      setAviso("O navegador não liberou a área de transferência — toque no campo abaixo e use “Colar”, ou escolha o arquivo.");
    } finally {
      setColando(false);
    }
  }

  return (
    <div>
      <label className="mb-1 block text-[10.5px] text-text-faint">{label}</label>
      <div tabIndex={0} onPaste={handlePaste} className="rounded-lg border border-dashed border-border bg-bg px-3 py-2.5 text-[11.5px] focus:border-primary-fill focus:outline-none">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            name={name}
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? null);
              setAviso(null);
            }}
            className="min-w-0 flex-1 text-[11.5px]"
          />
          <button
            type="button"
            disabled={colando}
            onClick={colarPeloBotao}
            className="shrink-0 rounded-lg border border-primary-fill px-2.5 py-1 text-[11px] font-medium text-primary-deep disabled:opacity-50"
          >
            {colando ? "…" : "Colar da área de transferência"}
          </button>
        </div>
        <input
          type="text"
          inputMode="none"
          readOnly={false}
          value=""
          onChange={() => {}}
          onPaste={handlePaste}
          placeholder="ou toque aqui e escolha “Colar” no menu do celular"
          aria-label="Campo para colar o comprovante"
          className="mt-1.5 w-full rounded border border-border-soft bg-surface px-2 py-1 text-[11px] text-text-muted placeholder:text-text-faint"
        />
        <p className="mt-1 text-[10px] text-text-faint">
          {fileName ? `Selecionado: ${fileName}` : "No computador, clique aqui dentro e cole (Ctrl/Cmd+V) o print do comprovante."}
        </p>
        {aviso && <p className="mt-1 text-[10.5px] text-danger">{aviso}</p>}
      </div>
      {hint && <p className="mt-1 text-[10.5px] text-text-faint">{hint}</p>}
    </div>
  );
}
