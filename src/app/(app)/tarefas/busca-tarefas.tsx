"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Lupa da barra de Tarefas: fechada é só o ícone; aberta vira o campo de busca. Enter procura
 * (título e descrição, sem distinguir acento/maiúscula), Esc fecha. A busca vai pra URL (?q=),
 * então dá pra compartilhar e combina com os outros filtros. */
export function BuscaTarefas({ valor, montarLink }: { valor: string; montarLink: string }) {
  const router = useRouter();
  const [aberta, setAberta] = useState(valor.length > 0);
  const [texto, setTexto] = useState(valor);
  const campo = useRef<HTMLInputElement>(null);

  const irPara = (q: string) => {
    const url = new URL(montarLink, "http://x");
    if (q.trim()) url.searchParams.set("q", q.trim());
    else url.searchParams.delete("q");
    router.push(`${url.pathname}${url.search}`);
  };

  if (!aberta) {
    return (
      <button
        type="button"
        onClick={() => {
          setAberta(true);
          setTimeout(() => campo.current?.focus(), 0);
        }}
        title="Procurar tarefa"
        aria-label="Procurar tarefa"
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-text-muted hover:border-primary-fill hover:text-primary-deep"
      >
        <Lupa />
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        irPara(texto);
      }}
      className="flex items-center gap-1"
    >
      <span className="flex h-7 items-center gap-1 rounded-lg border border-primary-fill bg-surface pl-2 pr-1">
        <Lupa />
        <input
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setTexto("");
              setAberta(false);
              if (valor) irPara("");
            }
          }}
          placeholder="procurar tarefa…"
          autoFocus
          className="w-[150px] bg-transparent text-[12px] outline-none placeholder:text-text-faint sm:w-[200px]"
        />
        {(texto || valor) && (
          <button
            type="button"
            title="Limpar busca"
            aria-label="Limpar busca"
            onClick={() => {
              setTexto("");
              setAberta(false);
              if (valor) irPara("");
            }}
            className="px-1 text-[13px] text-text-faint hover:text-danger"
          >
            ×
          </button>
        )}
      </span>
    </form>
  );
}

function Lupa() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
