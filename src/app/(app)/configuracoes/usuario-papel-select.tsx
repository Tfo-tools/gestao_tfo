"use client";

import { useState, useTransition } from "react";
import { alterarPapelUsuario, definirEscopoInvestidor, type PapelUsuario } from "./actions";

const LABEL: Record<string, string> = {
  socia: "Sócia",
  equipe: "Equipe",
  contabilidade: "Contabilidade externa",
  investidor_fomento: "Investidor de fomento",
  investidor: "Investidor (equity)",
};

export type EscopoOpcao = { id: string; nome: string };

/** Muda o acesso de uma usuária já convidada — sem precisar reconvidar. Investidor de fomento ou
 * de equity exige escolher UM programa ou UM cenário logo em seguida (a Prestação de Contas não
 * mostra nada sem escopo). */
export function UsuarioPapelSelect({
  id,
  papelAtual,
  escopoAtual,
  ehVoce,
  programas,
  cenarios,
}: {
  id: string;
  papelAtual: string;
  escopoAtual: string | null;
  ehVoce: boolean;
  programas: EscopoOpcao[];
  cenarios: EscopoOpcao[];
}) {
  const [papel, setPapel] = useState(papelAtual);
  const [escopo, setEscopo] = useState(escopoAtual ?? "");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  if (ehVoce) {
    // Ninguém rebaixa a própria conta sem querer e fica trancada pra fora.
    return <span className="text-[11.5px] text-text-muted">{LABEL[papel] ?? papel}</span>;
  }

  const opcoesEscopo = papel === "investidor_fomento" ? programas : papel === "investidor" ? cenarios : [];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <select
          value={papel}
          disabled={pending}
          onChange={(e) => {
            const novo = e.target.value as PapelUsuario;
            const anterior = papel;
            setPapel(novo);
            setEscopo("");
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
          <option value="equipe">Equipe (sem documentos, vendas e configurações)</option>
          <option value="contabilidade">Contabilidade externa</option>
          <option value="investidor_fomento">Investidor de fomento</option>
          <option value="investidor">Investidor (equity)</option>
        </select>
        {erro && <span className="text-[10.5px] text-danger">{erro}</span>}
      </div>
      {opcoesEscopo.length > 0 && (
        <select
          value={escopo}
          disabled={pending}
          onChange={(e) => {
            const novo = e.target.value;
            const anterior = escopo;
            setEscopo(novo);
            setErro(null);
            startTransition(async () => {
              const r = await definirEscopoInvestidor(id, novo);
              if (r.error) {
                setErro(r.error);
                setEscopo(anterior);
              }
            });
          }}
          className={`input py-1 text-[11.5px] ${!escopo ? "border-danger text-danger" : ""}`}
        >
          <option value="">
            {papel === "investidor_fomento" ? "— escolha o programa —" : "— escolha o cenário —"}
          </option>
          {opcoesEscopo.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
