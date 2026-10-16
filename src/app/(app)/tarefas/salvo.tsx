"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "✓ salvo" que aparece por 2,5 s depois de uma gravação automática (caixa de feito, status,
 * prazo, observação). Sem isso a sócia não sabia se a edição tinha entrado e ficava indo e
 * voltando pra conferir.
 */
export function useSalvo(): [string | null, (texto?: string) => void] {
  const [texto, setTexto] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const marcar = (t = "✓ salvo") => {
    setTexto(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTexto(null), 2500);
  };
  return [texto, marcar];
}

export function Salvo({ texto, erro }: { texto: string | null; erro?: string | null }) {
  if (erro) return <span className="shrink-0 text-[10.5px] text-danger">{erro}</span>;
  if (!texto) return null;
  return <span className="shrink-0 text-[10.5px] font-medium text-success">{texto}</span>;
}
