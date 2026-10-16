"use client";

import { useState } from "react";
import { NovoProjetoRapido } from "./novo-projeto-rapido";
import { NovaTarefaCard, type DadosFormulario } from "./tarefa-card";
import type { FaseProdutoOpcao } from "./tipos";

/**
 * O "+" do topo pergunta o que criar: uma tarefa (formulário de sempre) ou um projeto com a grade
 * rápida de tarefas. Fechado é só o botão redondo; aberto ocupa a linha inteira da barra.
 */
export function NovoBotao({ dados, projetoInicial, fasesProduto }: { dados: DadosFormulario; projetoInicial: string | null; fasesProduto: FaseProdutoOpcao[] }) {
  const [modo, setModo] = useState<"fechado" | "escolha" | "tarefa" | "projeto">("fechado");
  const fechar = () => setModo("fechado");

  if (modo === "fechado") {
    return (
      <button
        type="button"
        onClick={() => setModo("escolha")}
        title="Criar tarefa ou projeto"
        aria-label="Criar tarefa ou projeto"
        className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wine-deep text-[18px] leading-none text-white hover:opacity-90"
      >
        +
      </button>
    );
  }

  if (modo === "escolha") {
    return (
      <span className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={() => setModo("tarefa")} className="rounded-md bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white hover:opacity-90">
          + Tarefa
        </button>
        <button type="button" onClick={() => setModo("projeto")} className="rounded-md border border-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-wine-deep hover:bg-wine-soft">
          + Projeto
        </button>
        <button type="button" onClick={fechar} title="Fechar" aria-label="Fechar" className="px-1 text-[13px] text-text-faint hover:text-danger">
          ×
        </button>
      </span>
    );
  }

  if (modo === "projeto") return <NovoProjetoRapido pessoas={dados.pessoas} fasesProduto={fasesProduto} aoFechar={fechar} />;
  return <NovaTarefaCard dados={dados} projetoInicial={projetoInicial} abertoInicial aoConcluir={fechar} compacto />;
}
