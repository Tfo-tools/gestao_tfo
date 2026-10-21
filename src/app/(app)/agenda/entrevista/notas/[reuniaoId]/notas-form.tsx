"use client";

import { useState, useTransition } from "react";
import { ROTEIRO_PERFIL } from "@/lib/roteiro-perfil";
import { salvarNotasPerfil } from "../../actions";

export function NotasPerfilForm({ reuniaoId, notasIniciais }: { reuniaoId: string; notasIniciais: Record<string, string> }) {
  const [notas, setNotas] = useState<Record<string, string>>(notasIniciais ?? {});
  const [estado, setEstado] = useState<"idle" | "salvando" | "salvo" | "erro">("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [, start] = useTransition();

  const salvar = (mapa: Record<string, string>) => {
    setEstado("salvando"); setErro(null);
    start(async () => {
      const r = await salvarNotasPerfil(reuniaoId, mapa);
      if (r.error) { setEstado("erro"); setErro(r.error); } else setEstado("salvo");
    });
  };
  const editar = (id: string, valor: string) => { setEstado("idle"); setNotas((n) => ({ ...n, [id]: valor })); };

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-bg/90 py-1 backdrop-blur">
        <button type="button" onClick={() => salvar(notas)} className="rounded-lg bg-wine-deep px-3.5 py-1.5 text-[12px] font-medium text-white">Salvar notas</button>
        <span className="text-[11.5px] text-text-muted">
          {estado === "salvando" ? "Salvando…" : estado === "salvo" ? "Salvo ✓" : estado === "erro" ? <span className="text-danger">{erro}</span> : "Salva sozinho ao sair de cada campo"}
        </span>
      </div>

      {ROTEIRO_PERFIL.map((secao) => (
        <div key={secao.titulo} className="rounded-xl border border-border bg-surface p-4">
          <h2 className="font-heading text-[13px] font-semibold">{secao.titulo}</h2>
          <div className="mt-2 flex flex-col gap-3">
            {secao.perguntas.map((q) => (
              <div key={q.id}>
                <p className="text-[12.5px] font-medium"><span className="text-text-faint">{q.id}</span> {q.pergunta}</p>
                {q.apoio && <p className="mt-0.5 text-[11px] text-text-faint">{q.apoio}</p>}
                <textarea
                  value={notas[q.id] ?? ""}
                  onChange={(e) => editar(q.id, e.target.value)}
                  onBlur={() => salvar(notas)}
                  rows={2}
                  placeholder="Notas…"
                  className="input mt-1 w-full"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
