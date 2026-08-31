"use client";

import { useRouter } from "next/navigation";

export function CenarioSelector({
  cenarios,
  cenarioAtual,
}: {
  cenarios: { id: string; nome: string; is_base: boolean }[];
  cenarioAtual: string;
}) {
  const router = useRouter();

  return (
    <select
      value={cenarioAtual}
      onChange={(e) => router.push(`?cenario=${e.target.value}`)}
      className="rounded-lg border border-[#e6d3d9] bg-wine-soft px-3 py-2 text-[12.5px] font-medium text-wine"
    >
      {cenarios.map((c) => (
        <option key={c.id} value={c.id}>
          Cenário: {c.nome}
          {c.is_base ? " (base)" : ""}
        </option>
      ))}
    </select>
  );
}
