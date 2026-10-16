"use client";

import { useState } from "react";
import { TarefaModal } from "./tarefa-modal";
import type { DadosFormulario } from "./tarefa-card";
import type { TarefaNo } from "./tipos";

/** Chegou por link direto (?tarefa=id — WhatsApp, push, @menção): a tarefa já abre no pop-up. */
export function AbrirTarefaFoco({ no, dados, dependeDe }: { no: TarefaNo; dados: DadosFormulario; dependeDe: Map<string, string[]> }) {
  const [aberto, setAberto] = useState(true);
  if (!aberto) return null;
  return <TarefaModal no={no} dados={dados} dependeDe={dependeDe} aoFechar={() => setAberto(false)} />;
}
