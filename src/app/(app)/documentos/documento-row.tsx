"use client";

import { useRef, useState, useTransition } from "react";
import { substituirArquivo, excluirDocumento, getSignedUrlDocumento } from "./actions";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export type DocumentoData = {
  id: string;
  nome: string;
  caminho_arquivo: string | null;
  nome_arquivo: string | null;
  atualizado_em: string | null;
};

/** Uma linha do cofre de documentos: abrir (link assinado), substituir (input de arquivo escondido,
 * dispara sozinho ao escolher) e excluir — sem precisar de tela de edição separada. */
export function DocumentoRow({ documento }: { documento: DocumentoData }) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const temArquivo = !!documento.caminho_arquivo;

  return (
    <tr className="border-t border-border-soft">
      <td className="px-2 py-2.5 font-medium">{documento.nome}</td>
      <td className="px-2 py-2.5">
        {temArquivo ? (
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              const url = await getSignedUrlDocumento(documento.caminho_arquivo!);
              setLoading(false);
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            }}
            className="text-[12.5px] font-medium text-primary-deep hover:text-wine disabled:opacity-50"
          >
            {loading ? "…" : `📄 ${documento.nome_arquivo}`}
          </button>
        ) : (
          <span className="text-text-faint">— nenhum arquivo —</span>
        )}
      </td>
      <td className="px-2 py-2.5 text-text-muted">{documento.atualizado_em ? formatDate(documento.atualizado_em) : "—"}</td>
      <td className="px-2 py-2.5">
        <div className="flex items-center justify-end gap-3">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (!arquivo) return;
              startTransition(async () => {
                setErro(null);
                const r = await substituirArquivo(documento.id, arquivo);
                if (r.error) setErro(r.error);
                if (inputRef.current) inputRef.current.value = "";
              });
            }}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            className="text-[11.5px] font-medium text-primary-deep hover:text-wine disabled:opacity-50"
          >
            {pending ? "Enviando…" : temArquivo ? "Substituir" : "Enviar arquivo"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Excluir "${documento.nome}"? Remove o registro e o arquivo.`)) return;
              startTransition(async () => {
                setErro(null);
                const r = await excluirDocumento(documento.id, documento.caminho_arquivo);
                if (r.error) setErro(r.error);
              });
            }}
            className="text-[11.5px] text-danger hover:text-danger/80 disabled:opacity-50"
          >
            Excluir
          </button>
        </div>
        {erro && <p className="mt-1 text-right text-[10.5px] text-danger">{erro}</p>}
      </td>
    </tr>
  );
}
