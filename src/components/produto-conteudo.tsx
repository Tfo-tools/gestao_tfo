"use client";

import { useState } from "react";
import { FasesTab } from "@/components/produto/fases-tab";
import { TestesTab } from "@/components/produto/testes-tab";
import { PerfisTab } from "@/components/produto/perfis-tab";
import { CrescimentoTab } from "@/components/produto/crescimento-tab";
import type { ModuloRow, BlocoRow } from "@/components/produto/linhas";
import type { PerfilSimulado } from "@/lib/perfis";

type Aba = "fases" | "testes" | "perfis" | "crescimento";
const ABAS: { key: Aba; label: string; desc: string }[] = [
  { key: "fases", label: "Fases", desc: "Datas de lançamento por funcionalidade" },
  { key: "testes", label: "Testes", desc: "Beta testers e modelo na validação" },
  { key: "perfis", label: "Perfis", desc: "Participação e cliente médio" },
  { key: "crescimento", label: "Crescimento", desc: "Crescimento e churn por fase" },
];

/**
 * Tela de Produto (catálogo: mind, skills, price). Quatro abas sobre as mesmas funcionalidades:
 * fases, testes, perfis (que alimentam o cálculo) e crescimento/churn. Compartilhada por Plano e
 * Realizado por enquanto; o comercial puxa do plano até entrarem vendas importadas.
 */
export function ProdutoConteudo({ modulos, blocos, perfis }: { modulos: ModuloRow[]; blocos: BlocoRow[]; perfis: PerfilSimulado[] }) {
  const [aba, setAba] = useState<Aba>("fases");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5 border-b border-border">
        {ABAS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setAba(a.key)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] font-medium transition-colors ${aba === a.key ? "border-wine text-wine-deep" : "border-transparent text-text-muted hover:text-text"}`}
          >
            {a.label}
            <span className="ml-1.5 hidden text-[11px] font-normal text-text-faint md:inline">· {a.desc}</span>
          </button>
        ))}
      </div>
      {aba === "fases" && <FasesTab modulos={modulos} blocos={blocos} />}
      {aba === "testes" && <TestesTab modulos={modulos} blocos={blocos} />}
      {aba === "perfis" && <PerfisTab perfisIniciais={perfis} />}
      {aba === "crescimento" && <CrescimentoTab modulos={modulos} blocos={blocos} />}
    </div>
  );
}
