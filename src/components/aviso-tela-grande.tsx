"use client";

import { useEffect, useState } from "react";

/** Telas de Plano (Vendas, Custos, Indicadores) têm bastante coluna/card lado a lado — funcionam
 * melhor no computador. No celular ainda dá pra ver e editar, só avisa que vai rolar mais. */
export function AvisoTelaGrande() {
  const [estreita, setEstreita] = useState(false);

  useEffect(() => {
    const checar = () => setEstreita(window.innerWidth < 900);
    checar();
    window.addEventListener("resize", checar);
    return () => window.removeEventListener("resize", checar);
  }, []);

  if (!estreita) return null;

  return (
    <div className="mb-4 rounded-lg border border-dashed border-primary-fill bg-primary-soft/30 px-4 py-3 text-[12px] text-primary-deep">
      💻 Essa tela tem bastante coisa lado a lado — funciona melhor no computador. Continua acessível no celular, só vai precisar rolar mais.
    </div>
  );
}
