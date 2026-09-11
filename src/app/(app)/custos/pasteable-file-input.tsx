"use client";

import { useRef, useState } from "react";

/** Além de escolher o arquivo, permite colar (Ctrl/Cmd+V) uma imagem copiada de outro lugar —
 * ex: print do comprovante do banco copiado pelo botão "Compartilhar". Clica na caixa e cola. */
export function PasteableFileInput({
  name,
  label,
  hint,
}: {
  name: string;
  label: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file && inputRef.current) {
          const ext = item.type.split("/")[1] || "png";
          const named = new File([file], `colado-${Date.now()}.${ext}`, { type: file.type });
          const dt = new DataTransfer();
          dt.items.add(named);
          inputRef.current.files = dt.files;
          setFileName(named.name);
        }
        e.preventDefault();
        break;
      }
    }
  }

  return (
    <div>
      <label className="mb-1 block text-[10.5px] text-text-faint">{label}</label>
      <div
        tabIndex={0}
        onPaste={handlePaste}
        className="rounded-lg border border-dashed border-border bg-bg px-3 py-2.5 text-[11.5px] focus:border-primary-fill focus:outline-none"
      >
        <input
          ref={inputRef}
          name={name}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="w-full text-[11.5px]"
        />
        <p className="mt-1 text-[10px] text-text-faint">
          {fileName ? `Selecionado: ${fileName}` : "Clique aqui dentro e cole (Ctrl/Cmd+V) um print ou comprovante copiado."}
        </p>
      </div>
      {hint && <p className="mt-1 text-[10.5px] text-text-faint">{hint}</p>}
    </div>
  );
}
