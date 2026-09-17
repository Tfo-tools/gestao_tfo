"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type Ctx = { padrao: boolean; geracao: number; definir: (aberto: boolean) => void };
const CardsContexto = createContext<Ctx>({ padrao: true, geracao: 0, definir: () => {} });

/**
 * "Recolher tudo / abrir tudo": o provider guarda o padrão e uma geração; cada card só respeita
 * o próprio clique enquanto a geração não mudar — clicar no botão global "reseta" todos.
 */
export function CardsProvider({ abertoInicial, children }: { abertoInicial: boolean; children: ReactNode }) {
  const [estado, setEstado] = useState({ padrao: abertoInicial, geracao: 0 });
  const definir = (aberto: boolean) => setEstado((e) => ({ padrao: aberto, geracao: e.geracao + 1 }));
  return <CardsContexto.Provider value={{ ...estado, definir }}>{children}</CardsContexto.Provider>;
}

/** Estado aberto/recolhido de um card, respeitando o botão global. */
export function useCardAberto(): [boolean, () => void] {
  const { padrao, geracao } = useContext(CardsContexto);
  const [local, setLocal] = useState<{ geracao: number; aberto: boolean } | null>(null);
  const aberto = local && local.geracao === geracao ? local.aberto : padrao;
  const alternar = () => setLocal({ geracao, aberto: !aberto });
  return [aberto, alternar];
}

export function BotaoRecolherTudo() {
  const { padrao, definir } = useContext(CardsContexto);
  return (
    <button type="button" onClick={() => definir(!padrao)} className="text-[11.5px] text-text-muted underline">
      {padrao ? "recolher tudo" : "abrir tudo"}
    </button>
  );
}
