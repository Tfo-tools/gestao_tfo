"use client";

import { useState, useTransition } from "react";
import { alterarPapelUsuario } from "./actions";

const LABEL: Record<string, string> = { socia: "Sócia", contabilidade: "Contabilidade externa" };

/** Muda o acesso de uma usuária já convidada — sem precisar reconvidar. Sócia (completo) ou
 * Contabilidade externa (só Realizado, reforçado no proxy). */
export function UsuarioPapelSelect({ id, papelAtual, ehVoce }: { id: string; papelAtual: string; ehVoce: boolean }) {
  const [papel, setPapel] = useState(papelAtual);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  if (ehVoce) {
    // Ninguém rebaixa a própria conta sem querer e fica trancada pra fora.
    return <span className="text-[11.5px] text-text-muted">{LABEL[papel] ?? papel}</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={papel}
        disabled={pending}
        onChange={(e) => {
          const novo = e.target.value as "socia" | "contabilidade";
          const anterior = papel;
          setPapel(novo);
          setErro(null);
          startTransition(async () => {
            const r = await alterarPapelUsuario(id, novo);
            if (r.error) {
              setErro(r.error);
              setPapel(anterior);
            }
          });
        }}
        className="input py-1 text-[11.5px]"
      >
        <option value="socia">Sócia</option>
        <option value="contabilidade">Contabilidade externa</option>
      </select>
      {erro && <span className="text-[10.5px] text-danger">{erro}</span>}
    </div>
  );
}
