"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CargoHora } from "@/lib/precificacao-bases";
import { excluirCargo, salvarCargo, type CargoEntrada } from "./actions";

const SEN = ["junior", "pleno", "senior"];
const TIPO = ["pj", "clt"];
const vazio: CargoEntrada = { area: "", cargo: "", senioridade: "pleno", tipo_contratacao: "pj", valor_hora: 0 };

/** Lista de cargos e custo/hora: adicionar, editar o valor e remover, pela própria tela. */
export function CargoManager({ cargos }: { cargos: CargoHora[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState<CargoEntrada>(vazio);
  const [valores, setValores] = useState<Record<string, number>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  const rodar = (fn: () => Promise<{ error: string | null }>, apos?: () => void) => {
    setErro(null);
    start(async () => { const r = await fn(); if (r.error) setErro(r.error); else { apos?.(); router.refresh(); } });
  };

  return (
    <div className="mt-3 rounded-xl border border-border-soft">
      <button type="button" onClick={() => setAberto((a) => !a)} className="flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] font-medium">
        Lista de cargos e custo/hora <span className="text-[11px] text-text-faint">{aberto ? "▲" : "▼"}</span>
      </button>
      {aberto && (
        <div className="border-t border-border-soft p-3">
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead><tr className="text-left text-text-faint"><th className="py-1 pr-2 font-medium">Área</th><th className="py-1 pr-2 font-medium">Cargo</th><th className="py-1 pr-2 font-medium">Senioridade</th><th className="py-1 pr-2 font-medium">Contratação</th><th className="py-1 pr-2 text-right font-medium">R$/h</th><th /></tr></thead>
              <tbody>
                {cargos.map((c) => (
                  <tr key={c.id} className="border-t border-border-soft">
                    <td className="py-1 pr-2 text-text-muted">{c.area}</td>
                    <td className="py-1 pr-2 font-medium">{c.cargo}</td>
                    <td className="py-1 pr-2">{c.senioridade}</td>
                    <td className="py-1 pr-2 uppercase">{c.tipo_contratacao}</td>
                    <td className="py-1 pr-2"><input value={valores[c.id] ?? c.valor_hora} onChange={(e) => setValores((v) => ({ ...v, [c.id]: Number(e.target.value.replace(",", ".")) || 0 }))} className="input input-compacto w-20 text-right" inputMode="decimal" /></td>
                    <td className="py-1 whitespace-nowrap text-right">
                      <button type="button" disabled={pendente || (valores[c.id] ?? c.valor_hora) === c.valor_hora} onClick={() => rodar(() => salvarCargo({ id: c.id, area: c.area, cargo: c.cargo, senioridade: c.senioridade, tipo_contratacao: c.tipo_contratacao, valor_hora: valores[c.id] ?? c.valor_hora }))} className="text-[11px] text-primary-deep underline disabled:text-text-faint disabled:no-underline">salvar</button>
                      <button type="button" disabled={pendente} onClick={() => { if (confirm(`Excluir ${c.cargo} (${c.senioridade}, ${c.tipo_contratacao})?`)) rodar(() => excluirCargo(c.id)); }} className="ml-2 text-[11px] text-text-faint hover:text-danger">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
            <input value={novo.area} onChange={(e) => setNovo({ ...novo, area: e.target.value })} placeholder="Área" className="input input-compacto" />
            <input value={novo.cargo} onChange={(e) => setNovo({ ...novo, cargo: e.target.value })} placeholder="Cargo *" className="input input-compacto sm:col-span-2" />
            <select value={novo.senioridade} onChange={(e) => setNovo({ ...novo, senioridade: e.target.value })} className="input input-compacto">{SEN.map((x) => <option key={x} value={x}>{x}</option>)}</select>
            <select value={novo.tipo_contratacao} onChange={(e) => setNovo({ ...novo, tipo_contratacao: e.target.value })} className="input input-compacto">{TIPO.map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select>
            <input value={novo.valor_hora || ""} onChange={(e) => setNovo({ ...novo, valor_hora: Number(e.target.value.replace(",", ".")) || 0 })} placeholder="R$/h" className="input input-compacto text-right" inputMode="decimal" />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button type="button" disabled={pendente || !novo.cargo.trim()} onClick={() => rodar(() => salvarCargo(novo), () => setNovo(vazio))} className="rounded-lg bg-wine-deep px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50">Adicionar cargo</button>
            {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
